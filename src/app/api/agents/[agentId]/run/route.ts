import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/api-key-auth";
import { persistAssistantReply } from "@/lib/chat/non-stream-persistence";
import { executeNonStreamingAgentTurn } from "@/lib/chat/non-stream-executor";
import { getConversationByIdWithServiceRole, getOrCreateConversation } from "@/lib/db/conversations";
import { insertMessageWithServiceRole } from "@/lib/db/messages";
import { incrementRateLimit } from "@/lib/redis";

const RUN_RATE_LIMIT_MAX_REQUESTS = 30;
const RUN_RATE_LIMIT_WINDOW_SECONDS = 60;
const RUN_RATE_LIMIT_REDIS_TIMEOUT_MS = 900;

const runSchema = z.object({
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacio")
    .max(4000, "El mensaje no puede superar 4000 caracteres"),
  conversationId: z.string().uuid("conversationId debe ser un UUID valido").optional(),
});

function buildRateLimitKey(organizationId: string): string {
  return `rate_limit:chat:${organizationId}`;
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

async function isRateLimited(organizationId: string): Promise<boolean> {
  try {
    const count = await withTimeout(
      incrementRateLimit(buildRateLimitKey(organizationId), RUN_RATE_LIMIT_WINDOW_SECONDS),
      RUN_RATE_LIMIT_REDIS_TIMEOUT_MS,
      "run.rate_limit"
    );

    return count > RUN_RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("run.rate_limit_error", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

async function resolveConversation(input: {
  agentId: string;
  organizationId: string;
  conversationId?: string;
}): Promise<{ conversationId: string | null; error: string | null }> {
  if (input.conversationId) {
    const result = await getConversationByIdWithServiceRole(
      input.conversationId,
      input.agentId,
      input.organizationId
    );

    if (result.error || !result.data) {
      return { conversationId: null, error: "Conversacion no encontrada" };
    }

    return { conversationId: result.data.id, error: null };
  }

  const result = await getOrCreateConversation(input.agentId, input.organizationId, input.organizationId, {
    channel: "api",
    useServiceRole: true,
  });

  if (result.error || !result.data) {
    return { conversationId: null, error: "No se pudo crear la conversacion" };
  }

  return { conversationId: result.data.id, error: null };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<Response> {
  const { agentId } = await params;
  const apiKey = request.headers.get("x-api-key") ?? request.headers.get("X-Api-Key");

  if (!apiKey) {
    return NextResponse.json({ error: "API key invalida o no autorizada" }, { status: 401 });
  }

  const authResult = await validateApiKey(apiKey);
  if (!authResult) {
    return NextResponse.json({ error: "API key invalida o no autorizada" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido en el body del request" }, { status: 400 });
  }

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Input invalido" },
      { status: 400 }
    );
  }

  if (await isRateLimited(authResult.organizationId)) {
    return NextResponse.json({ error: "Limite de requests o plan alcanzado" }, { status: 429 });
  }

  const conversationResolution = await resolveConversation({
    agentId,
    organizationId: authResult.organizationId,
    conversationId: parsed.data.conversationId,
  });

  if (conversationResolution.error || !conversationResolution.conversationId) {
    return NextResponse.json({ error: conversationResolution.error ?? "Error de conversacion" }, { status: 500 });
  }

  const userInsertResult = await insertMessageWithServiceRole({
    agentId,
    conversationId: conversationResolution.conversationId,
    organizationId: authResult.organizationId,
    role: "user",
    content: parsed.data.content,
  });

  if (userInsertResult.error) {
    return NextResponse.json({ error: "No se pudo guardar el mensaje" }, { status: 500 });
  }

  const execution = await executeNonStreamingAgentTurn({
    agentId,
    organizationId: authResult.organizationId,
    conversationId: conversationResolution.conversationId,
    latestUserMessage: parsed.data.content,
    orchestrationUserId: authResult.organizationId,
  });

  if (!execution.ok) {
    return NextResponse.json({ error: execution.error }, { status: execution.status });
  }

  await persistAssistantReply({
    agentId,
    conversationId: execution.conversation.id,
    organizationId: authResult.organizationId,
    content: execution.reply.content,
    llmModel: execution.reply.llmModel,
    llmProvider: execution.reply.llmProvider,
    responseTimeMs: execution.reply.responseTimeMs,
    tokensInput: execution.reply.tokensInput,
    tokensOutput: execution.reply.tokensOutput,
    conversationMetadataPatch: execution.reply.conversationMetadataPatch,
  });

  return NextResponse.json({
    data: {
      content: execution.reply.content,
      conversationId: execution.conversation.id,
      tokensInput: execution.reply.tokensInput,
      tokensOutput: execution.reply.tokensOutput,
    },
  });
}
