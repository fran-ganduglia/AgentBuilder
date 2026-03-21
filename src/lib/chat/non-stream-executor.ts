import "server-only";

import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { readAgentSetupStateWithToolSelections } from "@/lib/agents/agent-setup-state-server";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { resolveRecommendedPromptVariantForOrganization } from "@/lib/agents/prompt-variant.server";
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
import { prepareWhatsAppUnifiedTurn } from "@/lib/chat/whatsapp-unified";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getConversationByIdWithServiceRole } from "@/lib/db/conversations";
import { listAgentToolsWithServiceRole } from "@/lib/db/agent-tools-service";
import { checkSessionLimitForConversation } from "@/lib/db/session-usage";
import { getOrganizationRuntimeKillSwitchConfig } from "@/lib/db/runtime-migration";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type { GoogleAgentRuntimeSuccess } from "@/lib/integrations/google-agent-runtime";
import {
  assertSalesforceRuntimeUsable,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { LiteLLMError } from "@/lib/llm/litellm";
import {
  resolveProviderFromModel,
  resolveRuntimeModelRoutePolicy,
  type RoutedCompletionMetadata,
} from "@/lib/llm/model-routing";
import type { ChatMessage, ToolDefinition } from "@/lib/llm/litellm-types";
import { sendSemanticCompletion } from "@/lib/llm/semantic-generation";
import { evaluatePreAgentMessagePolicy, evaluateInputPolicy, evaluateOutputPolicy } from "@/lib/policy/agent-policy";
import { getDenylistRules } from "@/lib/policy/denylist";
import type { DenylistRule } from "@/lib/policy/denylist";
import {
  executeRuntimeSurfacePlan,
  planRuntimeSurfaceTurn,
  type RuntimeSurfaceAvailability,
} from "@/lib/runtime";
import { buildAgentToolDefinitions } from "@/lib/tools/tool-definitions";
import type { Json } from "@/types/database";
import type { Agent, Conversation, Organization } from "@/types/app";

const RUN_RAG_TIMEOUT_MS = 1200;

type OrganizationPlan = Pick<Organization, "plan_id" | "is_active" | "deleted_at" | "settings">;

export type NonStreamingAssistantReply = {
  content: string;
  llmModel: string | null;
  llmProvider: string | null;
  responseTimeMs: number | null;
  tokensInput: number;
  tokensOutput: number;
  conversationMetadataPatch?: Record<string, unknown>;
  messageMetadata?: Json;
};

export type ExecuteNonStreamingAgentTurnResult =
  | { ok: true; agent: Agent; conversation: Conversation; reply: NonStreamingAssistantReply }
  | { ok: false; status: number; error: string };

async function loadOperationalAgent(
  agentId: string,
  organizationId: string
): Promise<{ agent: Agent | null; error: string | null; status: number | null }> {
  const serviceClient = createServiceSupabaseClient();
  const { data: organizationData } = await serviceClient
    .from("organizations").select("plan_id, is_active, deleted_at, settings").eq("id", organizationId).maybeSingle();

  const organization = organizationData as OrganizationPlan | null;
  if (!organization || organization.is_active === false || organization.deleted_at) {
    return { agent: null, error: "La organizacion no esta disponible", status: 403 };
  }

  const { data, error } = await serviceClient
    .from("agents").select("*").eq("id", agentId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();

  if (error) return { agent: null, error: "Error al cargar el agente", status: 404 };
  if (!data) return { agent: null, error: "Agente no encontrado", status: 404 };

  const agent = data as Agent;
  const isActive = Reflect.get(agent as Record<string, unknown>, "is_active");
  if (agent.status !== "active" || isActive === false) return { agent: null, error: "El agente no esta disponible", status: 403 };

  return { agent, error: null, status: null };
}

async function loadMessagesFromDb(conversationId: string, organizationId: string): Promise<ChatMessage[]> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("messages").select("role, content")
    .eq("conversation_id", conversationId).eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(20);

  if (error || !data) return [];
  return (data as Array<{ role: string; content: string }>)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .reverse()
    .map((row) => {
      if (row.role === "user") return { role: "user" as const, content: row.content };
      return { role: "assistant" as const, content: row.content };
    });
}

function getSafeErrorMessage(error: LiteLLMError, model: string): string {
  if (error.errorType === "provider_rate_limit") return `El modelo ${model} no tiene cuota disponible en este momento.`;
  if (error.errorType === "provider_billing") return `La cuenta del proveedor para ${model} no tiene credito suficiente.`;
  if (error.errorType === "provider_auth") return `La credencial configurada para ${model} no es valida.`;
  if (error.errorType === "model_not_available") return `El modelo ${model} no esta disponible en LiteLLM.`;
  if (error.errorType === "request_timeout") return "El proveedor tardo demasiado en responder. Intenta de nuevo.";
  return "El agente no pudo generar una respuesta. Intenta de nuevo.";
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
): Promise<Awaited<ReturnType<typeof assertSalesforceRuntimeUsable>>["data"] | null> {
  const result = await getSalesforceAgentToolRuntime(agentId, organizationId);
  if (!result.data || result.error) {
    return null;
  }

  const usableRuntime = assertSalesforceRuntimeUsable(result.data);
  return usableRuntime.data ?? null;
}

export async function executeNonStreamingAgentTurn(input: {
  agentId: string;
  organizationId: string;
  conversationId: string;
  latestUserMessage: string;
  orchestrationUserId?: string;
}): Promise<ExecuteNonStreamingAgentTurnResult> {
  const agentLoad = await loadOperationalAgent(input.agentId, input.organizationId);
  if (agentLoad.error || !agentLoad.agent) {
    return { ok: false, status: agentLoad.status ?? 404, error: agentLoad.error ?? "Agente no encontrado" };
  }

  const conversationResult = await getConversationByIdWithServiceRole(input.conversationId, input.agentId, input.organizationId);
  if (conversationResult.error || !conversationResult.data) {
    return { ok: false, status: 404, error: "Conversacion no encontrada" };
  }

  const agent = agentLoad.agent;
  const conversation = conversationResult.data;
  const routePolicy = resolveRuntimeModelRoutePolicy(agent.llm_model);

  const planCheck = await checkSessionLimitForConversation({ organizationId: input.organizationId, conversationId: conversation.id });
  if (!planCheck.allowed) return { ok: false, status: 429, error: planCheck.message ?? "Limite del plan alcanzado" };

  const [dbHistory, agentToolsResult, agentHasDocs] = await Promise.all([
    loadMessagesFromDb(conversation.id, input.organizationId),
    listAgentToolsWithServiceRole(input.agentId, input.organizationId),
    hasReadyDocuments(input.agentId, input.organizationId),
  ]);

  const agentSetupState = await readAgentSetupStateWithToolSelections(agent, input.organizationId);
  const storedAgentSetupState = readAgentSetupState(agent);

  if (
    agentSetupState?.template_id === "whatsapp_unified" &&
    conversation.channel === "whatsapp" &&
    resolveConversationChatMode(conversation) === "live_external"
  ) {
    const conversationMetadata = readConversationMetadata(conversation.metadata);
    const prepared = await prepareWhatsAppUnifiedTurn({
      agent,
      conversation,
      organizationId: input.organizationId,
      latestUserMessage: input.latestUserMessage,
      currentMetadata: conversationMetadata,
    });

    if (prepared.kind === "respond_now") {
      return {
        ok: true,
        agent,
        conversation,
        reply: {
          content: prepared.content,
          llmModel: null,
          llmProvider: null,
          responseTimeMs: null,
          tokensInput: 0,
          tokensOutput: 0,
          conversationMetadataPatch: prepared.conversationMetadataPatch,
        },
      };
    }

    try {
      const semantic = await sendSemanticCompletion({
        usageKind: "general_consultive_reply",
        requestedModel: agent.llm_model,
        policy: routePolicy,
        chatInput: {
          systemPrompt: buildStandaloneSemanticSystemPrompt(prepared.systemPrompt),
          messages: dbHistory,
          temperature: agent.llm_temperature ?? 0.7,
          maxTokens: agent.max_tokens ?? 1000,
          organizationId: input.organizationId,
          agentId: input.agentId,
          conversationId: conversation.id,
        },
      });
      const llmOutput = semantic.output;
      return {
        ok: true,
        agent,
        conversation,
        reply: {
          content: llmOutput.content,
          llmModel: llmOutput.model,
          llmProvider: resolveProviderFromModel(llmOutput.model),
          responseTimeMs: llmOutput.responseTimeMs,
          tokensInput: llmOutput.tokensInput,
          tokensOutput: llmOutput.tokensOutput,
          conversationMetadataPatch: prepared.conversationMetadataPatch,
          messageMetadata: {
            model_routing: semantic.routing,
            semantic_generation: {
              usageKind: semantic.usageKind,
              mode: "standalone",
              groundedInStructuredEvidence: false,
            },
          } as Json,
        },
      };
    } catch (error) {
      if (error instanceof LiteLLMError) return { ok: false, status: error.status === "rate_limited" ? 429 : 502, error: getSafeErrorMessage(error, agent.llm_model) };
      return { ok: false, status: 502, error: "El agente no pudo generar una respuesta. Intenta de nuevo." };
    }
  }

  const prePolicyDecision = evaluatePreAgentMessagePolicy({
    latestUserMessage: input.latestUserMessage,
    agentScope: agentSetupState?.agentScope ?? "operations",
  });
  if (prePolicyDecision.outcome === "clarify_missing_data" || prePolicyDecision.outcome === "redirect_out_of_scope" || prePolicyDecision.outcome === "deny_security") {
    return { ok: true, agent, conversation, reply: { content: prePolicyDecision.userMessage ?? "No pude continuar con ese pedido.", llmModel: null, llmProvider: null, responseTimeMs: null, tokensInput: 0, tokensOutput: 0 } };
  }

  const agentMetadata = (agent as Record<string, unknown>).metadata as Record<string, unknown> | null;
  const denylistRules = getDenylistRules(agentMetadata);
  const inputCheck = evaluateInputPolicy(input.latestUserMessage, denylistRules);
  if (inputCheck.blocked) {
    return { ok: true, agent, conversation, reply: { content: inputCheck.message ?? "Bloqueado por regla de seguridad.", llmModel: null, llmProvider: null, responseTimeMs: null, tokensInput: 0, tokensOutput: 0 } };
  }

  const toolDefinitions: ToolDefinition[] = buildAgentToolDefinitions(agentToolsResult.data ?? [], {
    exposure: "llm_compact",
  });

  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: agent.system_prompt,
    setupState: agentSetupState,
    matchSetupState: storedAgentSetupState,
    promptVariant: resolveRecommendedPromptVariantForOrganization(input.organizationId),
    promptEnvironment: {
      gmailConfigured: toolDefinitions.some((tool) => tool.function.name.startsWith("gmail_")),
      gmailRuntimeAvailable: toolDefinitions.some((tool) => tool.function.name.startsWith("gmail_")),
      googleCalendarConfigured: toolDefinitions.some((tool) => tool.function.name.startsWith("google_calendar_")),
      googleCalendarRuntimeAvailable: toolDefinitions.some((tool) => tool.function.name.startsWith("google_calendar_")),
      googleSheetsConfigured: toolDefinitions.some((tool) => tool.function.name.startsWith("google_sheets_")),
      googleSheetsRuntimeAvailable: toolDefinitions.some((tool) => tool.function.name.startsWith("google_sheets_")),
    },
    allowConflictCleanupForCustom: true,
  });

  const conversationMetadata = readConversationMetadata(conversation.metadata);
  const shapedRequest = shapeAgentTurnRequest({
    effectivePrompt: promptResolution.effectivePrompt,
    promptVariant: promptResolution.promptVariant,
    systemPromptProfile: promptResolution.systemPromptProfile,
    compactPromptCandidate: promptResolution.compactPromptCandidate,
    latestUserMessage: input.latestUserMessage,
    messages: dbHistory,
    toolDefinitions,
    conversationMetadata,
    defaultMaxTokens: agent.max_tokens ?? 1000,
    hasReadyDocuments: agentHasDocs,
  });

  const ragContextResult = await buildShapedRagContext({
    agentId: input.agentId,
    organizationId: input.organizationId,
    latestUserMessage: input.latestUserMessage,
    ragMode: shapedRequest.ragMode,
    hasReadyDocuments: agentHasDocs,
    maxChunks: shapedRequest.ragMaxChunks,
    maxCharsPerChunk: shapedRequest.ragMaxCharsPerChunk,
    timeoutMs: RUN_RAG_TIMEOUT_MS,
    logLabel: "run.rag",
  });

  let runtimeRuntimes: RuntimeSurfaceAvailability = {
    gmail: null,
    google_calendar: null,
    google_sheets: null,
    salesforce: null,
  };

  if (
    shapedRequest.selectedToolDefinitions.some((tool) =>
      tool.function.name.startsWith("gmail_") ||
      tool.function.name.startsWith("google_calendar_") ||
      tool.function.name.startsWith("google_sheets_") ||
      tool.function.name.startsWith("salesforce_")
    )
  ) {
    const [gmailRt, calendarRt, sheetsRt, salesforceRt] = await Promise.all([
      shapedRequest.selectedToolDefinitions.some((tool) => tool.function.name.startsWith("gmail_")) ? resolveGoogleRuntime(input.agentId, input.organizationId, "gmail") : null,
      shapedRequest.selectedToolDefinitions.some((tool) => tool.function.name.startsWith("google_calendar_")) ? resolveGoogleRuntime(input.agentId, input.organizationId, "google_calendar") : null,
      shapedRequest.selectedToolDefinitions.some((tool) => tool.function.name.startsWith("google_sheets_")) ? resolveGoogleRuntime(input.agentId, input.organizationId, "google_sheets") : null,
      shapedRequest.selectedToolDefinitions.some((tool) => tool.function.name.startsWith("salesforce_")) ? resolveSalesforceRuntime(input.agentId, input.organizationId) : null,
    ]);
    runtimeRuntimes = {
      gmail: gmailRt,
      google_calendar: calendarRt,
      google_sheets: sheetsRt,
      salesforce: salesforceRt,
    };
  }

  const llmCallMetrics: Array<Record<string, string | number | boolean | null | string[]>> = [];
  const runtimePlanning = await planRuntimeSurfaceTurn({
    requestedModel: agent.llm_model,
    organizationId: input.organizationId,
    agentId: input.agentId,
    conversationId: conversation.id,
    latestUserMessage: input.latestUserMessage,
    messages: shapedRequest.messages,
    selectedSurfaces: shapedRequest.selectedSurfaces,
    runtimes: runtimeRuntimes,
    killSwitch: (await getOrganizationRuntimeKillSwitchConfig(input.organizationId)).data ?? undefined,
    recentActionContext: conversationMetadata.recent_action_context ?? null,
  });

  // Cost guardrail: bloquear si el agente superó su budget mensual de acciones
  if (runtimePlanning.plannerAttempted && runtimePlanning.plannerPlan && runtimePlanning.plannerPlan.actions.length > 0) {
    const agentSettings = (agent as Record<string, unknown>).settings as Record<string, unknown> | null;
    const monthlyBudget = typeof agentSettings?.monthly_action_budget === "number"
      ? agentSettings.monthly_action_budget
      : null;

    if (monthlyBudget !== null && monthlyBudget > 0) {
      const serviceClient = createServiceSupabaseClient();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await serviceClient
        .from("runtime_runs")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", input.agentId)
        .eq("organization_id", input.organizationId)
        .eq("status", "completed")
        .gte("created_at", monthStart);

      if (typeof count === "number" && count >= monthlyBudget) {
        return {
          ok: true,
          agent,
          conversation,
          reply: {
            content: `El agente alcanzo el limite de ${monthlyBudget} acciones para este mes. Contacta a tu administrador para ajustar el presupuesto.`,
            llmModel: null,
            llmProvider: null,
            responseTimeMs: null,
            tokensInput: 0,
            tokensOutput: 0,
          },
        };
      }
    }
  }

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
  ): Json => ({
    runtime_observability: {
      planner_empty_count: runtimePlanning.routingDecision.rejectionReason === "planner_empty" ? 1 : 0,
      runtime_clarification_count: runtimeOutcome === "needs_user" ? 1 : 0,
      runtime_failure_count: runtimeOutcome === "failed" ? 1 : 0,
      unsupported_action_count:
        runtimePlanning.routingDecision.rejectionReason === "runtime_unavailable_for_action"
          ? runtimePlanning.routingDecision.unsupportedActions.length
          : 0,
    },
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
    ...(runtimePlanning.plannerMetadata
      ? {
          runtime_planner: runtimePlanning.plannerMetadata,
        }
      : {}),
  }) as Json;

  let finalContent = "";
  let finalResponseTimeMs: number | null = null;
  let finalModel: string | null = null;
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let routingMetadata: RoutedCompletionMetadata | null = null;
  let standaloneSemanticUsageKind: string | null = null;

  if (runtimePlanning.plannerAttempted) {
    const runtimeExecution = await executeRuntimeSurfacePlan({
      organizationId: input.organizationId,
      agentId: input.agentId,
      conversationId: conversation.id,
      channel:
        conversation.channel === "web" ||
        conversation.channel === "whatsapp" ||
        conversation.channel === "email" ||
        conversation.channel === "api"
          ? conversation.channel
          : undefined,
      userId: input.orchestrationUserId ?? input.organizationId,
      latestUserMessage: input.latestUserMessage,
      requestedModel: agent.llm_model,
      llmTemperature: agent.llm_temperature ?? 0.7,
      effectiveMaxTokens: shapedRequest.effectiveMaxTokens,
      systemPrompt: buildStructuredSemanticSystemPrompt(shapedRequest.systemPrompt),
      routePolicy,
      conversationMetadata: conversationMetadata as Record<string, unknown>,
      planning: runtimePlanning,
      runtimes: runtimeRuntimes,
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

      const outputCheck = evaluateOutputPolicy(runtimeExecution.content, denylistRules);
      const finalRuntimeContent = outputCheck.blocked
        ? (outputCheck.message ?? "La respuesta fue bloqueada por una regla de seguridad.")
        : runtimeExecution.content;

      return {
        ok: true,
        agent,
        conversation,
        reply: {
          content: finalRuntimeContent,
          llmModel: runtimeExecution.llmModel,
          llmProvider: runtimeExecution.llmProvider,
          responseTimeMs: runtimeExecution.responseTimeMs,
          tokensInput: runtimeExecution.tokensInput,
          tokensOutput: runtimeExecution.tokensOutput,
          conversationMetadataPatch: runtimeExecution.conversationMetadataPatch,
          messageMetadata: {
            ...(buildAssistantMetadata(
              runtimePostprocessTokensInput,
              runtimePostprocessTokensOutput,
              0,
              runtimeExecution.routing,
              runtimeExecution.outcome === "success" &&
                runtimeExecution.assistantMetadataPatch.runtime &&
                typeof (runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions === "object" &&
                Array.isArray((runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions) &&
                ((runtimeExecution.assistantMetadataPatch.runtime as Record<string, unknown>).actions as Array<Record<string, unknown>>)
                  .some((action) => action.status === "waiting_approval")
                ? "waiting_approval"
                : runtimeExecution.outcome
            ) as Record<string, unknown>),
            ...runtimeExecution.assistantMetadataPatch,
          } as Json,
        },
      };
    }
  }

  try {
    // Si el planner ya intentó resolver esta request (aunque no generara un plan útil),
    // saltamos el operational gate para no bloquear con clarify_with_ui.
    const operationalModeDecision = runtimePlanning.plannerAttempted
      ? { kind: "allow_consultive_llm" as const }
      : resolveOperationalModeDecision({ shapedRequest });

    if (operationalModeDecision.kind !== "allow_consultive_llm") {
      llmCallMetrics.push({
        phase: "operational_gate",
        status: operationalModeDecision.kind,
        surfaces: shapedRequest.selectedSurfaces,
      });

      const messageMetadata = buildAssistantMetadata(0, 0, 0, null);

      console.info("run.request_shaping", {
        conversationId: conversation.id,
        organizationId: input.organizationId,
        metadata: messageMetadata,
      });

      return {
        ok: true,
        agent,
        conversation,
        reply: {
          content: operationalModeDecision.message,
          llmModel: null,
          llmProvider: null,
          responseTimeMs: null,
          tokensInput: 0,
          tokensOutput: 0,
          messageMetadata,
        },
      };
    }

    const semanticPlan = resolveStandaloneSemanticTurnPlan({
      shapedRequest,
      latestUserMessage: input.latestUserMessage,
    });
    standaloneSemanticUsageKind = semanticPlan.usageKind;
    const semanticResult = await sendSemanticCompletion({
      usageKind: semanticPlan.usageKind,
      requestedModel: agent.llm_model,
      policy: routePolicy,
      chatInput: {
        systemPrompt: buildStandaloneSemanticSystemPrompt(shapedRequest.systemPrompt),
        messages: shapedRequest.messages,
        temperature: agent.llm_temperature ?? 0.7,
        maxTokens: shapedRequest.effectiveMaxTokens,
        organizationId: input.organizationId,
        agentId: input.agentId,
        conversationId: conversation.id,
        context: ragContextResult.context,
      },
    });

    totalTokensInput = semanticResult.output.tokensInput;
    totalTokensOutput = semanticResult.output.tokensOutput;
    finalContent = semanticResult.output.content;
    finalResponseTimeMs = semanticResult.output.responseTimeMs;
    finalModel = semanticResult.output.model;
    routingMetadata = semanticResult.routing;
    llmCallMetrics.push({
      phase: "semantic_standalone",
      usage_kind: semanticResult.usageKind,
      model: semanticResult.output.model,
      provider: resolveProviderFromModel(semanticResult.output.model),
      tokens_input: semanticResult.output.tokensInput,
      tokens_output: semanticResult.output.tokensOutput,
    });
  } catch (error) {
    if (error instanceof LiteLLMError) return { ok: false, status: error.status === "rate_limited" ? 429 : 502, error: getSafeErrorMessage(error, agent.llm_model) };
    return { ok: false, status: 502, error: "El agente no pudo generar una respuesta. Intenta de nuevo." };
  }

  const outputCheck = evaluateOutputPolicy(finalContent, denylistRules);
  if (outputCheck.blocked) {
    finalContent = outputCheck.message ?? "La respuesta fue bloqueada por una regla de seguridad.";
  }

  const messageMetadata = {
    ...(buildAssistantMetadata(totalTokensInput, totalTokensOutput, 0, routingMetadata) as Record<string, unknown>),
    semantic_generation: {
      usageKind: standaloneSemanticUsageKind,
      mode: "standalone",
      groundedInStructuredEvidence: false,
    },
  } as Json;
  console.info("run.request_shaping", {
    conversationId: conversation.id,
    organizationId: input.organizationId,
    metadata: messageMetadata,
  });

  return {
    ok: true,
    agent,
    conversation,
    reply: {
      content: finalContent,
      llmModel: finalModel ?? agent.llm_model,
      llmProvider: resolveProviderFromModel(finalModel ?? agent.llm_model),
      responseTimeMs: finalResponseTimeMs,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      messageMetadata,
    },
  };
}
