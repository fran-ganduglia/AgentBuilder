import "server-only";

import { readConversationMetadata } from "@/lib/chat/conversation-metadata";
import {
  createConversation,
  findConversationByExternalId,
  updateConversationMetadata,
} from "@/lib/db/conversations";
import { enqueueEvent } from "@/lib/db/event-queue";
import { findMessageByFingerprint, insertMessageWithServiceRole } from "@/lib/db/messages";
import { normalizeWhatsAppIdentifier } from "@/lib/whatsapp-cloud";
import type { AgentConnection, Conversation } from "@/types/app";
import type { Json } from "@/types/database";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          wa_id?: string;
          profile?: {
            name?: string;
          };
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
        }>;
      };
    }>;
  }>;
};

type IngestionResult = {
  conversationsTouched: number;
  messagesInserted: number;
  duplicateMessages: number;
  skippedEvents: number;
  enqueuedInboundEvents: number;
};

type ConversationSeed = {
  externalId: string;
  contactId: string;
  contactName: string | null;
  sourceLabel: string;
  startedAt: string;
};

function normalizePhoneLikeValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhatsAppIdentifier(value);
  return normalized ? normalized.replace(/[^\d]/g, "") : null;
}

function toIsoTimestamp(timestamp: string | null | undefined): string {
  const numericTimestamp = Number(timestamp ?? 0);
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return new Date().toISOString();
  }

  return new Date(numericTimestamp * 1000).toISOString();
}

function buildConversationExternalId(phoneNumberId: string, contactId: string): string {
  return `whatsapp:${phoneNumberId}:${contactId}`;
}

function getConnectionMetadataValue(metadata: Json | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isWorkerAutoReplyConnection(connection: AgentConnection): boolean {
  return getConnectionMetadataValue(connection.metadata, "auto_reply_mode") === "worker";
}

function getSourceLabel(
  connection: AgentConnection,
  displayPhoneNumber: string | null | undefined
): string {
  const connectionLabel = getConnectionMetadataValue(connection.metadata, "display_phone_number");

  if (typeof displayPhoneNumber === "string" && displayPhoneNumber.trim().length > 0) {
    return displayPhoneNumber.trim();
  }

  if (connectionLabel) {
    return connectionLabel;
  }

  return "WhatsApp conectado";
}

async function getOrCreateWhatsAppConversation(
  connection: AgentConnection,
  seed: ConversationSeed
): Promise<Conversation> {
  const existingConversation = await findConversationByExternalId(
    connection.agent_id,
    connection.organization_id,
    seed.externalId,
    "whatsapp",
    { useServiceRole: true }
  );

  if (existingConversation.error) {
    throw new Error(existingConversation.error);
  }

  const sourceContext = {
    contact_name: seed.contactName ?? undefined,
    contact_id: seed.contactId,
    source_label: seed.sourceLabel,
    last_synced_at: new Date().toISOString(),
  };

  if (existingConversation.data) {
    const updatedConversation = await updateConversationMetadata(
      existingConversation.data.id,
      connection.agent_id,
      connection.organization_id,
      {
        chat_mode: "live_external",
        source_context: {
          ...(readConversationMetadata(existingConversation.data.metadata).source_context ?? {}),
          ...sourceContext,
        },
      },
      { useServiceRole: true }
    );

    if (updatedConversation.error || !updatedConversation.data) {
      throw new Error(updatedConversation.error ?? "No se pudo actualizar la conversacion conectada");
    }

    return updatedConversation.data;
  }

  const createdConversation = await createConversation(connection.agent_id, connection.organization_id, null, {
    channel: "whatsapp",
    status: "active",
    externalId: seed.externalId,
    startedAt: seed.startedAt,
    useServiceRole: true,
    metadata: {
      chat_mode: "live_external",
      source_context: sourceContext,
    },
  });

  if (createdConversation.error || !createdConversation.data) {
    throw new Error(createdConversation.error ?? "No se pudo crear la conversacion conectada");
  }

  return createdConversation.data;
}

function resolveMessageRole(
  senderId: string,
  businessDisplayPhoneNumber: string | null | undefined
): "user" | "assistant" {
  const normalizedSenderId = normalizePhoneLikeValue(senderId);
  const normalizedBusinessNumber = normalizePhoneLikeValue(businessDisplayPhoneNumber);

  if (normalizedSenderId && normalizedBusinessNumber && normalizedSenderId === normalizedBusinessNumber) {
    return "assistant";
  }

  return "user";
}

function shouldIgnoreAssistantReflection(connection: AgentConnection, role: "user" | "assistant"): boolean {
  return role === "assistant" && isWorkerAutoReplyConnection(connection);
}

function enqueueInboundWhatsAppEvent(input: {
  connection: AgentConnection;
  conversationId: string;
  messageId: string;
  whatsappMessageId: string;
  content: string;
  createdAt: string;
}): void {
  void enqueueEvent({
    organizationId: input.connection.organization_id,
    eventType: "whatsapp.inbound_message_received",
    entityType: "message",
    entityId: input.messageId,
    idempotencyKey: `whatsapp.inbound_message_received:${input.whatsappMessageId}`,
    payload: {
      message_id: input.messageId,
      conversation_id: input.conversationId,
      agent_id: input.connection.agent_id,
      connection_id: input.connection.id,
      integration_id: input.connection.integration_id,
      phone_number_id: input.connection.provider_agent_id,
      whatsapp_message_id: input.whatsappMessageId,
      content: input.content,
      created_at: input.createdAt,
    },
  });
}

export async function ingestWhatsAppWebhookPayload(
  connection: AgentConnection,
  payload: WhatsAppWebhookPayload
): Promise<IngestionResult> {
  const result: IngestionResult = {
    conversationsTouched: 0,
    messagesInserted: 0,
    duplicateMessages: 0,
    skippedEvents: 0,
    enqueuedInboundEvents: 0,
  };
  const touchedConversationIds = new Set<string>();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        result.skippedEvents += 1;
        continue;
      }

      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (phoneNumberId !== connection.provider_agent_id) {
        result.skippedEvents += 1;
        continue;
      }

      const displayPhoneNumber = change.value?.metadata?.display_phone_number;
      const contacts = change.value?.contacts ?? [];
      const contactsById = new Map(
        contacts
          .map((contact) => {
            const contactId = normalizeWhatsAppIdentifier(contact.wa_id);
            if (!contactId) {
              return null;
            }

            return [contactId, contact.profile?.name ?? null] as const;
          })
          .filter((entryValue): entryValue is readonly [string, string | null] => entryValue !== null)
      );
      const fallbackContactId = normalizeWhatsAppIdentifier(contacts[0]?.wa_id);
      const fallbackContactName = contacts[0]?.profile?.name ?? null;

      for (const message of change.value?.messages ?? []) {
        if (message.type !== "text") {
          result.skippedEvents += 1;
          continue;
        }

        const content = message.text?.body?.trim();
        const senderId = normalizeWhatsAppIdentifier(message.from);
        const whatsappMessageId = normalizeWhatsAppIdentifier(message.id);
        if (!content || !senderId || !whatsappMessageId) {
          result.skippedEvents += 1;
          continue;
        }

        const role = resolveMessageRole(senderId, displayPhoneNumber);
        if (shouldIgnoreAssistantReflection(connection, role)) {
          result.skippedEvents += 1;
          continue;
        }

        const contactId = role === "assistant" ? fallbackContactId : senderId;
        if (!contactId) {
          result.skippedEvents += 1;
          continue;
        }

        const createdAt = toIsoTimestamp(message.timestamp);
        const conversation = await getOrCreateWhatsAppConversation(connection, {
          externalId: buildConversationExternalId(phoneNumberId, contactId),
          contactId,
          contactName: contactsById.get(contactId) ?? fallbackContactName,
          sourceLabel: getSourceLabel(connection, displayPhoneNumber),
          startedAt: createdAt,
        });

        touchedConversationIds.add(conversation.id);

        const existingMessage = await findMessageByFingerprint(
          conversation.id,
          connection.organization_id,
          role,
          content,
          createdAt,
          { useServiceRole: true }
        );

        if (existingMessage.error) {
          throw new Error(existingMessage.error);
        }

        if (existingMessage.data) {
          result.duplicateMessages += 1;
          continue;
        }

        const insertResult = await insertMessageWithServiceRole({
          agentId: connection.agent_id,
          conversationId: conversation.id,
          organizationId: connection.organization_id,
          role,
          content,
          createdAt,
        });

        if (insertResult.error || !insertResult.data) {
          throw new Error(insertResult.error ?? "No se pudo guardar el mensaje de WhatsApp");
        }

        result.messagesInserted += 1;

        if (role === "user") {
          enqueueInboundWhatsAppEvent({
            connection,
            conversationId: conversation.id,
            messageId: insertResult.data.id,
            whatsappMessageId,
            content,
            createdAt,
          });
          result.enqueuedInboundEvents += 1;
        }
      }
    }
  }

  result.conversationsTouched = touchedConversationIds.size;
  return result;
}
