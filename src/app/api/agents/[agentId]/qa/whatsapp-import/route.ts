import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { whatsappImportSchema } from "@/lib/chat/qa";
import { findConversationByExternalId, createConversation } from "@/lib/db/conversations";
import { insertAuditLog } from "@/lib/db/audit";
import { insertMessage } from "@/lib/db/messages";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import { getQaAvailabilityError } from "@/lib/agents/qa-access";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
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

  const parsedBody = await parseJsonRequestBody(request, whatsappImportSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const existingConversation = await findConversationByExternalId(
    agentId,
    session.organizationId,
    parsedBody.data.externalId,
    "whatsapp"
  );

  if (existingConversation.error) {
    return NextResponse.json({ error: "No se pudo revisar si la conversacion ya existe" }, { status: 500 });
  }

  if (existingConversation.data) {
    return NextResponse.json({
      data: {
        conversationId: existingConversation.data.id,
        imported: false,
      },
    });
  }

  const firstTimestamp = parsedBody.data.messages[0]?.createdAt ?? new Date().toISOString();
  const conversationResult = await createConversation(agentId, session.organizationId, null, {
    channel: "whatsapp",
    status: "closed",
    externalId: parsedBody.data.externalId,
    startedAt: firstTimestamp,
    metadata: {
      chat_mode: "qa_imported",
      source_context: {
        contact_name: parsedBody.data.contactName,
        contact_id: parsedBody.data.contactId,
        source_label: parsedBody.data.sourceLabel ?? "WhatsApp importado",
        imported_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
    },
  });

  if (conversationResult.error || !conversationResult.data) {
    return NextResponse.json({ error: "No se pudo crear la conversacion importada" }, { status: 500 });
  }

  for (const message of parsedBody.data.messages) {
    const insertResult = await insertMessage({
      agentId,
      conversationId: conversationResult.data.id,
      organizationId: session.organizationId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt ?? null,
    });

    if (insertResult.error) {
      return NextResponse.json({ error: "No se pudieron importar los mensajes de WhatsApp" }, { status: 500 });
    }
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "conversation.whatsapp_imported",
    resourceType: "conversation",
    resourceId: conversationResult.data.id,
    newValue: {
      external_id: parsedBody.data.externalId,
      messages: parsedBody.data.messages.length,
    },
  });

  return NextResponse.json({
    data: {
      conversationId: conversationResult.data.id,
      imported: true,
    },
  });
}

