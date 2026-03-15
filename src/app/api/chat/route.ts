import { after, NextResponse } from "next/server";
import { z } from "zod";
import { setupStateExpectsGmailIntegration } from "@/lib/agents/gmail-agent-integration";
import { setupStateExpectsGoogleCalendarIntegration } from "@/lib/agents/google-calendar-agent-integration";
import { isSalesforceTemplateId } from "@/lib/agents/agent-templates";
import {
  buildAmbiguousScopeResponse,
  buildOutOfScopeResponse,
  classifyScopeIntent,
} from "@/lib/agents/agent-scope";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { resolveConversationChatMode } from "@/lib/chat/conversation-metadata";
import {
  buildChatFormGuidance,
} from "@/lib/chat/inline-forms";
import {
  buildGmailPromptInjectionGuardrail,
  orchestrateGoogleGmailForChat,
} from "@/lib/chat/google-gmail-tool-orchestrator";
import { orchestrateGoogleCalendarForChat } from "@/lib/chat/google-calendar-tool-orchestrator";
import { orchestrateSalesforceForChat } from "@/lib/chat/salesforce-tool-orchestrator";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getConversationById, getOrCreateConversation } from "@/lib/db/conversations";
import { insertMessage, insertMessageWithServiceRole, listMessages } from "@/lib/db/messages";
import { insertPlanLimitNotification } from "@/lib/db/notifications-writer";
import { formatChunksAsContext, searchChunks } from "@/lib/db/rag";
import { checkSessionLimitForConversation } from "@/lib/db/session-usage";
import { recordUsage } from "@/lib/db/usage-writer";
import { generateEmbedding } from "@/lib/llm/embeddings";
import { LiteLLMError, sendStreamingChatCompletion } from "@/lib/llm/litellm";
import { incrementRateLimit } from "@/lib/redis";
import { getGoogleAgentToolRuntime } from "@/lib/integrations/google-agent-runtime";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import type { Conversation, Role } from "@/types/app";

const CHAT_RATE_LIMIT_MAX_REQUESTS = 30;
const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;
const CHAT_MEMORY_MAX_MESSAGES = 20;
const CHAT_RAG_TIMEOUT_MS = 1200;
const CHAT_RATE_LIMIT_REDIS_TIMEOUT_MS = 900;
const CHAT_OBSERVABILITY_SLOW_REQUEST_MS = 5000;

const chatSchema = z.object({
  agentId: z.string().uuid("agentId debe ser un UUID valido"),
  conversationId: z.string().uuid("conversationId debe ser un UUID valido").optional(),
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacio")
    .max(4000, "El mensaje no puede superar 4000 caracteres"),
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
type ChatRequestMode = "sandbox" | "live_local";

type ConversationResult = {
  data: Conversation | null;
  error: string | null;
  created?: boolean;
};

type ChatExecutionConfig = {
  systemPrompt: string;
  llmModel: string;
  llmTemperature: number;
  maxTokens: number;
  llmProvider: string;
};

type ChatStageTimings = {
  historyMs: number | null;
  ragMs: number | null;
  persistUserMessageMs: number | null;
  salesforceOrchestrationMs: number | null;
  gmailOrchestrationMs: number | null;
  googleCalendarOrchestrationMs: number | null;
  googleRuntimeChecksMs: number | null;
  promptResolutionMs: number | null;
  llmReadyMs: number | null;
};

function getSafeChatErrorMessage(error: LiteLLMError, model: string): string {
  if (error.errorType === "provider_rate_limit") {
    return `El modelo ${model} no tiene cuota disponible en este momento. Proba con Gemini Pro o revisa la cuota del proveedor.`;
  }

  if (error.errorType === "provider_billing") {
    return `La cuenta del proveedor para ${model} no tiene credito suficiente en este momento.`;
  }

  if (error.errorType === "provider_auth") {
    return `La credencial configurada para ${model} no es valida o no tiene acceso.`;
  }

  if (error.errorType === "model_not_available") {
    return `El modelo ${model} no esta disponible en LiteLLM ahora mismo.`;
  }

  if (error.errorType === "request_timeout") {
    return "El proveedor tardo demasiado en responder. Intenta de nuevo.";
  }

  return "El agente no pudo generar una respuesta. Intenta de nuevo.";
}

function buildChatRateLimitKey(organizationId: string): string {
  return `rate_limit:chat:${organizationId}`;
}

function trimChatMemory(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_MEMORY_MAX_MESSAGES);
}

function createTimeoutError(label: string): Error {
  return new Error(`${label} excedio el tiempo maximo`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(createTimeoutError(label));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function resolveLlmProvider(model: string): string {
  if (model.startsWith("gpt-")) {
    return "openai";
  }

  if (model.startsWith("claude-")) {
    return "anthropic";
  }

  if (model.startsWith("gemini-") || model === "gemini-pro") {
    return "gemini";
  }

  return "custom";
}

function canUseSandbox(role: Role): boolean {
  return role === "admin" || role === "editor";
}

function getAllowedStatuses(role: Role): Array<"draft" | "active"> {
  return canUseSandbox(role) ? ["draft", "active"] : ["active"];
}

function resolveExecutionConfig(
  agent: {
    system_prompt: string;
    llm_model: string;
    llm_temperature: number | null;
    max_tokens: number | null;
    llm_provider: string;
  }
): ChatExecutionConfig {
  return {
    systemPrompt: agent.system_prompt,
    llmModel: agent.llm_model,
    llmTemperature: agent.llm_temperature ?? 0.7,
    maxTokens: agent.max_tokens ?? 1000,
    llmProvider: agent.llm_provider || resolveLlmProvider(agent.llm_model),
  };
}

async function isChatRateLimited(organizationId: string): Promise<boolean> {
  try {
    const currentCount = await withTimeout(
      incrementRateLimit(
        buildChatRateLimitKey(organizationId),
        CHAT_RATE_LIMIT_WINDOW_SECONDS
      ),
      CHAT_RATE_LIMIT_REDIS_TIMEOUT_MS,
      "chat.rate_limit"
    );

    return currentCount > CHAT_RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("chat.rate_limit_error", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return false;
  }
}

async function buildRagContext(
  agentId: string,
  organizationId: string,
  content: string
): Promise<string | undefined> {
  try {
    return await withTimeout(
      (async () => {
        const agentHasDocs = await hasReadyDocuments(agentId, organizationId);

        if (!agentHasDocs) {
          return undefined;
        }

        const embedding = await generateEmbedding(content);
        const chunks = await searchChunks(organizationId, agentId, embedding, 5, 0.7);

        if (chunks.length === 0) {
          return undefined;
        }

        return formatChunksAsContext(chunks);
      })(),
      CHAT_RAG_TIMEOUT_MS,
      "chat.rag"
    );
  } catch (error) {
    console.error("chat.rag_error", {
      agentId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return undefined;
  }
}

async function resolveConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string,
  chatMode: ChatRequestMode,
  conversationId?: string
): Promise<ConversationResult> {
  if (conversationId) {
    const existingConversation = await getConversationById(
      conversationId,
      agentId,
      organizationId,
      initiatedBy
    );

    if (!existingConversation.data || existingConversation.error) {
      return existingConversation;
    }

    if (resolveConversationChatMode(existingConversation.data) !== chatMode) {
      return { data: null, error: "La conversacion no coincide con el modo solicitado", created: false };
    }

    return existingConversation;
  }

  return getOrCreateConversation(agentId, organizationId, initiatedBy, {
    chatMode,
    channel: "web",
  });
}

async function createImmediateAssistantResponse(input: {
  agentId: string;
  conversationId: string;
  organizationId: string;
  chatMode: ChatRequestMode;
  content: string;
  nextMemory: ChatMessage[];
}): Promise<Response> {
  const assistantInsertResult = await insertMessageWithServiceRole({
    agentId: input.agentId,
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    role: "assistant",
    content: input.content,
  });

  if (assistantInsertResult.error) {
    console.error("chat.immediate_assistant_message_error", {
      conversationId: input.conversationId,
      error: assistantInsertResult.error,
    });
  }

  return new Response(input.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": input.conversationId,
      "X-Chat-Mode": input.chatMode,
    },
  });
}

function buildSalesforceOrchestrationFailureMessage(): string {
  return "No pude completar la operacion con Salesforce por un error interno del agente. Revisa la integracion activa, la tool CRM del agente y el system prompt antes de volver a intentarlo.";
}

function buildSalesforceCapabilityGuidance(): string {
  return [
    "SALESFORCE_CAPABILITY",
    "<salesforce_capability>",
    "Este agente tiene acceso operativo a las tools de Salesforce habilitadas para esta organizacion.",
    "Si el usuario pregunta si tienes acceso a Salesforce o al CRM, responde que si tienes acceso operativo via integracion backend de este agente.",
    "Si en este turno todavia no ejecutaste una consulta, aclara que el acceso existe aunque aun no hayas leido o escrito datos en esta respuesta.",
    "No afirmes que no tienes acceso al CRM mientras esta integracion siga usable.",
    "Si mensajes anteriores de esta misma conversacion dijeron lo contrario, tratalos como respuestas previas incorrectas o desactualizadas, no como el estado real actual.",
    "No digas que una busqueda previa no fue real o no fue confiable salvo que TOOL_OUTPUTS o un error backend indiquen explicitamente un fallo real.",
    "Si una consulta no devolvio coincidencias, describelo como falta de resultados o falta de coincidencias, no como ausencia de acceso ni como simulacion.",
    "</salesforce_capability>",
  ].join("\n");
}

function appendToolContext(
  current: string | undefined,
  next: string | undefined
): string | undefined {
  if (!next) {
    return current;
  }

  return current ? `${current}\n\n${next}` : next;
}

async function measureAsync<T>(
  fn: () => Promise<T>
): Promise<{ value: T; durationMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, durationMs: Date.now() - start };
}

function shouldLogChatObservability(input: {
  latencyMs: number;
  usedRag: boolean;
  usedTool: boolean;
}): boolean {
  return (
    input.latencyMs >= CHAT_OBSERVABILITY_SLOW_REQUEST_MS ||
    input.usedRag ||
    input.usedTool
  );
}

export async function POST(request: Request): Promise<Response> {
  const requestStart = Date.now();
  const stageTimings: ChatStageTimings = {
    historyMs: null,
    ragMs: null,
    persistUserMessageMs: null,
    salesforceOrchestrationMs: null,
    gmailOrchestrationMs: null,
    googleCalendarOrchestrationMs: null,
    googleRuntimeChecksMs: null,
    promptResolutionMs: null,
    llmReadyMs: null,
  };

  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (await isChatRateLimited(session.organizationId)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes de chat. Intenta nuevamente en unos segundos." },
      { status: 429 }
    );
  }

  const parsedBody = await parseJsonRequestBody(request, chatSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const { agentId, conversationId, content } = parsedBody.data;

  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "use",
    allowedStatuses: getAllowedStatuses(session.role),
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  if (access.connectionSummary.classification === "remote_managed") {
    return NextResponse.json(
      { error: "Este agente esta gestionado por OpenAI y no usa el chat local." },
      { status: 403 }
    );
  }

  const agent = access.agent;
  const chatMode: ChatRequestMode = agent.status === "draft" ? "sandbox" : "live_local";

  if (chatMode === "sandbox" && !canUseSandbox(session.role)) {
    return NextResponse.json(
      { error: "Solo admin y editor pueden probar agentes en draft." },
      { status: 403 }
    );
  }

  const agentSetupState = readAgentSetupState(agent);
  const executionConfig = resolveExecutionConfig(agent);

  const conversationResult = await resolveConversation(
    agentId,
    session.organizationId,
    session.user.id,
    chatMode,
    conversationId
  );

  const { data: conversation, error: conversationError } = conversationResult;

  if (conversationError) {
    const status = conversationError === "La conversacion no coincide con el modo solicitado" ? 400 : 500;
    return NextResponse.json(
      { error: status === 400 ? conversationError : "No se pudo cargar la conversacion" },
      { status }
    );
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  const planCheck = await checkSessionLimitForConversation({
    organizationId: session.organizationId,
    conversationId: conversation.id,
  });

  if (!planCheck.allowed) {
    return NextResponse.json(
      { error: planCheck.message ?? "Limite del plan alcanzado" },
      { status: 429 }
    );
  }

  const historyPromise = measureAsync(() =>
    listMessages(conversation.id, session.organizationId)
  );
  const userMessagePromise = measureAsync(() =>
    insertMessage({
      agentId,
      conversationId: conversation.id,
      organizationId: session.organizationId,
      role: "user",
      content,
    })
  );
  const ragContextPromise = measureAsync(() =>
    buildRagContext(agentId, session.organizationId, content)
  );

  const [historyMeasure, userMessageMeasure, ragContextMeasure] = await Promise.all([
    historyPromise,
    userMessagePromise,
    ragContextPromise,
  ]);

  stageTimings.historyMs = historyMeasure.durationMs;
  stageTimings.persistUserMessageMs = userMessageMeasure.durationMs;
  stageTimings.ragMs = ragContextMeasure.durationMs;

  const historyResult = historyMeasure.value;
  const userMessageResult = userMessageMeasure.value;
  const ragContext = ragContextMeasure.value;

  if (userMessageResult.error) {
    return NextResponse.json({ error: "No se pudo guardar el mensaje" }, { status: 500 });
  }

  const previousMessages = (historyResult.data ?? []).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
  }));

  const nextMemory = trimChatMemory([...previousMessages, { role: "user", content }]);
  const scopeDecision = agentSetupState
    ? classifyScopeIntent({
        content,
        agentScope: agentSetupState.agentScope,
      })
    : { decision: "in_scope" as const };

  if (scopeDecision.decision === "ambiguous") {
    return createImmediateAssistantResponse({
      agentId,
      conversationId: conversation.id,
      organizationId: session.organizationId,
      chatMode,
      content: buildAmbiguousScopeResponse(agentSetupState?.agentScope ?? "operations"),
      nextMemory,
    });
  }

  if (scopeDecision.decision === "out_of_scope") {
    return createImmediateAssistantResponse({
      agentId,
      conversationId: conversation.id,
      organizationId: session.organizationId,
      chatMode,
      content: buildOutOfScopeResponse({
        agentScope: agentSetupState?.agentScope ?? "operations",
        targetScope: scopeDecision.targetScope,
      }),
      nextMemory,
    });
  }

  let toolContext: string | undefined;
  let hasUsableSalesforceRuntime = false;
  let hasUsableGmailRuntime = false;
  let hasUsableGoogleCalendarRuntime = false;
  let hasConfiguredGmail = false;
  let hasConfiguredGoogleCalendar = false;
  let salesforceAllowedFormActions: string[] = [];
  const shouldOrchestrateSalesforce = Boolean(
    agentSetupState && (isSalesforceTemplateId(agentSetupState.template_id) || agentSetupState.integrations.includes("salesforce"))
  );
  const shouldOrchestrateGoogleCalendar = Boolean(
    agentSetupState &&
      setupStateExpectsGoogleCalendarIntegration(agentSetupState)
  );
  const shouldOrchestrateGmail = Boolean(
    agentSetupState &&
      setupStateExpectsGmailIntegration(agentSetupState)
  );

  try {
    if (shouldOrchestrateSalesforce) {
      const { value: orchestration, durationMs } = await measureAsync(() =>
        orchestrateSalesforceForChat({
          agent,
          conversation,
          organizationId: session.organizationId,
          userId: session.user.id,
          latestUserMessage: content,
          recentMessages: nextMemory,
        })
      );
      stageTimings.salesforceOrchestrationMs = durationMs;

      if (orchestration.kind === "respond_now") {
        return createImmediateAssistantResponse({
          agentId,
          conversationId: conversation.id,
          organizationId: session.organizationId,
          chatMode,
          content: orchestration.content,
          nextMemory,
        });
      }

      toolContext = appendToolContext(toolContext, orchestration.toolContext);
      hasUsableSalesforceRuntime = orchestration.hasUsableSalesforceRuntime;
      salesforceAllowedFormActions = orchestration.allowedActions;
    }

    if (shouldOrchestrateGmail) {
      const { value: orchestration, durationMs } = await measureAsync(() =>
        orchestrateGoogleGmailForChat({
          agent,
          conversation,
          organizationId: session.organizationId,
          userId: session.user.id,
          latestUserMessage: content,
          recentMessages: nextMemory,
        })
      );
      stageTimings.gmailOrchestrationMs = durationMs;

      if (orchestration.kind === "respond_now") {
        return createImmediateAssistantResponse({
          agentId,
          conversationId: conversation.id,
          organizationId: session.organizationId,
          chatMode,
          content: orchestration.content,
          nextMemory,
        });
      }

      toolContext = appendToolContext(toolContext, orchestration.toolContext);
      hasUsableGmailRuntime = orchestration.hasUsableGmailRuntime;
    }

    if (shouldOrchestrateGoogleCalendar) {
      const { value: orchestration, durationMs } = await measureAsync(() =>
        orchestrateGoogleCalendarForChat({
          agent,
          conversation,
          organizationId: session.organizationId,
          userId: session.user.id,
          latestUserMessage: content,
          recentMessages: nextMemory,
        })
      );
      stageTimings.googleCalendarOrchestrationMs = durationMs;

      if (orchestration.kind === "respond_now") {
        return createImmediateAssistantResponse({
          agentId,
          conversationId: conversation.id,
          organizationId: session.organizationId,
          chatMode,
          content: orchestration.content,
          nextMemory,
        });
      }

      toolContext = appendToolContext(toolContext, orchestration.toolContext);
      hasUsableGoogleCalendarRuntime =
        orchestration.hasUsableGoogleCalendarRuntime;
    }

    const googleRuntimeChecksStart = Date.now();
    if (
      agentSetupState &&
      setupStateExpectsGmailIntegration(agentSetupState) &&
      !hasUsableGmailRuntime
    ) {
      const gmailRuntime = await getGoogleAgentToolRuntime(
        agent.id,
        session.organizationId,
        "gmail"
      );
      hasConfiguredGmail = Boolean(gmailRuntime.data?.ok);
    } else if (hasUsableGmailRuntime) {
      hasConfiguredGmail = true;
    }

    if (
      agentSetupState &&
      setupStateExpectsGoogleCalendarIntegration(agentSetupState)
    ) {
      const googleCalendarRuntime = await getGoogleAgentToolRuntime(
        agent.id,
        session.organizationId,
        "google_calendar"
      );
      hasConfiguredGoogleCalendar = Boolean(googleCalendarRuntime.data?.ok);
    }
    stageTimings.googleRuntimeChecksMs = Date.now() - googleRuntimeChecksStart;

    const promptResolutionStart = Date.now();
    const promptResolution = resolveEffectiveAgentPrompt({
      savedPrompt: executionConfig.systemPrompt,
      setupState: agentSetupState,
      promptEnvironment: {
        salesforceUsable: hasUsableSalesforceRuntime,
        gmailConfigured: hasConfiguredGmail,
        gmailRuntimeAvailable: hasUsableGmailRuntime,
        googleCalendarConfigured: hasConfiguredGoogleCalendar,
        googleCalendarRuntimeAvailable: hasUsableGoogleCalendarRuntime,
      },
      allowConflictCleanupForCustom: true,
    });
    stageTimings.promptResolutionMs = Date.now() - promptResolutionStart;

    executionConfig.systemPrompt = promptResolution.effectivePrompt;

    const inlineFormGuidance = [
      hasUsableSalesforceRuntime
        ? buildChatFormGuidance({
            provider: "salesforce",
            allowedActions: salesforceAllowedFormActions,
          })
        : null,
    ].filter((guidance): guidance is string => Boolean(guidance));

    if (inlineFormGuidance.length > 0) {
      executionConfig.systemPrompt = [
        executionConfig.systemPrompt,
        ...inlineFormGuidance,
      ].join("\n\n");
    }

    if (hasUsableGmailRuntime) {
      executionConfig.systemPrompt = [
        executionConfig.systemPrompt,
        buildGmailPromptInjectionGuardrail(),
      ].join("\n\n");
    }

    if (promptResolution.syncMode === "custom") {
      if (hasUsableSalesforceRuntime) {
        executionConfig.systemPrompt = [
          executionConfig.systemPrompt,
          buildSalesforceCapabilityGuidance(),
        ].join("\n\n");
      }
    }
  } catch (error) {
    const provider = shouldOrchestrateGmail
      ? "gmail"
      : shouldOrchestrateGoogleCalendar
      ? "google_calendar"
      : "salesforce";

    console.error(`chat.${provider}_orchestration_error`, {
      conversationId: conversation.id,
      organizationId: session.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return createImmediateAssistantResponse({
      agentId,
      conversationId: conversation.id,
      organizationId: session.organizationId,
      chatMode,
      content: shouldOrchestrateGmail
        ? "No pude completar la consulta de Gmail por un error interno del agente. Revisa la integracion Google activa, la tool Gmail del agente y los scopes de metadata antes de volver a intentarlo."
        : shouldOrchestrateGoogleCalendar
        ? "No pude completar la consulta de Google Calendar por un error interno del agente. Revisa la integracion Google activa, la tool Google Calendar del agente y la timezone configurada antes de volver a intentarlo."
        : buildSalesforceOrchestrationFailureMessage(),
      nextMemory,
    });
  }

  const preStreamLatencyMs = Date.now() - requestStart;
  const usedRag = Boolean(ragContext);
  const usedTool = Boolean(toolContext);

  if (
    shouldLogChatObservability({
      latencyMs: preStreamLatencyMs,
      usedRag,
      usedTool,
    })
  ) {
    console.info("chat.pre_stream_ready", {
      conversationId: conversation.id,
      organizationId: session.organizationId,
      latencyMs: preStreamLatencyMs,
      usedCachedHistory: false,
      usedRag,
      usedCrmTool: usedTool,
      chatMode,
      stageTimings,
    });
  }

  let streamResult;
  try {
    streamResult = sendStreamingChatCompletion({
      model: executionConfig.llmModel,
      systemPrompt: executionConfig.systemPrompt,
      messages: nextMemory,
      temperature: executionConfig.llmTemperature,
      maxTokens: executionConfig.maxTokens,
      organizationId: session.organizationId,
      agentId: agent.id,
      conversationId: conversation.id,
      context: ragContext,
      toolContext,
    });

    await streamResult.onReady;
    stageTimings.llmReadyMs = Date.now() - requestStart;
    if (
      shouldLogChatObservability({
        latencyMs: stageTimings.llmReadyMs,
        usedRag,
        usedTool,
      })
    ) {
      console.info("chat.stream_ready", {
        conversationId: conversation.id,
        organizationId: session.organizationId,
        latencyMs: stageTimings.llmReadyMs,
        model: executionConfig.llmModel,
        stageTimings,
      });
    }
  } catch (error) {
    if (error instanceof LiteLLMError) {
      console.error("chat.llm_error", {
        model: executionConfig.llmModel,
        errorType: error.errorType,
        message: error.message,
      });

      const status = error.status === "rate_limited" ? 429 : 502;
      return NextResponse.json(
        { error: getSafeChatErrorMessage(error, executionConfig.llmModel) },
        { status }
      );
    }

    return NextResponse.json(
      { error: "El agente no pudo generar una respuesta. Intenta de nuevo." },
      { status: 502 }
    );
  }

  const orgId = session.organizationId;
  const convId = conversation.id;
  const currentAgentId = agent.id;
  const currentLlmProvider = executionConfig.llmProvider;

  after(async () => {
    try {
      const output = await streamResult.onComplete;

      const assistantInsertResult = await insertMessageWithServiceRole({
        agentId: currentAgentId,
        conversationId: convId,
        organizationId: orgId,
        role: "assistant",
        content: output.content,
        llmModel: output.model,
        responseTimeMs: output.responseTimeMs,
        tokensInput: output.tokensInput,
        tokensOutput: output.tokensOutput,
      });

      if (assistantInsertResult.error) {
        console.error("chat.assistant_message_error", {
          conversationId: convId,
          error: assistantInsertResult.error,
        });
      }

      const usageResult = await recordUsage({
        organizationId: orgId,
        agentId: currentAgentId,
        tokensInput: output.tokensInput,
        tokensOutput: output.tokensOutput,
        llmProvider: currentLlmProvider,
      });

      if (usageResult && usageResult.planLimit && usageResult.planLimit > 0) {
        await insertPlanLimitNotification({
          organizationId: orgId,
          currentUsage: usageResult.currentUsage,
          planLimit: usageResult.planLimit,
        });
      }
    } catch (error) {
      console.error("chat.post_stream_persistence_error", {
        conversationId: convId,
        organizationId: orgId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return new Response(streamResult.stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": conversation.id,
      "X-Chat-Mode": chatMode,
    },
  });
}




