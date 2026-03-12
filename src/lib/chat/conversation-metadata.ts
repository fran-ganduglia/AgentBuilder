import { z } from "zod";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
import type { Json, Tables } from "@/types/database";

export const CHAT_MODES = ["sandbox", "live_local", "live_external", "qa_imported"] as const;
export const QA_REVIEW_STATUSES = ["approved", "fixable", "critical"] as const;

export type ChatMode = (typeof CHAT_MODES)[number];
export type QaReviewStatus = (typeof QA_REVIEW_STATUSES)[number];
export type ConversationRow = Tables<"conversations">;

export const messageQaReviewSchema = z.object({
  messageId: z.string().uuid("messageId invalido"),
  status: z.enum(QA_REVIEW_STATUSES),
  note: z.string().max(1000, "La nota no puede superar 1000 caracteres").optional(),
});

export const conversationQaReviewSchema = z.object({
  conversationStatus: z.enum(QA_REVIEW_STATUSES).optional(),
  conversationNote: z.string().max(2000, "La nota no puede superar 2000 caracteres").optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().uuid("reviewedBy invalido").optional(),
  messageReviews: z.array(messageQaReviewSchema).max(200, "Demasiadas revisiones de mensajes").default([]),
});

export const pendingSalesforceToolActionSchema = z.object({
  tool: z.literal("salesforce_crm"),
  integrationId: z.string().uuid("integrationId invalido"),
  actionInput: executeSalesforceCrmToolSchema,
  summary: z.string().min(1).max(500),
  initiatedBy: z.string().uuid("initiatedBy invalido"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

type SourceContext = {
  contact_name?: string;
  contact_id?: string;
  source_label?: string;
  imported_at?: string;
  last_synced_at?: string;
};

export type MessageQaReview = z.infer<typeof messageQaReviewSchema>;
export type ConversationQaReview = z.infer<typeof conversationQaReviewSchema>;
export type PendingSalesforceToolAction = z.infer<typeof pendingSalesforceToolActionSchema>;

export type ConversationMetadata = {
  chat_mode?: ChatMode;
  qa_review?: ConversationQaReview | null;
  source_context?: SourceContext;
  pending_tool_action?: PendingSalesforceToolAction | null;
};

const sourceContextSchema = z.object({
  contact_name: z.string().optional(),
  contact_id: z.string().optional(),
  source_label: z.string().optional(),
  imported_at: z.string().optional(),
  last_synced_at: z.string().optional(),
});

const conversationMetadataSchema = z.object({
  chat_mode: z.enum(CHAT_MODES).optional(),
  qa_review: conversationQaReviewSchema.optional(),
  source_context: sourceContextSchema.optional(),
  pending_tool_action: pendingSalesforceToolActionSchema.optional(),
});

function toRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function buildSourceContext(sourceContext?: SourceContext): SourceContext | undefined {
  if (!sourceContext) {
    return undefined;
  }

  const next: SourceContext = {};

  if (sourceContext.contact_name) {
    next.contact_name = sourceContext.contact_name;
  }

  if (sourceContext.contact_id) {
    next.contact_id = sourceContext.contact_id;
  }

  if (sourceContext.source_label) {
    next.source_label = sourceContext.source_label;
  }

  if (sourceContext.imported_at) {
    next.imported_at = sourceContext.imported_at;
  }

  if (sourceContext.last_synced_at) {
    next.last_synced_at = sourceContext.last_synced_at;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function buildQaReview(review?: ConversationQaReview | null): ConversationQaReview | undefined {
  if (!review) {
    return undefined;
  }

  const next: ConversationQaReview = {
    ...(review.conversationStatus ? { conversationStatus: review.conversationStatus } : {}),
    ...(review.conversationNote ? { conversationNote: review.conversationNote } : {}),
    ...(review.reviewedAt ? { reviewedAt: review.reviewedAt } : {}),
    ...(review.reviewedBy ? { reviewedBy: review.reviewedBy } : {}),
    messageReviews: review.messageReviews ?? [],
  };

  const hasContent =
    next.conversationStatus !== undefined ||
    next.conversationNote !== undefined ||
    next.reviewedAt !== undefined ||
    next.reviewedBy !== undefined ||
    next.messageReviews.length > 0;

  return hasContent ? next : undefined;
}

function buildPendingToolAction(action?: PendingSalesforceToolAction | null): PendingSalesforceToolAction | undefined {
  if (!action) {
    return undefined;
  }

  const parsed = pendingSalesforceToolActionSchema.safeParse(action);
  return parsed.success ? parsed.data : undefined;
}

export function readConversationMetadata(value: Json | null | undefined): ConversationMetadata {
  const parsed = conversationMetadataSchema.safeParse(toRecord(value));

  if (!parsed.success) {
    return {};
  }

  return parsed.data;
}

export function readPendingToolAction(value: Json | null | undefined): PendingSalesforceToolAction | null {
  return readConversationMetadata(value).pending_tool_action ?? null;
}

export function isPendingToolActionExpired(action: PendingSalesforceToolAction, now = Date.now()): boolean {
  return new Date(action.expiresAt).getTime() <= now;
}

export function resolveConversationChatMode(conversation: Pick<ConversationRow, "channel" | "metadata">): ChatMode {
  const metadata = readConversationMetadata(conversation.metadata);

  if (metadata.chat_mode) {
    return metadata.chat_mode;
  }

  if (conversation.channel === "whatsapp") {
    return "qa_imported";
  }

  return "live_local";
}

export function mergeConversationMetadata(
  existing: Json | null | undefined,
  patch: ConversationMetadata
): Json {
  const current = readConversationMetadata(existing);
  const nextChatMode = patch.chat_mode ?? current.chat_mode;
  const nextQaReview =
    patch.qa_review === null
      ? undefined
      : buildQaReview(patch.qa_review === undefined ? current.qa_review : patch.qa_review);
  const nextSourceContext = patch.source_context
    ? buildSourceContext({ ...(current.source_context ?? {}), ...patch.source_context })
    : buildSourceContext(current.source_context);
  const nextPendingToolAction =
    patch.pending_tool_action === null
      ? undefined
      : buildPendingToolAction(
          patch.pending_tool_action === undefined
            ? current.pending_tool_action
            : patch.pending_tool_action
        );
  const next: ConversationMetadata = {};

  if (nextChatMode) {
    next.chat_mode = nextChatMode;
  }

  if (nextQaReview) {
    next.qa_review = nextQaReview;
  }

  if (nextSourceContext) {
    next.source_context = nextSourceContext;
  }

  if (nextPendingToolAction) {
    next.pending_tool_action = nextPendingToolAction;
  }

  return next as Json;
}
