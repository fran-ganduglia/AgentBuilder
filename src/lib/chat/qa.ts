import { z } from "zod";
import {
  conversationQaReviewSchema,
  messageQaReviewSchema,
  QA_REVIEW_STATUSES,
  readConversationMetadata,
  resolveConversationChatMode,
  type ChatMode,
  type ConversationQaReview,
  type MessageQaReview,
} from "@/lib/chat/conversation-metadata";
import type { Conversation, Message } from "@/types/app";

export const qaReviewUpdateSchema = z.object({
  conversationId: z.string().uuid("conversationId invalido"),
  conversationStatus: z.enum(QA_REVIEW_STATUSES).optional(),
  conversationNote: z.string().max(2000, "La nota no puede superar 2000 caracteres").optional(),
  messageReviews: z.array(messageQaReviewSchema).max(200, "Demasiadas revisiones de mensajes").default([]),
});

export const whatsappImportMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "El contenido no puede estar vacio").max(8000, "El mensaje es demasiado largo"),
  createdAt: z.string().datetime().optional(),
});

export const whatsappImportSchema = z.object({
  externalId: z.string().min(1, "externalId es requerido").max(160, "externalId es demasiado largo"),
  contactName: z.string().min(1, "El alias es requerido").max(120, "El alias es demasiado largo"),
  contactId: z.string().max(120, "El identificador es demasiado largo").optional(),
  sourceLabel: z.string().max(120, "La fuente es demasiado larga").optional(),
  messages: z.array(whatsappImportMessageSchema).min(1, "Debes enviar al menos un mensaje").max(200, "Demasiados mensajes"),
});

export type QaReviewUpdateInput = z.infer<typeof qaReviewUpdateSchema>;
export type WhatsappImportInput = z.infer<typeof whatsappImportSchema>;
export type QaStats = {
  sandboxCount: number;
  liveLocalCount: number;
  liveExternalCount: number;
  qaImportedCount: number;
  realCount: number;
};

export type QaConversationSummary = {
  id: string;
  channel: string;
  chatMode: ChatMode;
  externalId: string | null;
  startedAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  messageCount: number;
  title: string;
  subtitle: string;
  review: ConversationQaReview | null;
};

export type QaConversationDetail = {
  id: string;
  channel: string;
  chatMode: ChatMode;
  externalId: string | null;
  startedAt: string | null;
  title: string;
  subtitle: string;
  review: ConversationQaReview | null;
};

type PersistedQaReviewInput = Omit<QaReviewUpdateInput, "messageReviews"> & {
  messageReviews: MessageQaReview[];
};

function buildConversationTitle(conversation: Conversation): string {
  const metadata = readConversationMetadata(conversation.metadata);
  const contactName = metadata.source_context?.contact_name?.trim();
  const chatMode = resolveConversationChatMode(conversation);

  if (contactName) {
    return contactName;
  }

  if (chatMode === "live_external") {
    return "WhatsApp conectado";
  }

  if (chatMode === "qa_imported") {
    return "WhatsApp importado";
  }

  return "Chat local";
}

function buildConversationSubtitle(conversation: Conversation): string {
  const metadata = readConversationMetadata(conversation.metadata);
  const contactId = metadata.source_context?.contact_id?.trim();
  const sourceLabel = metadata.source_context?.source_label?.trim();
  const chatMode = resolveConversationChatMode(conversation);

  if (contactId && sourceLabel) {
    return `${sourceLabel} - ${contactId}`;
  }

  if (contactId) {
    return contactId;
  }

  if (sourceLabel) {
    return sourceLabel;
  }

  if (chatMode === "live_external") {
    return "Canal conectado en solo lectura";
  }

  if (chatMode === "qa_imported") {
    return "Transcript importado manualmente";
  }

  return "Conversacion real local";
}

export function isQaConversation(conversation: Conversation): boolean {
  return resolveConversationChatMode(conversation) !== "sandbox";
}

export function buildQaConversationDetail(conversation: Conversation): QaConversationDetail {
  const metadata = readConversationMetadata(conversation.metadata);

  return {
    id: conversation.id,
    channel: conversation.channel,
    chatMode: resolveConversationChatMode(conversation),
    externalId: conversation.external_id,
    startedAt: conversation.started_at ?? null,
    title: buildConversationTitle(conversation),
    subtitle: buildConversationSubtitle(conversation),
    review: metadata.qa_review ?? null,
  };
}

export function buildQaConversationSummary(
  conversation: Conversation,
  messages: Message[]
): QaConversationSummary {
  const metadata = readConversationMetadata(conversation.metadata);
  const lastMessage = messages[messages.length - 1] ?? null;

  return {
    id: conversation.id,
    channel: conversation.channel,
    chatMode: resolveConversationChatMode(conversation),
    externalId: conversation.external_id,
    startedAt: conversation.started_at ?? null,
    lastMessageAt: lastMessage?.created_at ?? conversation.started_at ?? null,
    lastMessagePreview: lastMessage?.content.slice(0, 180) ?? null,
    messageCount: messages.length,
    title: buildConversationTitle(conversation),
    subtitle: buildConversationSubtitle(conversation),
    review: metadata.qa_review ?? null,
  };
}

export function buildQaStats(conversations: Conversation[]): QaStats {
  return conversations.reduce<QaStats>(
    (acc, conversation) => {
      const chatMode = resolveConversationChatMode(conversation);

      if (chatMode === "sandbox") {
        acc.sandboxCount += 1;
        return acc;
      }

      if (chatMode === "qa_imported") {
        acc.qaImportedCount += 1;
        return acc;
      }

      if (chatMode === "live_external") {
        acc.liveExternalCount += 1;
        acc.realCount += 1;
        return acc;
      }

      if (chatMode === "live_local") {
        acc.liveLocalCount += 1;
        acc.realCount += 1;
      }

      return acc;
    },
    {
      sandboxCount: 0,
      liveLocalCount: 0,
      liveExternalCount: 0,
      qaImportedCount: 0,
      realCount: 0,
    }
  );
}

export function buildPersistedQaReview(
  input: PersistedQaReviewInput,
  reviewedBy: string
): ConversationQaReview | null {
  const conversationNote = input.conversationNote?.trim();

  if (!input.conversationStatus && !conversationNote && input.messageReviews.length === 0) {
    return null;
  }

  return {
    ...(input.conversationStatus ? { conversationStatus: input.conversationStatus } : {}),
    ...(conversationNote ? { conversationNote } : {}),
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    messageReviews: input.messageReviews,
  };
}

export type QaReviewValue = z.infer<typeof conversationQaReviewSchema>;
