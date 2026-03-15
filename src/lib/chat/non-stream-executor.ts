import "server-only";

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
import {
  readConversationMetadata,
  resolveConversationChatMode,
  type ConversationMetadata,
} from "@/lib/chat/conversation-metadata";
import { orchestrateGoogleCalendarForChat } from "@/lib/chat/google-calendar-tool-orchestrator";
import { orchestrateSalesforceForChat } from "@/lib/chat/salesforce-tool-orchestrator";
import { prepareWhatsAppUnifiedTurn } from "@/lib/chat/whatsapp-unified";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getConversationByIdWithServiceRole } from "@/lib/db/conversations";
import { formatChunksAsContext, searchChunks } from "@/lib/db/rag";
import { checkSessionLimitForConversation } from "@/lib/db/session-usage";
import { generateEmbedding } from "@/lib/llm/embeddings";
import { LiteLLMError, sendChatCompletion } from "@/lib/llm/litellm";
import { getGoogleAgentToolRuntime } from "@/lib/integrations/google-agent-runtime";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Agent, Conversation, Organization } from "@/types/app";

const RUN_MEMORY_MAX_MESSAGES = 20;
const RUN_RAG_TIMEOUT_MS = 1200;

type OrganizationPlan = Pick<Organization, "plan_id" | "is_active" | "deleted_at">;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type NonStreamingAssistantReply = {
  content: string;
  llmModel: string | null;
  llmProvider: string | null;
  responseTimeMs: number | null;
  tokensInput: number;
  tokensOutput: number;
  conversationMetadataPatch?: ConversationMetadata;
};

export type ExecuteNonStreamingAgentTurnResult =
  | {
      ok: true;
      agent: Agent;
      conversation: Conversation;
      reply: NonStreamingAssistantReply;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function trimMemory(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-RUN_MEMORY_MAX_MESSAGES);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} excedio el tiempo maximo`));
    }, timeoutMs);

    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function loadOperationalAgent(
  agentId: string,
  organizationId: string
): Promise<{ agent: Agent | null; error: string | null; status: number | null }> {
  const serviceClient = createServiceSupabaseClient();

  const { data: organizationData } = await serviceClient
    .from("organizations")
    .select("plan_id, is_active, deleted_at")
    .eq("id", organizationId)
    .maybeSingle();

  const organization = organizationData as OrganizationPlan | null;
  if (!organization || organization.is_active === false || organization.deleted_at) {
    return { agent: null, error: "La organizacion no esta disponible", status: 403 };
  }

  const { data, error } = await serviceClient
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { agent: null, error: "Error al cargar el agente", status: 404 };
  }

  if (!data) {
    return { agent: null, error: "Agente no encontrado", status: 404 };
  }

  const agent = data as Agent;
  const isActive = Reflect.get(agent as Record<string, unknown>, "is_active");

  if (agent.status !== "active" || isActive === false) {
    return { agent: null, error: "El agente no esta disponible", status: 403 };
  }

  return { agent, error: null, status: null };
}

async function loadMessagesFromDb(conversationId: string, organizationId: string): Promise<ChatMessage[]> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(RUN_MEMORY_MAX_MESSAGES);

  if (error || !data) {
    return [];
  }

  return (data as Array<{ role: string; content: string }>)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .reverse()
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

async function buildRagContext(agentId: string, organizationId: string, content: string): Promise<string | undefined> {
  try {
    return await withTimeout((async () => {
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
    })(), RUN_RAG_TIMEOUT_MS, "run.rag");
  } catch (error) {
    console.error("run.rag_error", {
      agentId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return undefined;
  }
}

function getSafeErrorMessage(error: LiteLLMError, model: string): string {
  if (error.errorType === "provider_rate_limit") return `El modelo ${model} no tiene cuota disponible en este momento.`;
  if (error.errorType === "provider_billing") return `La cuenta del proveedor para ${model} no tiene credito suficiente.`;
  if (error.errorType === "provider_auth") return `La credencial configurada para ${model} no es valida.`;
  if (error.errorType === "model_not_available") return `El modelo ${model} no esta disponible en LiteLLM.`;
  if (error.errorType === "request_timeout") return "El proveedor tardo demasiado en responder. Intenta de nuevo.";
  return "El agente no pudo generar una respuesta. Intenta de nuevo.";
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

  const conversationResult = await getConversationByIdWithServiceRole(
    input.conversationId,
    input.agentId,
    input.organizationId
  );

  if (conversationResult.error || !conversationResult.data) {
    return { ok: false, status: 404, error: "Conversacion no encontrada" };
  }

  const agent = agentLoad.agent;
  const conversation = conversationResult.data;
  const planCheck = await checkSessionLimitForConversation({
    organizationId: input.organizationId,
    conversationId: conversation.id,
  });
  if (!planCheck.allowed) {
    return { ok: false, status: 429, error: planCheck.message ?? "Limite del plan alcanzado" };
  }
  const [dbHistory, ragContext] = await Promise.all([
    loadMessagesFromDb(conversation.id, input.organizationId),
    buildRagContext(input.agentId, input.organizationId, input.latestUserMessage),
  ]);

  const nextMemory = trimMemory(dbHistory);
  const agentSetupState = readAgentSetupState(agent);
  const conversationMetadata = readConversationMetadata(conversation.metadata);
  const scopeDecision = agentSetupState
    ? classifyScopeIntent({
        content: input.latestUserMessage,
        agentScope: agentSetupState.agentScope,
      })
    : { decision: "in_scope" as const };

  if (scopeDecision.decision === "ambiguous") {
    return {
      ok: true,
      agent,
      conversation,
      reply: {
        content: buildAmbiguousScopeResponse(agentSetupState?.agentScope ?? "operations"),
        llmModel: null,
        llmProvider: null,
        responseTimeMs: null,
        tokensInput: 0,
        tokensOutput: 0,
      },
    };
  }

  if (scopeDecision.decision === "out_of_scope") {
    return {
      ok: true,
      agent,
      conversation,
      reply: {
        content: buildOutOfScopeResponse({
          agentScope: agentSetupState?.agentScope ?? "operations",
          targetScope: scopeDecision.targetScope,
        }),
        llmModel: null,
        llmProvider: null,
        responseTimeMs: null,
        tokensInput: 0,
        tokensOutput: 0,
      },
    };
  }

  if (
    agentSetupState?.template_id === "whatsapp_unified" &&
    conversation.channel === "whatsapp" &&
    resolveConversationChatMode(conversation) === "live_external"
  ) {
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
      const llmOutput = await sendChatCompletion({
        model: agent.llm_model,
        systemPrompt: prepared.systemPrompt,
        messages: nextMemory,
        temperature: agent.llm_temperature ?? 0.7,
        maxTokens: agent.max_tokens ?? 1000,
        organizationId: input.organizationId,
        agentId: input.agentId,
        conversationId: conversation.id,
        context: ragContext,
      });

      return {
        ok: true,
        agent,
        conversation,
        reply: {
          content: llmOutput.content,
          llmModel: llmOutput.model,
          llmProvider: agent.llm_provider,
          responseTimeMs: llmOutput.responseTimeMs,
          tokensInput: llmOutput.tokensInput,
          tokensOutput: llmOutput.tokensOutput,
          conversationMetadataPatch: prepared.conversationMetadataPatch,
        },
      };
    } catch (error) {
      if (error instanceof LiteLLMError) {
        return { ok: false, status: error.status === "rate_limited" ? 429 : 502, error: getSafeErrorMessage(error, agent.llm_model) };
      }

      return { ok: false, status: 502, error: "El agente no pudo generar una respuesta. Intenta de nuevo." };
    }
  }

  let systemPrompt = agent.system_prompt;
  let toolContext: string | undefined;
  const setupTemplateId = agentSetupState?.template_id;
  let hasConfiguredGmail = false;
  let hasConfiguredGoogleCalendar = false;

  try {
    if (setupTemplateId && isSalesforceTemplateId(setupTemplateId)) {
      const orchestration = await orchestrateSalesforceForChat({
        agent,
        conversation,
        organizationId: input.organizationId,
        userId: input.orchestrationUserId ?? input.organizationId,
        latestUserMessage: input.latestUserMessage,
        recentMessages: nextMemory,
      });

      if (orchestration.kind === "respond_now") {
        return {
          ok: true,
          agent,
          conversation,
          reply: {
            content: orchestration.content,
            llmModel: null,
            llmProvider: null,
            responseTimeMs: null,
            tokensInput: 0,
            tokensOutput: 0,
          },
        };
      }

      toolContext = orchestration.toolContext;
    }

    if (agentSetupState && setupStateExpectsGmailIntegration(agentSetupState)) {
      const gmailRuntime = await getGoogleAgentToolRuntime(
        input.agentId,
        input.organizationId,
        "gmail"
      );
      hasConfiguredGmail = Boolean(gmailRuntime.data?.ok);
    }

    if (
      agentSetupState &&
      setupStateExpectsGoogleCalendarIntegration(agentSetupState)
    ) {
      const orchestration = await orchestrateGoogleCalendarForChat({
        agent,
        conversation,
        organizationId: input.organizationId,
        userId: input.orchestrationUserId ?? input.organizationId,
        latestUserMessage: input.latestUserMessage,
        recentMessages: nextMemory,
      });

      if (orchestration.kind === "respond_now") {
        return {
          ok: true,
          agent,
          conversation,
          reply: {
            content: orchestration.content,
            llmModel: null,
            llmProvider: null,
            responseTimeMs: null,
            tokensInput: 0,
            tokensOutput: 0,
          },
        };
      }

      hasConfiguredGoogleCalendar = orchestration.hasUsableGoogleCalendarRuntime;
      toolContext = orchestration.toolContext;
    }

    systemPrompt = resolveEffectiveAgentPrompt({
      savedPrompt: systemPrompt,
      setupState: agentSetupState,
      promptEnvironment: {
        gmailConfigured: hasConfiguredGmail,
        gmailRuntimeAvailable: false,
        googleCalendarConfigured: hasConfiguredGoogleCalendar,
        googleCalendarRuntimeAvailable: false,
      },
      allowConflictCleanupForCustom: true,
    }).effectivePrompt;
  } catch (error) {
    console.error("run.orchestration_error", {
      conversationId: conversation.id,
      organizationId: input.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return {
      ok: true,
      agent,
      conversation,
      reply: {
        content: "No pude completar la operacion solicitada por un error interno del agente. Revisa la integracion activa antes de volver a intentarlo.",
        llmModel: null,
        llmProvider: null,
        responseTimeMs: null,
        tokensInput: 0,
        tokensOutput: 0,
      },
    };
  }

  try {
    const llmOutput = await sendChatCompletion({
      model: agent.llm_model,
      systemPrompt,
      messages: nextMemory,
      temperature: agent.llm_temperature ?? 0.7,
      maxTokens: agent.max_tokens ?? 1000,
      organizationId: input.organizationId,
      agentId: input.agentId,
      conversationId: conversation.id,
      context: ragContext,
      toolContext,
    });

    return {
      ok: true,
      agent,
      conversation,
      reply: {
        content: llmOutput.content,
        llmModel: llmOutput.model,
        llmProvider: agent.llm_provider,
        responseTimeMs: llmOutput.responseTimeMs,
        tokensInput: llmOutput.tokensInput,
        tokensOutput: llmOutput.tokensOutput,
      },
    };
  } catch (error) {
    if (error instanceof LiteLLMError) {
      return { ok: false, status: error.status === "rate_limited" ? 429 : 502, error: getSafeErrorMessage(error, agent.llm_model) };
    }

    return { ok: false, status: 502, error: "El agente no pudo generar una respuesta. Intenta de nuevo." };
  }
}
