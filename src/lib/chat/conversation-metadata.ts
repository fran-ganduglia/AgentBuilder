import { z } from "zod";
import {
  pendingChatFormSessionSchema,
  type PendingChatFormSession,
} from "@/lib/chat/chat-form-state";
import { CHAT_FORM_IDS } from "@/lib/chat/inline-forms";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
import { WHATSAPP_INTENT_SOURCES, WHATSAPP_KNOWN_INTENTS, type WhatsAppIntentSource, type WhatsAppKnownIntent } from "@/lib/chat/whatsapp-intents";
import type { Json, Tables } from "@/types/database";

export const CHAT_MODES = ["sandbox", "live_local", "live_external", "qa_imported"] as const;
export const QA_REVIEW_STATUSES = ["approved", "fixable", "critical"] as const;

const RECENT_CRM_TOOL_CONTEXT_MAX_CHARS = 4000;
const RECENT_CRM_TOOL_CONTEXT_DEFAULT_TTL_MS = 10 * 60 * 1000;
const RECENT_CRM_TOOL_CONTEXT_TTL_BY_PROVIDER: Record<string, number> = {
  gmail: 5 * 60 * 1000,
};

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

const genericActionInputSchema = z.record(z.string(), z.unknown());

export const pendingCrmActionSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  tool: z.string().trim().min(1).max(80),
  integrationId: z.string().uuid("integrationId invalido"),
  actionInput: genericActionInputSchema,
  summary: z.string().min(1).max(500),
  initiatedBy: z.string().uuid("initiatedBy invalido"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  sourceMessageId: z.string().uuid("sourceMessageId invalido").optional(),
  sourceContentHash: z.string().length(64, "sourceContentHash invalido").optional(),
  formId: z.enum(CHAT_FORM_IDS).optional(),
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

export const recentCrmToolContextSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  context: z.string().min(1).max(RECENT_CRM_TOOL_CONTEXT_MAX_CHARS),
  recordedAt: z.string().datetime(),
});

export const recentSalesforceToolContextSchema = z.object({
  context: z.string().min(1).max(RECENT_CRM_TOOL_CONTEXT_MAX_CHARS),
  recordedAt: z.string().datetime(),
});

type SourceContext = {
  contact_name?: string;
  contact_id?: string;
  source_label?: string;
  imported_at?: string;
  last_synced_at?: string;
};

type ConversationIntentMetadata = {
  active_intent?: WhatsAppKnownIntent | null;
  intent_confidence?: number | null;
  intent_source?: WhatsAppIntentSource | null;
  intent_updated_at?: string | null;
  needs_clarification?: boolean;
  last_auto_reply_at?: string | null;
};

export type MessageQaReview = z.infer<typeof messageQaReviewSchema>;
export type ConversationQaReview = z.infer<typeof conversationQaReviewSchema>;
export type PendingCrmAction<TActionInput = Record<string, unknown>> = Omit<
  z.infer<typeof pendingCrmActionSchema>,
  "actionInput"
> & {
  actionInput: TActionInput;
};
export type PendingSalesforceToolAction = z.infer<typeof pendingSalesforceToolActionSchema>;
export type RecentCrmToolContext = z.infer<typeof recentCrmToolContextSchema>;
export type RecentSalesforceToolContext = z.infer<typeof recentSalesforceToolContextSchema>;

export type ConversationMetadata = {
  chat_mode?: ChatMode;
  qa_review?: ConversationQaReview | null;
  source_context?: SourceContext;
  pending_chat_form?: PendingChatFormSession | null;
  pending_crm_action?: PendingCrmAction | null;
  recent_crm_tool_context?: RecentCrmToolContext | null;
  pending_tool_action?: PendingSalesforceToolAction | null;
  recent_salesforce_tool_context?: RecentSalesforceToolContext | null;
  active_intent?: WhatsAppKnownIntent | null;
  intent_confidence?: number | null;
  intent_source?: WhatsAppIntentSource | null;
  intent_updated_at?: string | null;
  needs_clarification?: boolean;
  last_auto_reply_at?: string | null;
};

const sourceContextSchema = z.object({
  contact_name: z.string().optional(),
  contact_id: z.string().optional(),
  source_label: z.string().optional(),
  imported_at: z.string().optional(),
  last_synced_at: z.string().optional(),
});

const conversationIntentMetadataSchema = z.object({
  active_intent: z.enum(WHATSAPP_KNOWN_INTENTS).optional(),
  intent_confidence: z.number().min(0).max(1).optional(),
  intent_source: z.enum(WHATSAPP_INTENT_SOURCES).optional(),
  intent_updated_at: z.string().datetime().optional(),
  needs_clarification: z.boolean().optional(),
  last_auto_reply_at: z.string().datetime().optional(),
});

const conversationMetadataSchema = z.object({
  chat_mode: z.enum(CHAT_MODES).optional(),
  qa_review: conversationQaReviewSchema.optional(),
  source_context: sourceContextSchema.optional(),
  pending_chat_form: pendingChatFormSessionSchema.optional(),
  pending_crm_action: pendingCrmActionSchema.optional(),
  recent_crm_tool_context: recentCrmToolContextSchema.optional(),
  pending_tool_action: pendingSalesforceToolActionSchema.optional(),
  recent_salesforce_tool_context: recentSalesforceToolContextSchema.optional(),
  active_intent: conversationIntentMetadataSchema.shape.active_intent,
  intent_confidence: conversationIntentMetadataSchema.shape.intent_confidence,
  intent_source: conversationIntentMetadataSchema.shape.intent_source,
  intent_updated_at: conversationIntentMetadataSchema.shape.intent_updated_at,
  needs_clarification: conversationIntentMetadataSchema.shape.needs_clarification,
  last_auto_reply_at: conversationIntentMetadataSchema.shape.last_auto_reply_at,
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

function buildConversationIntentMetadata(
  value?: ConversationIntentMetadata | null
): ConversationIntentMetadata | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = conversationIntentMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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

function buildPendingCrmAction(
  action?: PendingCrmAction | null
): PendingCrmAction | undefined {
  if (!action) {
    return undefined;
  }

  const parsed = pendingCrmActionSchema.safeParse(action);
  return parsed.success ? parsed.data : undefined;
}

function buildPendingChatForm(
  session?: PendingChatFormSession | null
): PendingChatFormSession | undefined {
  if (!session) {
    return undefined;
  }

  const parsed = pendingChatFormSessionSchema.safeParse(session);
  return parsed.success ? parsed.data : undefined;
}

function buildPendingToolAction(action?: PendingSalesforceToolAction | null): PendingSalesforceToolAction | undefined {
  if (!action) {
    return undefined;
  }

  const parsed = pendingSalesforceToolActionSchema.safeParse(action);
  return parsed.success ? parsed.data : undefined;
}

function buildRecentCrmToolContext(
  value?: RecentCrmToolContext | null
): RecentCrmToolContext | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = recentCrmToolContextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function buildRecentSalesforceToolContext(
  value?: RecentSalesforceToolContext | null
): RecentSalesforceToolContext | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = recentSalesforceToolContextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function createRecentCrmToolContext(
  provider: string,
  context: string
): RecentCrmToolContext {
  return {
    provider,
    context: context.trim().slice(0, RECENT_CRM_TOOL_CONTEXT_MAX_CHARS),
    recordedAt: new Date().toISOString(),
  };
}

export function createRecentSalesforceToolContext(context: string): RecentSalesforceToolContext {
  return {
    context: context.trim().slice(0, RECENT_CRM_TOOL_CONTEXT_MAX_CHARS),
    recordedAt: new Date().toISOString(),
  };
}

export function readConversationMetadata(value: Json | null | undefined): ConversationMetadata {
  const parsed = conversationMetadataSchema.safeParse(toRecord(value));

  if (!parsed.success) {
    return {};
  }

  return parsed.data;
}

export function readPendingCrmAction<TActionInput = Record<string, unknown>>(
  value: Json | null | undefined,
  provider: string
): PendingCrmAction<TActionInput> | null {
  const metadata = readConversationMetadata(value);

  if (metadata.pending_crm_action?.provider === provider) {
    return metadata.pending_crm_action as PendingCrmAction<TActionInput>;
  }

  if (provider === "salesforce" && metadata.pending_tool_action) {
    return {
      provider: "salesforce",
      tool: metadata.pending_tool_action.tool,
      integrationId: metadata.pending_tool_action.integrationId,
      actionInput: metadata.pending_tool_action.actionInput as TActionInput,
      summary: metadata.pending_tool_action.summary,
      initiatedBy: metadata.pending_tool_action.initiatedBy,
      createdAt: metadata.pending_tool_action.createdAt,
      expiresAt: metadata.pending_tool_action.expiresAt,
    };
  }

  return null;
}

export function readPendingChatForm(
  value: Json | null | undefined
): PendingChatFormSession | null {
  const metadata = readConversationMetadata(value);
  return metadata.pending_chat_form ?? null;
}

export function readPendingToolAction(value: Json | null | undefined): PendingSalesforceToolAction | null {
  const metadata = readConversationMetadata(value);

  if (metadata.pending_tool_action) {
    return metadata.pending_tool_action;
  }

  const pendingCrmAction = readPendingCrmAction(value, "salesforce");
  const parsed = pendingSalesforceToolActionSchema.safeParse({
    tool: pendingCrmAction?.tool,
    integrationId: pendingCrmAction?.integrationId,
    actionInput: pendingCrmAction?.actionInput,
    summary: pendingCrmAction?.summary,
    initiatedBy: pendingCrmAction?.initiatedBy,
    createdAt: pendingCrmAction?.createdAt,
    expiresAt: pendingCrmAction?.expiresAt,
  });

  return parsed.success ? parsed.data : null;
}

export function readRecentCrmToolContext(
  value: Json | null | undefined,
  provider: string
): RecentCrmToolContext | null {
  const metadata = readConversationMetadata(value);

  if (metadata.recent_crm_tool_context?.provider === provider) {
    return metadata.recent_crm_tool_context;
  }

  if (provider === "salesforce" && metadata.recent_salesforce_tool_context) {
    return {
      provider: "salesforce",
      context: metadata.recent_salesforce_tool_context.context,
      recordedAt: metadata.recent_salesforce_tool_context.recordedAt,
    };
  }

  return null;
}

export function readRecentSalesforceToolContext(
  value: Json | null | undefined
): RecentSalesforceToolContext | null {
  const metadata = readConversationMetadata(value);

  if (metadata.recent_salesforce_tool_context) {
    return metadata.recent_salesforce_tool_context;
  }

  const recentCrmToolContext = readRecentCrmToolContext(value, "salesforce");
  return recentCrmToolContext
    ? {
        context: recentCrmToolContext.context,
        recordedAt: recentCrmToolContext.recordedAt,
      }
    : null;
}

export function isPendingToolActionExpired(
  action: Pick<PendingCrmAction, "expiresAt">,
  now = Date.now()
): boolean {
  return new Date(action.expiresAt).getTime() <= now;
}

export function isRecentSalesforceToolContextExpired(
  value: Pick<RecentCrmToolContext, "recordedAt">,
  now = Date.now()
): boolean {
  return isRecentCrmToolContextExpired(value, "salesforce", now);
}

export function getRecentCrmToolContextTtlMs(provider: string): number {
  return RECENT_CRM_TOOL_CONTEXT_TTL_BY_PROVIDER[provider] ??
    RECENT_CRM_TOOL_CONTEXT_DEFAULT_TTL_MS;
}

export function isRecentCrmToolContextExpired(
  value: Pick<RecentCrmToolContext, "recordedAt">,
  provider: string,
  now = Date.now()
): boolean {
  return new Date(value.recordedAt).getTime() + getRecentCrmToolContextTtlMs(provider) <= now;
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
  const nextPendingChatForm =
    patch.pending_chat_form === null
      ? undefined
      : buildPendingChatForm(
          patch.pending_chat_form === undefined
            ? current.pending_chat_form
            : patch.pending_chat_form
        );
  const nextPendingCrmAction =
    patch.pending_crm_action === null
      ? undefined
      : buildPendingCrmAction(
          patch.pending_crm_action === undefined
            ? current.pending_crm_action
            : patch.pending_crm_action
        );
  const nextRecentCrmToolContext =
    patch.recent_crm_tool_context === null
      ? undefined
      : buildRecentCrmToolContext(
          patch.recent_crm_tool_context === undefined
            ? current.recent_crm_tool_context
            : patch.recent_crm_tool_context
        );
  const nextPendingToolAction =
    patch.pending_tool_action === null
      ? undefined
      : buildPendingToolAction(
          patch.pending_tool_action === undefined
            ? current.pending_tool_action
            : patch.pending_tool_action
        );
  const nextRecentSalesforceToolContext =
    patch.recent_salesforce_tool_context === null
      ? undefined
      : buildRecentSalesforceToolContext(
          patch.recent_salesforce_tool_context === undefined
            ? current.recent_salesforce_tool_context
            : patch.recent_salesforce_tool_context
        );
  const nextIntentMetadata = buildConversationIntentMetadata({
    active_intent:
      patch.active_intent === null
        ? undefined
        : patch.active_intent === undefined
          ? current.active_intent
          : patch.active_intent,
    intent_confidence:
      patch.intent_confidence === null
        ? undefined
        : patch.intent_confidence === undefined
          ? current.intent_confidence
          : patch.intent_confidence,
    intent_source:
      patch.intent_source === null
        ? undefined
        : patch.intent_source === undefined
          ? current.intent_source
          : patch.intent_source,
    intent_updated_at:
      patch.intent_updated_at === null
        ? undefined
        : patch.intent_updated_at === undefined
          ? current.intent_updated_at
          : patch.intent_updated_at,
    needs_clarification: patch.needs_clarification ?? current.needs_clarification,
    last_auto_reply_at:
      patch.last_auto_reply_at === null
        ? undefined
        : patch.last_auto_reply_at === undefined
          ? current.last_auto_reply_at
          : patch.last_auto_reply_at,
  });
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

  if (nextPendingChatForm) {
    next.pending_chat_form = nextPendingChatForm;
  }

  if (nextPendingCrmAction) {
    next.pending_crm_action = nextPendingCrmAction;
  }

  if (nextRecentCrmToolContext) {
    next.recent_crm_tool_context = nextRecentCrmToolContext;
  }

  if (nextPendingToolAction) {
    next.pending_tool_action = nextPendingToolAction;
  }

  if (nextRecentSalesforceToolContext) {
    next.recent_salesforce_tool_context = nextRecentSalesforceToolContext;
  }

  if (nextIntentMetadata) {
    next.active_intent = nextIntentMetadata.active_intent;
    next.intent_confidence = nextIntentMetadata.intent_confidence;
    next.intent_source = nextIntentMetadata.intent_source;
    next.intent_updated_at = nextIntentMetadata.intent_updated_at;
    next.needs_clarification = nextIntentMetadata.needs_clarification;
    next.last_auto_reply_at = nextIntentMetadata.last_auto_reply_at;
  }

  return next as Json;
}
