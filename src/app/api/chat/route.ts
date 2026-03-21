import { after, NextResponse } from "next/server";
import { z } from "zod";
import { readAgentSetupStateWithToolSelections } from "@/lib/agents/agent-setup-state-server";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { resolveRecommendedPromptVariantForOrganization } from "@/lib/agents/prompt-variant.server";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  readConversationMetadata,
  resolveConversationChatMode,
} from "@/lib/chat/conversation-metadata";
import {
  buildShapedRagContext,
  shapeAgentTurnRequest,
} from "@/lib/chat/request-shaping";
import { resolveOperationalModeDecision } from "@/lib/chat/operational-mode";
import {
  buildStandaloneSemanticSystemPrompt,
  buildStructuredSemanticSystemPrompt,
  resolveStandaloneSemanticTurnPlan,
} from "@/lib/chat/semantic-turns";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import {
  createConversation,
  getConversationById,
  getOrCreateConversation,
  updateConversationMetadata,
} from "@/lib/db/conversations";
import { listAgentTools } from "@/lib/db/agent-tools";
import { insertMessage, insertMessageWithServiceRole, listMessages } from "@/lib/db/messages";
import { checkSessionLimitForConversation } from "@/lib/db/session-usage";
import { recordUsage } from "@/lib/db/usage-writer";
import { LiteLLMError } from "@/lib/llm/litellm";
import {
  resolveProviderFromModel,
  resolveRuntimeModelRoutePolicy,
  type RoutedCompletionMetadata,
} from "@/lib/llm/model-routing";
import type { ChatMessage, ToolDefinition } from "@/lib/llm/litellm-types";
import { sendSemanticCompletion } from "@/lib/llm/semantic-generation";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type { GoogleAgentRuntimeSuccess } from "@/lib/integrations/google-agent-runtime";
import {
  assertSalesforceRuntimeUsable,
  getSalesforceAgentToolRuntime,
  type SalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import {
  executeRuntimeSurfacePlan,
  planRuntimeSurfaceTurn,
  type RuntimeSurfaceAvailability,
} from "@/lib/runtime";
import {
  buildRuntimeSendEmailPreviewForm,
  isRuntimeSendEmailPreviewSubmission,
} from "@/lib/runtime/pre-approval-chat-form";
import { evaluatePreAgentMessagePolicy, evaluateInputPolicy, evaluateOutputPolicy } from "@/lib/policy/agent-policy";
import { getDenylistRules } from "@/lib/policy/denylist";
import type { DenylistRule } from "@/lib/policy/denylist";
import { incrementRateLimit } from "@/lib/redis";
import { buildAgentToolDefinitions } from "@/lib/tools/tool-definitions";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import { insertAuditLog } from "@/lib/db/audit";
import { getOrganizationRuntimeKillSwitchConfig } from "@/lib/db/runtime-migration";
import type { Json } from "@/types/database";
import type { Conversation, Role } from "@/types/app";

const CHAT_RATE_LIMIT_MAX_REQUESTS = 30;
const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;
const CHAT_RAG_TIMEOUT_MS = 1200;
const CHAT_RATE_LIMIT_REDIS_TIMEOUT_MS = 900;

const chatSchema = z.object({
  agentId: z.string().uuid("agentId debe ser un UUID valido"),
  conversationId: z.string().uuid("conversationId debe ser un UUID valido").optional(),
  forceNewConversation: z.boolean().optional(),
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacio")
    .max(4000, "El mensaje no puede superar 4000 caracteres"),
});

type ChatRequestMode = "sandbox" | "live_local";

type ConversationResult = {
  data: Conversation | null;
  error: string | null;
  created?: boolean;
};

function getSafeChatErrorMessage(error: LiteLLMError, model: string): string {
  if (error.errorType === "provider_rate_limit") return `El modelo ${model} no tiene cuota disponible en este momento.`;
  if (error.errorType === "provider_billing") return `La cuenta del proveedor para ${model} no tiene credito suficiente.`;
  if (error.errorType === "provider_auth") return `La credencial configurada para ${model} no es valida.`;
  if (error.errorType === "model_not_available") return `El modelo ${model} no esta disponible en LiteLLM.`;
  if (error.errorType === "request_timeout") return "El proveedor tardo demasiado en responder. Intenta de nuevo.";
  return "El agente no pudo generar una respuesta. Intenta de nuevo.";
}

function buildChatRateLimitKey(organizationId: string): string {
  return `rate_limit:chat:${organizationId}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedio el tiempo maximo`)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}

function canUseSandbox(role: Role): boolean {
  return role === "admin" || role === "editor";
}

function getAllowedStatuses(role: Role): Array<"draft" | "active"> {
  return canUseSandbox(role) ? ["draft", "active"] : ["active"];
}

async function isChatRateLimited(organizationId: string): Promise<boolean> {
  try {
    const currentCount = await withTimeout(
      incrementRateLimit(buildChatRateLimitKey(organizationId), CHAT_RATE_LIMIT_WINDOW_SECONDS),
      CHAT_RATE_LIMIT_REDIS_TIMEOUT_MS,
      "chat.rate_limit"
    );
    return currentCount > CHAT_RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("chat.rate_limit_error", { organizationId, error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

async function resolveConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string,
  chatMode: ChatRequestMode,
  conversationId?: string,
  forceNewConversation = false
): Promise<ConversationResult> {
  if (conversationId) {
    const existing = await getConversationById(conversationId, agentId, organizationId, initiatedBy);
    if (!existing.data || existing.error) return existing;
    if (resolveConversationChatMode(existing.data) !== chatMode) {
      return { data: null, error: "La conversacion no coincide con el modo solicitado", created: false };
    }
    return existing;
  }

  if (forceNewConversation) {
    return createConversation(agentId, organizationId, initiatedBy, {
      channel: "web",
      metadata: { chat_mode: chatMode },
    });
  }

  return getOrCreateConversation(agentId, organizationId, initiatedBy, { chatMode, channel: "web" });
}


async function resolveGoogleRuntime(
  agentId: string,
  organizationId: string,
  surface: "gmail" | "google_calendar" | "google_sheets"
): Promise<GoogleAgentRuntimeSuccess | null> {
  const result = await getGoogleAgentToolRuntimeWithServiceRole(agentId, organizationId, surface);
  if (result.data?.ok) return result.data;
  return null;
}

async function resolveSalesforceRuntime(
  agentId: string,
  organizationId: string
): Promise<SalesforceAgentToolRuntime | null> {
  const result = await getSalesforceAgentToolRuntime(agentId, organizationId);
  if (!result.data || result.error) {
    return null;
  }

  const usableRuntime = assertSalesforceRuntimeUsable(result.data);
  return usableRuntime.data ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) return requestError;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (await isChatRateLimited(session.organizationId)) {
    return NextResponse.json({ error: "Demasiadas solicitudes de chat. Intenta nuevamente en unos segundos." }, { status: 429 });
  }

  const parsedBody = await parseJsonRequestBody(request, chatSchema);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const { agentId, conversationId, forceNewConversation, content } = parsedBody.data;

  const access = await assertAgentAccess({ session, agentId, capability: "use", allowedStatuses: getAllowedStatuses(session.role) });
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const agent = access.agent;
  const chatMode: ChatRequestMode = agent.status === "draft" ? "sandbox" : "live_local";

  if (chatMode === "sandbox" && !canUseSandbox(session.role)) {
    return NextResponse.json({ error: "Solo admin y editor pueden probar agentes en draft." }, { status: 403 });
  }

  const conversationResult = await resolveConversation(
    agentId,
    session.organizationId,
    session.user.id,
    chatMode,
    conversationId,
    forceNewConversation ?? false
  );
  if (conversationResult.error) {
    const status = conversationResult.error === "La conversacion no coincide con el modo solicitado" ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? conversationResult.error : "No se pudo cargar la conversacion" }, { status });
  }
  if (!conversationResult.data) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  const conversation = conversationResult.data;
  const conversationMetadata = readConversationMetadata(conversation.metadata);

  if (
    conversationMetadata.pending_chat_form ||
    conversationMetadata.pending_runtime_clarification
  ) {
    await updateConversationMetadata(
      conversation.id,
      agentId,
      session.organizationId,
      {
        pending_chat_form: null,
        pending_runtime_clarification: null,
      },
      { initiatedBy: session.user.id }
    );
  }

  const planCheck = await checkSessionLimitForConversation({ organizationId: session.organizationId, conversationId: conversation.id });
  if (!planCheck.allowed) return NextResponse.json({ error: planCheck.message ?? "Limite del plan alcanzado" }, { status: 429 });

  const [historyResult, userMessageResult, agentToolsResult, agentHasDocs] = await Promise.all([
    listMessages(conversation.id, session.organizationId),
    insertMessage({ agentId, conversationId: conversation.id, organizationId: session.organizationId, role: "user", content }),
    listAgentTools(agentId, session.organizationId),
    hasReadyDocuments(agentId, session.organizationId),
  ]);

  if (userMessageResult.error) return NextResponse.json({ error: "No se pudo guardar el mensaje" }, { status: 500 });

  const previousMessages: ChatMessage[] = (historyResult.data ?? [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "user") return { role: "user" as const, content: message.content };
      return { role: "assistant" as const, content: message.content };
    });

  const nextMemory: ChatMessage[] = [...previousMessages, { role: "user", content }];
  const agentSetupState = await readAgentSetupStateWithToolSelections(agent, session.organizationId);
  const storedAgentSetupState = readAgentSetupState(agent);

  const prePolicyDecision = evaluatePreAgentMessagePolicy({
    latestUserMessage: content,
    agentScope: agentSetupState?.agentScope ?? "operations",
  });

  if (prePolicyDecision.outcome === "clarify_missing_data" || prePolicyDecision.outcome === "redirect_out_of_scope" || prePolicyDecision.outcome === "deny_security") {
    const msg = prePolicyDecision.userMessage ?? "No pude continuar con ese pedido por una policy del agente.";
    await insertMessageWithServiceRole({ agentId, conversationId: conversation.id, organizationId: session.organizationId, role: "assistant", content: msg });
    return new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": conversation.id, "X-Chat-Mode": chatMode } });
  }

  const agentMetadata = (agent as Record<string, unknown>).metadata as Record<string, unknown> | null;
  const denylistRules = getDenylistRules(agentMetadata);
  const inputPolicy = evaluateInputPolicy(content, denylistRules);
  if (inputPolicy.blocked) {
    const msg = inputPolicy.message ?? "El mensaje fue bloqueado por una regla de seguridad.";
    await insertMessageWithServiceRole({ agentId, conversationId: conversation.id, organizationId: session.organizationId, role: "assistant", content: msg });
    return new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": conversation.id, "X-Chat-Mode": chatMode } });
  }

  const agentTools = agentToolsResult.data ?? [];
  const toolDefinitions: ToolDefinition[] = buildAgentToolDefinitions(agentTools, {
    exposure: "llm_compact",
  });
  const toolSurfacePresence = {
    gmail: toolDefinitions.some((t) => t.function.name.startsWith("gmail_")),
    googleCalendar: toolDefinitions.some((t) => t.function.name.startsWith("google_calendar_")),
    googleSheets: toolDefinitions.some((t) => t.function.name.startsWith("google_sheets_")),
    salesforce: toolDefinitions.some((t) => t.function.name.startsWith("salesforce_")),
  };
  const llmModel = agent.llm_model;
  const llmTemperature = agent.llm_temperature ?? 0.7;
  const defaultMaxTokens = agent.max_tokens ?? 1000;
  const routePolicy = resolveRuntimeModelRoutePolicy(llmModel);

  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: agent.system_prompt,
    setupState: agentSetupState,
    matchSetupState: storedAgentSetupState,
    promptVariant: resolveRecommendedPromptVariantForOrganization(session.organizationId),
    promptEnvironment: {
      gmailConfigured: toolSurfacePresence.gmail,
      gmailRuntimeAvailable: toolSurfacePresence.gmail,
      googleCalendarConfigured: toolSurfacePresence.googleCalendar,
      googleCalendarRuntimeAvailable: toolSurfacePresence.googleCalendar,
      googleSheetsConfigured: toolSurfacePresence.googleSheets,
      googleSheetsRuntimeAvailable: toolSurfacePresence.googleSheets,
    },
    allowConflictCleanupForCustom: true,
  });

  const shapedRequest = shapeAgentTurnRequest({
    effectivePrompt: promptResolution.effectivePrompt,
    promptVariant: promptResolution.promptVariant,
    systemPromptProfile: promptResolution.systemPromptProfile,
    compactPromptCandidate: promptResolution.compactPromptCandidate,
    latestUserMessage: content,
    messages: nextMemory,
    toolDefinitions,
    conversationMetadata,
    defaultMaxTokens,
    hasReadyDocuments: agentHasDocs,
  });
  const selectedToolSurfacePresence = {
    gmail: shapedRequest.selectedToolDefinitions.some((t) => t.function.name.startsWith("gmail_")),
    googleCalendar: shapedRequest.selectedToolDefinitions.some((t) => t.function.name.startsWith("google_calendar_")),
    googleSheets: shapedRequest.selectedToolDefinitions.some((t) => t.function.name.startsWith("google_sheets_")),
    salesforce: shapedRequest.selectedToolDefinitions.some((t) => t.function.name.startsWith("salesforce_")),
  };

  const ragContextResult = await buildShapedRagContext({
    agentId,
    organizationId: session.organizationId,
    latestUserMessage: content,
    ragMode: shapedRequest.ragMode,
    hasReadyDocuments: agentHasDocs,
    maxChunks: shapedRequest.ragMaxChunks,
    maxCharsPerChunk: shapedRequest.ragMaxCharsPerChunk,
    timeoutMs: CHAT_RAG_TIMEOUT_MS,
    logLabel: "chat.rag",
  });

  let runtimes: RuntimeSurfaceAvailability = {
    gmail: null,
    google_calendar: null,
    google_sheets: null,
    salesforce: null,
  };
  const llmCallMetrics: Array<Record<string, string | number | boolean | null | string[]>> = [];
  const runtimeKillSwitchResult = await getOrganizationRuntimeKillSwitchConfig(session.organizationId);
  const runtimeKillSwitch = runtimeKillSwitchResult.data ?? undefined;

  if (
    selectedToolSurfacePresence.gmail ||
    selectedToolSurfacePresence.googleCalendar ||
    selectedToolSurfacePresence.googleSheets ||
    selectedToolSurfacePresence.salesforce
  ) {
    const [gmailRt, calendarRt, sheetsRt, salesforceRt] = await Promise.all([
      selectedToolSurfacePresence.gmail ? resolveGoogleRuntime(agentId, session.organizationId, "gmail") : null,
      selectedToolSurfacePresence.googleCalendar ? resolveGoogleRuntime(agentId, session.organizationId, "google_calendar") : null,
      selectedToolSurfacePresence.googleSheets ? resolveGoogleRuntime(agentId, session.organizationId, "google_sheets") : null,
      selectedToolSurfacePresence.salesforce ? resolveSalesforceRuntime(agentId, session.organizationId) : null,
    ]);
    runtimes = {
      gmail: gmailRt,
      google_calendar: calendarRt,
      google_sheets: sheetsRt,
      salesforce: salesforceRt,
    };
  }


  const runtimePlanning = await planRuntimeSurfaceTurn({
    requestedModel: llmModel,
    organizationId: session.organizationId,
    agentId: agent.id,
    conversationId: conversation.id,
    latestUserMessage: content,
    messages: shapedRequest.messages,
    selectedSurfaces: shapedRequest.selectedSurfaces,
    runtimes,
    killSwitch: runtimeKillSwitch,
    recentActionContext: conversationMetadata.recent_action_context ?? null,
  });

  if (runtimePlanning.plannerAttempted) {
    if (runtimePlanning.plannerPlan && runtimePlanning.plannerMetadata) {
      llmCallMetrics.push({
        phase: "runtime_planner",
        model: runtimePlanning.plannerModel,
        provider: runtimePlanning.plannerProvider,
        tokens_input: runtimePlanning.plannerTokensInput,
        tokens_output: runtimePlanning.plannerTokensOutput,
        confidence: runtimePlanning.plannerPlan.confidence,
        actions: runtimePlanning.plannerPlan.actions.map((action) => action.type),
        missing_fields: runtimePlanning.plannerPlan.missingFields,
      });
    } else if (runtimePlanning.plannerErrorType) {
      llmCallMetrics.push({
        phase: "runtime_planner",
        status: "llm_error",
        error_type: runtimePlanning.plannerErrorType,
      });
    }
  }

  const buildAssistantMetadata = (
    tokensInput: number,
    tokensOutput: number,
    toolLoopIterations: number,
    routing: RoutedCompletionMetadata | null,
    runtimeOutcome: "success" | "needs_user" | "failed" | "blocked" | "waiting_approval" | null = null
  ): Json => {
    const plannerEmptyCount = runtimePlanning.routingDecision.rejectionReason === "planner_empty" ? 1 : 0;
    const clarificationCount = runtimeOutcome === "needs_user" ? 1 : 0;
    const failureCount = runtimeOutcome === "failed" ? 1 : 0;
    const unsupportedActionCount =
      runtimePlanning.routingDecision.rejectionReason === "runtime_unavailable_for_action"
        ? runtimePlanning.routingDecision.unsupportedActions.length
        : 0;

    return ({
      request_shaping: {
        ...shapedRequest.observability,
        ragChunksUsed: ragContextResult.chunksUsed,
        ragCharsUsed: ragContextResult.charsUsed,
      },
      model_routing: routing,
      llm_call_metrics: llmCallMetrics,
      tool_loop_iterations: toolLoopIterations,
      tokens_input_total: tokensInput + runtimePlanning.plannerTokensInput,
      tokens_output_total: tokensOutput + runtimePlanning.plannerTokensOutput,
      runtime_routing: {
        plannerAttempted: runtimePlanning.plannerAttempted,
        plannerErrorType: runtimePlanning.plannerErrorType,
        runtimeDecision: runtimePlanning.routingDecision.runtimeDecision,
        rejectionReason: runtimePlanning.routingDecision.rejectionReason,
        unsupportedActions: runtimePlanning.routingDecision.unsupportedActions,
        actionAvailability: runtimePlanning.routingDecision.actionAvailability,
      },
      runtime_observability: {
        planner_empty_count: plannerEmptyCount,
        runtime_clarification_count: clarificationCount,
        runtime_failure_count: failureCount,
        unsupported_action_count: unsupportedActionCount,
      },
      ...(runtimePlanning.plannerMetadata
        ? {
            runtime_planner: runtimePlanning.plannerMetadata,
          }
        : {}),
    }) as Json;
  };

  const orgId = session.organizationId;
  const convId = conversation.id;
  const currentAgentId = agent.id;
  const responseHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Conversation-Id": conversation.id,
    "X-Chat-Mode": chatMode,
  };

  const runtimeRoutingDecision = runtimePlanning.routingDecision;
  const pendingSendEmailPreview =
    conversationMetadata.pending_chat_form &&
    typeof conversationMetadata.pending_chat_form === "object" &&
    !Array.isArray(conversationMetadata.pending_chat_form) &&
    conversationMetadata.pending_chat_form.action === "send_email";
  const skipSendEmailPreview =
    pendingSendEmailPreview && isRuntimeSendEmailPreviewSubmission(content);
  const runtimeSendEmailPreview =
    !skipSendEmailPreview &&
    runtimeRoutingDecision.runtimeDecision === "accept" &&
    runtimePlanning.plannerPlan?.actions.length === 1 &&
    runtimePlanning.plannerPlan.missingFields.length === 0
      ? buildRuntimeSendEmailPreviewForm(runtimePlanning.plannerPlan.actions[0]!)
      : null;

  if (runtimeSendEmailPreview) {
    const previewAssistantMetadata = {
      ...(buildAssistantMetadata(0, 0, 0, null) as Record<string, unknown>),
      runtime_preview: {
        actionType: "send_email",
        stage: "chat_edit_before_approval",
      },
    } as Json;

    after(async () => {
      try {
        await updateConversationMetadata(
          convId,
          currentAgentId,
          orgId,
          {
            pending_chat_form: runtimeSendEmailPreview,
            pending_runtime_clarification: null,
          },
          { initiatedBy: session.user.id }
        );

        await insertMessageWithServiceRole({
          agentId: currentAgentId,
          conversationId: convId,
          organizationId: orgId,
          role: "assistant",
          content: runtimeSendEmailPreview.message,
          llmModel: runtimePlanning.plannerModel ?? undefined,
          tokensInput: runtimePlanning.plannerTokensInput || undefined,
          tokensOutput: runtimePlanning.plannerTokensOutput || undefined,
          metadata: previewAssistantMetadata,
        });

        if (runtimePlanning.plannerTokensInput > 0 || runtimePlanning.plannerTokensOutput > 0) {
          await recordUsage({
            organizationId: orgId,
            agentId: currentAgentId,
            tokensInput: runtimePlanning.plannerTokensInput,
            tokensOutput: runtimePlanning.plannerTokensOutput,
            llmProvider: runtimePlanning.plannerProvider ?? "unknown",
          });
        }
      } catch (error) {
        console.error("chat.runtime_send_email_preview_persistence_error", {
          conversationId: convId,
          organizationId: orgId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    });

    console.info("chat.request_shaping", {
      conversationId: convId,
      organizationId: orgId,
      metadata: previewAssistantMetadata,
    });

    return new Response(runtimeSendEmailPreview.message, { headers: responseHeaders });
  }

  if (runtimePlanning.plannerAttempted) {
    const runtimeExecution = await executeRuntimeSurfacePlan({
      organizationId: session.organizationId,
      agentId: agent.id,
      conversationId: conversation.id,
      userId: session.user.id,
      messageId: userMessageResult.data?.id,
      latestUserMessage: content,
      requestedModel: llmModel,
      llmTemperature,
      effectiveMaxTokens: shapedRequest.effectiveMaxTokens,
      systemPrompt: buildStructuredSemanticSystemPrompt(shapedRequest.systemPrompt),
      routePolicy,
      conversationMetadata: conversationMetadata as Record<string, unknown>,
      planning: runtimePlanning,
      runtimes,
    });

    if (runtimeExecution) {
      const runtimePostprocessTokensInput = Math.max(
        runtimeExecution.tokensInput - runtimePlanning.plannerTokensInput,
        0
      );
      const runtimePostprocessTokensOutput = Math.max(
        runtimeExecution.tokensOutput - runtimePlanning.plannerTokensOutput,
        0
      );

      if (runtimeExecution.routing && runtimePostprocessTokensInput + runtimePostprocessTokensOutput > 0) {
        llmCallMetrics.push({
          phase: "runtime_postprocess",
          usage_kind: "semantic_summary",
          model: runtimeExecution.llmModel,
          provider: runtimeExecution.llmProvider,
          tokens_input: runtimePostprocessTokensInput,
          tokens_output: runtimePostprocessTokensOutput,
          grounded_in_runtime_evidence: true,
        });
      }

      const runtimeAssistantMetadata = {
        ...(buildAssistantMetadata(
          runtimePostprocessTokensInput,
          runtimePostprocessTokensOutput,
            0,
            runtimeExecution.routing,
            runtimeExecution.outcome === "success" && runtimeExecution.assistantMetadataPatch.runtime &&
              typeof (runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions === "object" &&
              Array.isArray((runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions) &&
              ((runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions as Array<Record<string, unknown>>)
                .some((action) => action.status === "waiting_approval")
              ? "waiting_approval"
              : runtimeExecution.outcome
          ) as Record<string, unknown>),
        ...runtimeExecution.assistantMetadataPatch,
      } as Json;

      const outputPolicy = evaluateOutputPolicy(runtimeExecution.content, denylistRules);
      const safeRuntimeContent = outputPolicy.blocked
        ? (outputPolicy.message ?? "La respuesta fue bloqueada por una regla de seguridad.")
        : runtimeExecution.content;

      after(async () => {
        try {
          await updateConversationMetadata(
            convId,
            currentAgentId,
            orgId,
            runtimeExecution.conversationMetadataPatch as Parameters<typeof updateConversationMetadata>[3],
            { initiatedBy: session.user.id }
          );

          await insertMessageWithServiceRole({
            agentId: currentAgentId,
            conversationId: convId,
            organizationId: orgId,
            role: "assistant",
            content: safeRuntimeContent,
            llmModel: runtimeExecution.llmModel ?? undefined,
            responseTimeMs: runtimeExecution.responseTimeMs ?? undefined,
            tokensInput: runtimeExecution.tokensInput || undefined,
            tokensOutput: runtimeExecution.tokensOutput || undefined,
            metadata: runtimeAssistantMetadata,
          });

          if (
            runtimeExecution.llmProvider &&
            (runtimeExecution.tokensInput > 0 || runtimeExecution.tokensOutput > 0)
          ) {
            await recordUsage({
              organizationId: orgId,
              agentId: currentAgentId,
              tokensInput: runtimeExecution.tokensInput,
              tokensOutput: runtimeExecution.tokensOutput,
              llmProvider: runtimeExecution.llmProvider,
            });
          }

          await insertAuditLog({
            organizationId: orgId,
            userId: session.user.id,
            action: `runtime.${runtimeExecution.primaryActionType ?? "unknown"}.${runtimeExecution.outcome}`,
            resourceType: "conversation",
            resourceId: convId,
            newValue: {
              runtime_run_id: runtimeExecution.runtimeRunId,
              trace_id: runtimeExecution.traceId,
              request_id: runtimeExecution.requestId,
              outcome: runtimeExecution.outcome,
            },
          });
        } catch (error) {
          console.error("chat.runtime_v1_persistence_error", {
            conversationId: convId,
            organizationId: orgId,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      });

      console.info("chat.request_shaping", {
        conversationId: convId,
        organizationId: orgId,
        metadata: runtimeAssistantMetadata,
      });

      return new Response(safeRuntimeContent, { headers: responseHeaders });
    }
  }

  const operationalModeDecision = resolveOperationalModeDecision({
    shapedRequest,
  });

  if (operationalModeDecision.kind !== "allow_consultive_llm") {
    llmCallMetrics.push({
      phase: "operational_gate",
      status: operationalModeDecision.kind,
      surfaces: shapedRequest.selectedSurfaces,
    });

    const assistantMetadata = {
      ...(buildAssistantMetadata(0, 0, 0, null) as Record<string, unknown>),
    } as Json;

    after(async () => {
      try {
        await insertMessageWithServiceRole({
          agentId: currentAgentId,
          conversationId: convId,
          organizationId: orgId,
          role: "assistant",
          content: operationalModeDecision.message,
          llmModel: runtimePlanning.plannerModel ?? undefined,
          tokensInput: runtimePlanning.plannerTokensInput || undefined,
          tokensOutput: runtimePlanning.plannerTokensOutput || undefined,
          metadata: assistantMetadata,
        });

        if (runtimePlanning.plannerTokensInput > 0 || runtimePlanning.plannerTokensOutput > 0) {
          await recordUsage({
            organizationId: orgId,
            agentId: currentAgentId,
            tokensInput: runtimePlanning.plannerTokensInput,
            tokensOutput: runtimePlanning.plannerTokensOutput,
            llmProvider: runtimePlanning.plannerProvider ?? "unknown",
          });
        }
      } catch (error) {
        console.error("chat.operational_gate_persistence_error", {
          conversationId: convId,
          organizationId: orgId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    });

    console.info("chat.request_shaping", {
      conversationId: convId,
      organizationId: orgId,
      metadata: assistantMetadata,
    });

    return new Response(operationalModeDecision.message, { headers: responseHeaders });
  }

  const semanticPlan = resolveStandaloneSemanticTurnPlan({
    shapedRequest,
    latestUserMessage: content,
  });

  let semanticResult;
  try {
    semanticResult = await sendSemanticCompletion({
      usageKind: semanticPlan.usageKind,
      requestedModel: llmModel,
      policy: routePolicy,
      chatInput: {
        systemPrompt: buildStandaloneSemanticSystemPrompt(shapedRequest.systemPrompt),
        messages: shapedRequest.messages,
        temperature: llmTemperature,
        maxTokens: shapedRequest.effectiveMaxTokens,
        organizationId: session.organizationId,
        agentId: agent.id,
        conversationId: conversation.id,
        context: ragContextResult.context,
      },
    });

    llmCallMetrics.push({
      phase: "semantic_standalone",
      usage_kind: semanticResult.usageKind,
      model: semanticResult.output.model,
      provider: resolveProviderFromModel(semanticResult.output.model),
      tokens_input: semanticResult.output.tokensInput,
      tokens_output: semanticResult.output.tokensOutput,
    });
  } catch (error) {
    if (error instanceof LiteLLMError) {
      return NextResponse.json({ error: getSafeChatErrorMessage(error, llmModel) }, { status: error.status === "rate_limited" ? 429 : 502 });
    }
    return NextResponse.json({ error: "El agente no pudo generar una respuesta. Intenta de nuevo." }, { status: 502 });
  }

  const outputPolicy = evaluateOutputPolicy(semanticResult.output.content, denylistRules);
  const finalContent = outputPolicy.blocked
    ? (outputPolicy.message ?? "La respuesta fue bloqueada por una regla de seguridad.")
    : semanticResult.output.content;
  const assistantMetadata = {
      ...(buildAssistantMetadata(
        semanticResult.output.tokensInput,
        semanticResult.output.tokensOutput,
        0,
        semanticResult.routing
      ) as Record<string, unknown>),
    semantic_generation: {
      usageKind: semanticResult.usageKind,
      mode: semanticPlan.mode,
      groundedInStructuredEvidence: false,
    },
  } as Json;

  after(async () => {
    try {
      await insertMessageWithServiceRole({
        agentId: currentAgentId,
        conversationId: convId,
        organizationId: orgId,
        role: "assistant",
        content: finalContent,
        llmModel: semanticResult.output.model,
        responseTimeMs: semanticResult.output.responseTimeMs,
        tokensInput: semanticResult.output.tokensInput + runtimePlanning.plannerTokensInput,
        tokensOutput: semanticResult.output.tokensOutput + runtimePlanning.plannerTokensOutput,
        metadata: assistantMetadata,
      });

      await recordUsage({
        organizationId: orgId,
        agentId: currentAgentId,
        tokensInput: semanticResult.output.tokensInput + runtimePlanning.plannerTokensInput,
        tokensOutput: semanticResult.output.tokensOutput + runtimePlanning.plannerTokensOutput,
        llmProvider: resolveProviderFromModel(semanticResult.output.model),
      });

      console.info("chat.request_shaping", {
        conversationId: convId,
        organizationId: orgId,
        metadata: assistantMetadata,
      });
    } catch (error) {
      console.error("chat.post_semantic_persistence_error", {
        conversationId: convId,
        organizationId: orgId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return new Response(finalContent, { headers: responseHeaders });
}
