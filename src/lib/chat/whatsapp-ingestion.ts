import "server-only";

import { readConversationMetadata } from "@/lib/chat/conversation-metadata";
import { createConversation, findConversationByExternalId, updateConversationMetadata } from "@/lib/db/conversations";
import { findMessageByFingerprint, insertMessageWithServiceRole } from "@/lib/db/messages";
import type { AgentConnection, Conversation } from "@/types/app";
import { normalizeWhatsAppIdentifier } from "@/lib/whatsapp-cloud";

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

function buildConversationExternalId(
  phoneNumberId: string,
  contactId: string
): string {
  return `whatsapp:${phoneNumberId}:${contactId}`;
}

function getSourceLabel(
  connection: AgentConnection,
  displayPhoneNumber: string | null | undefined
): string {
  const metadata = connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata)
    ? connection.metadata
    : null;
  const connectionLabel = metadata ? Reflect.get(metadata, "display_phone_number") : null;

  if (typeof displayPhoneNumber === "string" && displayPhoneNumber.trim().length > 0) {
    return displayPhoneNumber.trim();
  }

  if (typeof connectionLabel === "string" && connectionLabel.trim().length > 0) {
    return connectionLabel.trim();
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

  const createdConversation = await createConversation(
    connection.agent_id,
    connection.organization_id,
    null,
    {
      channel: "whatsapp",
      status: "active",
      externalId: seed.externalId,
      startedAt: seed.startedAt,
      useServiceRole: true,
      metadata: {
        chat_mode: "live_external",
        source_context: sourceContext,
      },
    }
  );

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

export async function ingestWhatsAppWebhookPayload(
  connection: AgentConnection,
  payload: WhatsAppWebhookPayload
): Promise<IngestionResult> {
  const result: IngestionResult = {
    conversationsTouched: 0,
    messagesInserted: 0,
    duplicateMessages: 0,
    skippedEvents: 0,
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
        if (!content || !senderId) {
          result.skippedEvents += 1;
          continue;
        }

        const role = resolveMessageRole(senderId, displayPhoneNumber);
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

        if (insertResult.error) {
          throw new Error(insertResult.error);
        }

        result.messagesInserted += 1;
      }
    }
  }

  result.conversationsTouched = touchedConversationIds.size;
  return result;
}
