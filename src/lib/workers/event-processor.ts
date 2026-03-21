import "server-only";

import { persistAssistantReply } from "@/lib/chat/non-stream-persistence";
import { executeNonStreamingAgentTurn } from "@/lib/chat/non-stream-executor";
import { readConversationMetadata } from "@/lib/chat/conversation-metadata";
import { activateWorkflowsForAgent } from "@/lib/agents/n8n-activation";
import {
  getAgentConnectionByIdWithServiceRole,
} from "@/lib/db/agent-connections";
import { getConversationByIdWithServiceRole, incrementConversationMessageCount } from "@/lib/db/conversations";
import { insertPlanLimitNotification } from "@/lib/db/notifications-writer";
import { getWhatsAppIntegrationConfig } from "@/lib/db/whatsapp-integrations";
import {
  incrementMessageCount,
  resolveProviderFromModel,
} from "@/lib/db/usage-records";
import { getCurrentOrganizationSessionUsage } from "@/lib/db/session-usage";
import { assertUsableIntegration } from "@/lib/integrations/access";
import type { AgentSetupState } from "@/lib/agents/agent-setup";
import { buildWorkflowStepEventFromRuntimeDispatch } from "@/lib/runtime/runtime-queue-dispatcher";
import { processWorkflowStepExecution } from "@/lib/workflows/execution";
import type { EventRow } from "@/lib/workers/event-queue";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp-cloud";

export async function processMessageCreated(event: EventRow): Promise<void> {
  const payload = event.payload as {
    role?: string;
    conversation_id?: string;
    agent_id?: string;
    llm_model?: string;
  };

  if (payload.role !== "assistant") {
    return;
  }

  const { organization_id: organizationId } = event;
  const agentId = payload.agent_id;
  const conversationId = payload.conversation_id;

  if (!agentId) {
    throw new Error("event.message.created missing agent_id");
  }

  const llmProvider = resolveProviderFromModel(payload.llm_model ?? null);
  const incrementResult = await incrementMessageCount({ organizationId, agentId, llmProvider });

  if (incrementResult === null) {
    throw new Error("increment_usage_messages RPC failed");
  }

  if (conversationId) {
    try {
      await incrementConversationMessageCount(conversationId, organizationId);
    } catch (err) {
      console.error("event_processor.increment_conversation_count_failed", {
        conversationId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const sessionUsage = await getCurrentOrganizationSessionUsage(organizationId);
  if (sessionUsage.planLimit && sessionUsage.planLimit > 0) {
    await insertPlanLimitNotification({
      organizationId,
      currentUsage: sessionUsage.currentSessions,
      planLimit: sessionUsage.planLimit,
    });
  }
}

export async function processConversationCreated(
  _event: EventRow // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  // No-op - placeholder for future logic
}

export async function processAgentUpdated(event: EventRow): Promise<void> {
  const payload = event.payload as {
    status?: string;
    agent_id?: string;
    setup_state?: AgentSetupState;
  };

  if (payload.status !== "active") {
    return;
  }

  const agentId = payload.agent_id;
  if (!agentId) {
    throw new Error("event.agent.updated missing agent_id");
  }

  if (!payload.setup_state) {
    return;
  }

  await activateWorkflowsForAgent(agentId, event.organization_id, payload.setup_state);
}

export async function processWhatsAppInboundMessageReceived(event: EventRow): Promise<void> {
  const payload = event.payload as {
    conversation_id?: string;
    connection_id?: string;
    phone_number_id?: string;
    content?: string;
  };

  if (!payload.conversation_id || !payload.connection_id || !payload.content) {
    throw new Error("event.whatsapp.inbound_message_received missing required payload fields");
  }

  const connectionResult = await getAgentConnectionByIdWithServiceRole(
    payload.connection_id,
    event.organization_id
  );

  if (connectionResult.error) {
    throw new Error(connectionResult.error);
  }

  if (!connectionResult.data) {
    console.warn("whatsapp.auto_reply_connection_missing", {
      eventId: event.id,
      organizationId: event.organization_id,
      connectionId: payload.connection_id,
    });
    return;
  }

  if (
    payload.phone_number_id &&
    connectionResult.data.provider_agent_id !== payload.phone_number_id
  ) {
    console.warn("whatsapp.auto_reply_phone_number_changed", {
      eventId: event.id,
      organizationId: event.organization_id,
      connectionId: payload.connection_id,
      expectedPhoneNumberId: payload.phone_number_id,
      currentPhoneNumberId: connectionResult.data.provider_agent_id,
    });
    return;
  }

  const conversationResult = await getConversationByIdWithServiceRole(
    payload.conversation_id,
    connectionResult.data.agent_id,
    event.organization_id
  );

  if (conversationResult.error) {
    throw new Error(conversationResult.error);
  }

  if (!conversationResult.data) {
    console.warn("whatsapp.auto_reply_conversation_missing", {
      eventId: event.id,
      organizationId: event.organization_id,
      conversationId: payload.conversation_id,
    });
    return;
  }

  const conversationMetadata = readConversationMetadata(conversationResult.data.metadata);
  const recipient = conversationMetadata.source_context?.contact_id;

  if (!recipient) {
    console.warn("whatsapp.auto_reply_missing_recipient", {
      eventId: event.id,
      organizationId: event.organization_id,
      conversationId: payload.conversation_id,
    });
    return;
  }

  const execution = await executeNonStreamingAgentTurn({
    agentId: connectionResult.data.agent_id,
    organizationId: event.organization_id,
    conversationId: conversationResult.data.id,
    latestUserMessage: payload.content,
    orchestrationUserId: event.organization_id,
  });

  if (!execution.ok) {
    if (execution.status === 403 || execution.status === 404 || execution.status === 429) {
      console.warn("whatsapp.auto_reply_skipped", {
        eventId: event.id,
        organizationId: event.organization_id,
        status: execution.status,
        error: execution.error,
      });
      return;
    }

    throw new Error(execution.error);
  }

  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    connectionResult.data.integration_id,
    event.organization_id
  );

  if (integrationConfigResult.error || !integrationConfigResult.data) {
    throw new Error(integrationConfigResult.error ?? "No se pudo cargar la integracion de WhatsApp");
  }

  const integrationAccess = assertUsableIntegration(integrationConfigResult.data.integration);
  if (!integrationAccess.ok) {
    console.warn("whatsapp.auto_reply_integration_unavailable", {
      eventId: event.id,
      organizationId: event.organization_id,
      integrationId: connectionResult.data.integration_id,
      status: integrationAccess.status,
      message: integrationAccess.message,
    });
    return;
  }

  const sentAt = new Date().toISOString();
  const delivery = await sendWhatsAppTextMessage({
    accessToken: integrationConfigResult.data.accessToken,
    phoneNumberId: connectionResult.data.provider_agent_id,
    to: recipient,
    body: execution.reply.content,
    context: {
      organizationId: event.organization_id,
      integrationId: connectionResult.data.integration_id,
      methodKey: "whatsapp.messages.send",
    },
  });

  await persistAssistantReply({
    agentId: connectionResult.data.agent_id,
    conversationId: execution.conversation.id,
    organizationId: event.organization_id,
    content: execution.reply.content,
    llmModel: execution.reply.llmModel,
    llmProvider: execution.reply.llmProvider,
    responseTimeMs: execution.reply.responseTimeMs,
    tokensInput: execution.reply.tokensInput,
    tokensOutput: execution.reply.tokensOutput,
    conversationMetadataPatch: {
      ...(execution.reply.conversationMetadataPatch ?? {}),
      last_auto_reply_at: sentAt,
    },
  });

  console.info("whatsapp.auto_reply_sent", {
    eventId: event.id,
    organizationId: event.organization_id,
    conversationId: execution.conversation.id,
    providerMessageId: delivery.providerMessageId,
  });
}

export async function processWorkflowStepExecute(event: EventRow): Promise<void> {
  await processWorkflowStepExecution(event);
}

export async function processRuntimeQueueDispatch(event: EventRow): Promise<void> {
  const workflowStepEvent = await buildWorkflowStepEventFromRuntimeDispatch(event);
  await processWorkflowStepExecution(workflowStepEvent);
}
