import { NextResponse } from "next/server";
import { canAccessQaPanel } from "@/lib/agents/connection-policy";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  buildPersistedQaReview,
  buildQaConversationDetail,
  buildQaConversationSummary,
  buildQaStats,
  isQaConversation,
  qaReviewUpdateSchema,
} from "@/lib/chat/qa";
import { getConversationById, listConversations, updateConversationMetadata } from "@/lib/db/conversations";
import { listMessages } from "@/lib/db/messages";
import { insertAuditLog } from "@/lib/db/audit";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";
import type { AgentStatus } from "@/types/app";

const QA_LIST_LIMIT = 24;
const QA_MESSAGE_LIMIT = 100;

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function getQaAvailabilityError(
  classification: "local" | "remote_managed" | "channel_connected",
  status: string
): string | null {
  if (classification === "remote_managed") {
    return "QA no disponible para agentes gestionados por OpenAI en esta fase.";
  }

  if (!canAccessQaPanel({ hasConnection: classification !== "local", providerType: null, classification, label: "" }, status as AgentStatus)) {
    return "QA disponible solo para agentes activos o para agentes con WhatsApp conectado.";
  }

  return null;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "edit",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const qaAvailabilityError = getQaAvailabilityError(
    access.connectionSummary.classification,
    access.agent.status
  );
  if (qaAvailabilityError) {
    return NextResponse.json({ error: qaAvailabilityError }, { status: 403 });
  }

  const conversationsResult = await listConversations(agentId, session.organizationId);
  if (conversationsResult.error || !conversationsResult.data) {
    return NextResponse.json({ error: "No se pudieron cargar las conversaciones" }, { status: 500 });
  }

  const qaConversations = conversationsResult.data.filter(isQaConversation).slice(0, QA_LIST_LIMIT);
  const summaries = await Promise.all(
    qaConversations.map(async (conversation) => {
      const messageResult = await listMessages(conversation.id, session.organizationId, 1);
      return buildQaConversationSummary(conversation, messageResult.data ?? []);
    })
  );

  const requestedConversationId = new URL(request.url).searchParams.get("conversationId");
  const selectedConversationId = requestedConversationId ?? summaries[0]?.id ?? null;
  const selectedConversation = qaConversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  if (!selectedConversation) {
    return NextResponse.json({
      data: {
        stats: buildQaStats(conversationsResult.data),
        summaries,
        selectedConversation: null,
        messages: [],
      },
    });
  }

  const messagesResult = await listMessages(selectedConversation.id, session.organizationId, QA_MESSAGE_LIMIT);
  if (messagesResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la conversacion seleccionada" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      stats: buildQaStats(conversationsResult.data),
      summaries,
      selectedConversation: buildQaConversationDetail(selectedConversation),
      messages: messagesResult.data ?? [],
    },
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "edit",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const qaAvailabilityError = getQaAvailabilityError(
    access.connectionSummary.classification,
    access.agent.status
  );
  if (qaAvailabilityError) {
    return NextResponse.json({ error: qaAvailabilityError }, { status: 403 });
  }

  const parsedBody = await parseJsonRequestBody(request, qaReviewUpdateSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const conversationResult = await getConversationById(
    parsedBody.data.conversationId,
    agentId,
    session.organizationId
  );
  if (conversationResult.error || !conversationResult.data) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  const messagesResult = await listMessages(parsedBody.data.conversationId, session.organizationId, QA_MESSAGE_LIMIT);
  if (messagesResult.error) {
    return NextResponse.json({ error: "No se pudieron validar los mensajes" }, { status: 500 });
  }

  const messageReviews = parsedBody.data.messageReviews ?? [];
  const messageRoleById = new Map((messagesResult.data ?? []).map((message) => [message.id, message.role]));
  const invalidReview = messageReviews.find((review) => !messageRoleById.has(review.messageId));
  if (invalidReview) {
    return NextResponse.json({ error: "Uno de los mensajes revisados no pertenece a la conversacion" }, { status: 400 });
  }

  const invalidRoleReview = messageReviews.find(
    (review) => messageRoleById.get(review.messageId) !== "assistant"
  );
  if (invalidRoleReview) {
    return NextResponse.json({ error: "Solo puedes revisar mensajes del agente" }, { status: 400 });
  }

  const qaReview = buildPersistedQaReview({ ...parsedBody.data, messageReviews }, session.user.id);
  const updateResult = await updateConversationMetadata(
    parsedBody.data.conversationId,
    agentId,
    session.organizationId,
    { qa_review: qaReview }
  );

  if (updateResult.error || !updateResult.data) {
    return NextResponse.json({ error: "No se pudo guardar la revision QA" }, { status: 500 });
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "conversation.qa_review_updated",
    resourceType: "conversation",
    resourceId: parsedBody.data.conversationId,
    newValue: {
      conversation_status: qaReview?.conversationStatus ?? null,
      message_reviews: messageReviews.length,
      qa_review_cleared: qaReview === null,
    },
  });

  return NextResponse.json({
    data: {
      conversation: buildQaConversationDetail(updateResult.data),
    },
  });
}



