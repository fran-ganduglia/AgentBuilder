import { NextResponse } from "next/server";
import { areWorkersEnabled, getWorkersDisabledResponse, validateCronRequest } from "@/lib/workers/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { readConversationMetadata } from "@/lib/chat/conversation-metadata";
import { updateConversationMetadata } from "@/lib/db/conversations";
import { getServiceRoleAgentConnectionByAgentId } from "@/lib/db/agent-connections";
import { getWhatsAppIntegrationConfig } from "@/lib/db/whatsapp-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp-cloud";
import type { Json } from "@/types/database";

const STALE_AFTER_HOURS = 24;
const BATCH_LIMIT = 10;
const FOLLOW_UP_MESSAGE = "Hola, ¿necesitas más ayuda? Estoy aquí si tienes alguna pregunta.";

type StaleWhatsAppConversation = {
  id: string;
  agent_id: string;
  organization_id: string;
  metadata: Json;
};

async function listStaleWhatsAppConversations(): Promise<StaleWhatsAppConversation[]> {
  const supabase = createServiceSupabaseClient();
  const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, agent_id, organization_id, metadata")
    .eq("status", "active")
    .eq("channel", "whatsapp")
    .lt("started_at", staleThreshold)
    .is("ended_at", null)
    .limit(BATCH_LIMIT);

  if (error || !data) {
    return [];
  }

  return data as StaleWhatsAppConversation[];
}

async function sendFollowUp(conversation: StaleWhatsAppConversation): Promise<void> {
  const metadata = readConversationMetadata(conversation.metadata);
  const recipient = metadata.source_context?.contact_id;

  if (!recipient) {
    console.warn("worker.whatsapp.followup.no_recipient", {
      conversationId: conversation.id,
      organizationId: conversation.organization_id,
    });
    return;
  }

  const connectionResult = await getServiceRoleAgentConnectionByAgentId(
    conversation.agent_id,
    conversation.organization_id
  );

  if (connectionResult.error || !connectionResult.data) {
    throw new Error(connectionResult.error ?? "No se encontro conexion WhatsApp");
  }

  const connection = connectionResult.data;

  if (connection.provider_type !== "whatsapp") {
    return;
  }

  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    connection.integration_id,
    conversation.organization_id
  );

  if (integrationConfigResult.error || !integrationConfigResult.data) {
    throw new Error(integrationConfigResult.error ?? "No se pudo cargar la integracion WhatsApp");
  }

  const integrationAccess = assertUsableIntegration(integrationConfigResult.data.integration);
  if (!integrationAccess.ok) {
    console.warn("worker.whatsapp.followup.integration_unavailable", {
      conversationId: conversation.id,
      organizationId: conversation.organization_id,
      status: integrationAccess.status,
    });
    return;
  }

  const sentAt = new Date().toISOString();

  await sendWhatsAppTextMessage({
    accessToken: integrationConfigResult.data.accessToken,
    phoneNumberId: connection.provider_agent_id,
    to: recipient,
    body: FOLLOW_UP_MESSAGE,
    context: {
      organizationId: conversation.organization_id,
      integrationId: connection.integration_id,
      methodKey: "whatsapp.followup.send",
    },
  });

  await updateConversationMetadata(
    conversation.id,
    conversation.agent_id,
    conversation.organization_id,
    { last_auto_reply_at: sentAt },
    { useServiceRole: true }
  );
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const stale = await listStaleWhatsAppConversations();

  if (stale.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  let processed = 0;
  let failed = 0;

  for (const conversation of stale) {
    try {
      await sendFollowUp(conversation);
      console.info("worker.whatsapp.followup.sent", {
        conversationId: conversation.id,
        organizationId: conversation.organization_id,
      });
      processed++;
    } catch (err) {
      console.error("worker.whatsapp.followup.error", {
        conversationId: conversation.id,
        organizationId: conversation.organization_id,
        error: err instanceof Error ? err.message : "unknown",
      });
      failed++;
    }
  }

  return NextResponse.json({ data: { processed, failed } });
}
