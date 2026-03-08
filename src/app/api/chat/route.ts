import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getAgentById } from "@/lib/db/agents";
import { getConversationById, getOrCreateConversation } from "@/lib/db/conversations";
import { insertMessage, insertMessageWithServiceRole, listMessages } from "@/lib/db/messages";
import { insertPlanLimitNotification } from "@/lib/db/notifications-writer";
import { formatChunksAsContext, searchChunks } from "@/lib/db/rag";
import { recordUsage } from "@/lib/db/usage-writer";
import { generateEmbedding } from "@/lib/llm/embeddings";
import { LiteLLMError, sendStreamingChatCompletion } from "@/lib/llm/litellm";
import { getJsonValue, incrementRateLimit, setJsonValue } from "@/lib/redis";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import type { Conversation, Organization } from "@/types/app";
import type { Tables } from "@/types/database";

const CHAT_RATE_LIMIT_MAX_REQUESTS = 30;
const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;
const CHAT_MEMORY_TTL_SECONDS = 6 * 60 * 60;
const CHAT_MEMORY_MAX_MESSAGES = 20;
const CHAT_RAG_TIMEOUT_MS = 1200;
const CHAT_REDIS_TIMEOUT_MS = 150;

const chatSchema = z.object({
  agentId: z.string().uuid("agentId debe ser un UUID valido"),
  conversationId: z.string().uuid("conversationId debe ser un UUID valido").optional(),
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacio")
    .max(4000, "El mensaje no puede superar 4000 caracteres"),
});

type PlanLimits = Pick<Tables<"plans">, "max_messages_month">;
type UsageRow = Pick<Tables<"usage_records">, "total_messages">;
type OrganizationPlan = Pick<Organization, "plan_id">;
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationResult = {
  data: Conversation | null;
  error: string | null;
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

function buildConversationMemoryKey(
  organizationId: string,
  conversationId: string
): string {
  return `chat_memory:${organizationId}:${conversationId}`;
}

function trimChatMemory(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_MEMORY_MAX_MESSAGES);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const role = Reflect.get(value, "role");
  const content = Reflect.get(value, "content");

  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length > 0
  );
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

async function isChatRateLimited(organizationId: string): Promise<boolean> {
  try {
    const currentCount = await withTimeout(
      incrementRateLimit(
        buildChatRateLimitKey(organizationId),
        CHAT_RATE_LIMIT_WINDOW_SECONDS
      ),
      CHAT_REDIS_TIMEOUT_MS,
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

async function loadConversationMemory(
  organizationId: string,
  conversationId: string
): Promise<ChatMessage[] | null> {
  try {
    const cachedMessages = await withTimeout(
      getJsonValue<unknown[]>(buildConversationMemoryKey(organizationId, conversationId)),
      CHAT_REDIS_TIMEOUT_MS,
      "chat.memory_read"
    );

    if (!cachedMessages) {
      return null;
    }

    const validMessages = cachedMessages.filter(isChatMessage);

    if (validMessages.length !== cachedMessages.length) {
      throw new Error("Redis devolvio historial de chat invalido");
    }

    return trimChatMemory(validMessages);
  } catch (error) {
    console.error("chat.memory_read_error", {
      conversationId,
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return null;
  }
}

async function persistConversationMemory(
  organizationId: string,
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  try {
    await withTimeout(
      setJsonValue(
        buildConversationMemoryKey(organizationId, conversationId),
        trimChatMemory(messages),
        CHAT_MEMORY_TTL_SECONDS
      ),
      CHAT_REDIS_TIMEOUT_MS,
      "chat.memory_write"
    );
  } catch (error) {
    console.error("chat.memory_write_error", {
      conversationId,
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
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

async function checkPlanLimits(
  organizationId: string
): Promise<{ allowed: boolean; message?: string }> {
  const serviceClient = createServiceSupabaseClient();
  const { data: organizationData } = await serviceClient
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .single();

  const organization = organizationData as OrganizationPlan | null;

  if (!organization) {
    return { allowed: false, message: "No se pudo verificar el plan" };
  }

  const { data: planData } = await serviceClient
    .from("plans")
    .select("max_messages_month")
    .eq("id", organization.plan_id)
    .single();

  const plan = planData as PlanLimits | null;

  if (!plan) {
    return { allowed: false, message: "No se pudo verificar el plan" };
  }

  if (plan.max_messages_month <= 0) {
    return { allowed: true };
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { data: usageData } = await serviceClient
    .from("usage_records")
    .select("total_messages")
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);

  const usageRows = (usageData ?? []) as UsageRow[];
  const totalMessages = usageRows.reduce(
    (sum, row) => sum + (row.total_messages ?? 0),
    0
  );

  if (totalMessages >= plan.max_messages_month) {
    return {
      allowed: false,
      message: `Limite de mensajes alcanzado (${plan.max_messages_month}/mes). Actualiza tu plan para continuar.`,
    };
  }

  return { allowed: true };
}

async function resolveConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string,
  conversationId?: string
): Promise<ConversationResult> {
  if (conversationId) {
    return getConversationById(conversationId, agentId, organizationId, initiatedBy);
  }

  return getOrCreateConversation(agentId, organizationId, initiatedBy);
}

export async function POST(request: Request): Promise<Response> {
  const requestStart = Date.now();

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

  const { data: agent } = await getAgentById(agentId, session.organizationId);
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  if (agent.status !== "active") {
    return NextResponse.json({ error: "El agente no esta activo" }, { status: 403 });
  }

  if (session.role === "operador" || session.role === "viewer") {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: permission } = await supabaseAuth
      .from("user_agent_permissions")
      .select("can_use")
      .eq("user_id", session.user.id)
      .eq("agent_id", agentId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (!permission || permission.can_use !== true) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }
  }

  const [planCheck, conversationResult] = await Promise.all([
    checkPlanLimits(session.organizationId),
    resolveConversation(agentId, session.organizationId, session.user.id, conversationId),
  ]);

  if (!planCheck.allowed) {
    return NextResponse.json(
      { error: planCheck.message ?? "Limite del plan alcanzado" },
      { status: 429 }
    );
  }

  const { data: conversation, error: conversationError } = conversationResult;

  if (conversationError) {
    return NextResponse.json({ error: "No se pudo cargar la conversacion" }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  const cachedHistoryPromise = loadConversationMemory(session.organizationId, conversation.id);
  const historyPromise = listMessages(conversation.id, session.organizationId);
  const userMessagePromise = insertMessage({
    conversationId: conversation.id,
    organizationId: session.organizationId,
    role: "user",
    content,
  });
  const ragContextPromise = buildRagContext(agentId, session.organizationId, content);

  const [cachedHistory, historyResult, userMessageResult, ragContext] = await Promise.all([
    cachedHistoryPromise,
    historyPromise,
    userMessagePromise,
    ragContextPromise,
  ]);

  if (userMessageResult.error) {
    return NextResponse.json({ error: "No se pudo guardar el mensaje" }, { status: 500 });
  }

  const previousMessages = cachedHistory ??
    (historyResult.data ?? []).map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  const nextMemory = trimChatMemory([...previousMessages, { role: "user", content }]);
  void persistConversationMemory(session.organizationId, conversation.id, nextMemory);

  console.info("chat.pre_stream_ready", {
    conversationId: conversation.id,
    organizationId: session.organizationId,
    latencyMs: Date.now() - requestStart,
    usedCachedHistory: cachedHistory !== null,
    usedRag: Boolean(ragContext),
  });

  let streamResult;
  try {
    streamResult = sendStreamingChatCompletion({
      model: agent.llm_model,
      systemPrompt: agent.system_prompt,
      messages: nextMemory,
      temperature: agent.llm_temperature ?? 0.7,
      maxTokens: agent.max_tokens ?? 1000,
      organizationId: session.organizationId,
      agentId: agent.id,
      conversationId: conversation.id,
      context: ragContext,
    });

    await streamResult.onReady;
  } catch (error) {
    if (error instanceof LiteLLMError) {
      console.error("chat.llm_error", {
        model: agent.llm_model,
        errorType: error.errorType,
        message: error.message,
      });

      const status = error.status === "rate_limited" ? 429 : 502;
      return NextResponse.json(
        { error: getSafeChatErrorMessage(error, agent.llm_model) },
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
  const currentLlmProvider = agent.llm_provider;

  after(async () => {
    try {
      const output = await streamResult.onComplete;

      const assistantInsertResult = await insertMessageWithServiceRole({
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

      if (usageResult && usageResult.planLimit > 0) {
        await insertPlanLimitNotification({
          organizationId: orgId,
          currentUsage: usageResult.totalMessages,
          planLimit: usageResult.planLimit,
        });
      }

      await persistConversationMemory(orgId, convId, [
        ...nextMemory,
        { role: "assistant", content: output.content },
      ]);
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
    },
  });
}
