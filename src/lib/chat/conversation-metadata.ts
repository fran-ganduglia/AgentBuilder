import { z } from "zod";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
import {
  parseRuntimeClarificationSpec,
  type RuntimeClarificationSpec,
} from "@/lib/chat/runtime-clarification";
import { WHATSAPP_INTENT_SOURCES, WHATSAPP_KNOWN_INTENTS, type WhatsAppIntentSource, type WhatsAppKnownIntent } from "@/lib/chat/whatsapp-intents";
import type { Json, Tables } from "@/types/database";

export const CHAT_MODES = ["sandbox", "live_local", "live_external", "qa_imported"] as const;
export const QA_REVIEW_STATUSES = ["approved", "fixable", "critical"] as const;

const RECENT_CRM_TOOL_CONTEXT_MAX_CHARS = 4000;
const RECENT_CRM_TOOL_CONTEXT_DEFAULT_TTL_MS = 10 * 60 * 1000;
const RECENT_CRM_TOOL_CONTEXT_TTL_BY_PROVIDER: Record<string, number> = {
  gmail: 5 * 60 * 1000,
};
const RECENT_DECLARATIVE_ENGINE_CONTEXT_DEFAULT_TTL_MS = 10 * 60 * 1000;

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
  formId: z.string().optional(),
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

const declarativeThreadCandidateSchema = z.object({
  threadId: z.string().trim().min(1).max(200),
  subject: z.string().max(500).nullable().optional(),
  from: z.string().max(500).nullable().optional(),
  date: z.string().max(200).nullable().optional(),
});

const declarativeCalendarEventSchema = z.object({
  id: z.string().max(200).nullable().optional(),
  status: z.string().max(80).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  startIso: z.string().max(120).nullable().optional(),
  endIso: z.string().max(120).nullable().optional(),
});

const declarativeCalendarSlotSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
});

const declarativeSheetSummarySchema = z.object({
  title: z.string().max(200).nullable().optional(),
});

const declarativeSheetRowSchema = z.array(z.string().max(2000)).max(20);

const declarativeActionResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gmail_search_threads"),
    threads: z.array(declarativeThreadCandidateSchema).max(5),
  }),
  z.object({
    kind: z.literal("gmail_read_thread"),
    threadId: z.string().trim().min(1).max(200),
    subject: z.string().max(500).nullable().optional(),
    latestMessageId: z.string().max(200).nullable().optional(),
  }),
  z.object({
    kind: z.literal("google_calendar_list_events"),
    events: z.array(declarativeCalendarEventSchema).max(20),
  }),
  z.object({
    kind: z.literal("google_calendar_check_availability"),
    busy: z.array(declarativeCalendarSlotSchema).max(20),
    freeSlots: z.array(declarativeCalendarSlotSchema).max(20),
  }),
  z.object({
    kind: z.literal("google_sheets_list_sheets"),
    spreadsheetId: z.string().trim().min(1).max(200),
    spreadsheetTitle: z.string().max(500).nullable().optional(),
    sheets: z.array(declarativeSheetSummarySchema).max(20),
  }),
  z.object({
    kind: z.literal("google_sheets_read_range"),
    spreadsheetId: z.string().trim().min(1).max(200),
    spreadsheetTitle: z.string().max(500).nullable().optional(),
    sheetName: z.string().max(200).nullable().optional(),
    rangeA1: z.string().max(200).nullable().optional(),
    rows: z.array(declarativeSheetRowSchema).max(10),
  }),
]);

const declarativeActionSnapshotSchema = z.object({
  provider: z.enum(["gmail", "google_calendar", "google_sheets"]),
  action: z.enum([
    "search_threads",
    "read_thread",
    "check_availability",
    "list_events",
    "list_sheets",
    "read_range",
  ]),
  result: declarativeActionResultSchema,
  summary: z.string().max(2000),
});

export const recentActionContextSchema = z.object({
  actions: z.array(declarativeActionSnapshotSchema).min(1).max(3),
  recordedAt: z.string().datetime(),
});

const pendingGmailResolutionOptionSchema = z.object({
  threadId: z.string().trim().min(1).max(200),
  subject: z.string().max(500).nullable().optional(),
  from: z.string().max(500).nullable().optional(),
  date: z.string().max(200).nullable().optional(),
});

export const pendingGmailResolutionSchema = z.object({
  provider: z.literal("gmail"),
  rawOutput: z.object({
    candidateAction: z.string().trim().min(1).max(80),
    actionInput: genericActionInputSchema,
    resolutionRequests: z.array(z.record(z.string(), z.unknown())).max(5),
    missingFields: z.array(z.string().trim().min(1).max(80)).max(10),
    confidence: z.number().min(0).max(1),
    rawPolicyFlags: z.array(z.string().trim().min(1).max(80)).max(10),
  }),
  options: z.array(pendingGmailResolutionOptionSchema).min(1).max(5),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
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
export type PendingGmailResolution = z.infer<typeof pendingGmailResolutionSchema>;
export type RecentActionContext = z.infer<typeof recentActionContextSchema>;

export type ActionExecutionStatus = {
  status: "pending" | "success" | "error";
  message?: string;
  updatedAt: string;
};

export type RuntimeCheckpointMetadata = {
  actionId: string;
  actionIndex: number;
  node: string;
  status:
    | "needs_user"
    | "failed"
    | "blocked"
    | "waiting_approval"
    | "waiting_async_execution"
    | "completed_with_degradation";
  resumeFrom: string;
  reason?: string;
  createdAt: string;
  retries: number;
  llmRepairCalls: number;
  nodeVisitCounts: Record<string, number>;
  errorFingerprint?: string;
  actionSnapshot?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
};

export type RuntimeTraceActionSummaryMetadata = {
  actionId: string;
  actionType: string;
  status:
    | "success"
    | "needs_user"
    | "failed"
    | "blocked"
    | "waiting_approval"
    | "waiting_async_execution"
    | "completed_with_degradation";
  currentNode?: string;
  reason?: string;
  approvalItemId?: string;
  workflowRunId?: string;
};

export type RuntimeTraceSummaryMetadata = {
  traceId: string;
  requestId: string;
  outcome: "success" | "needs_user" | "failed" | "blocked";
  planIntent: string;
  actionCount: number;
  eventCount: number;
  capturedAt: string;
  actions: RuntimeTraceActionSummaryMetadata[];
};

export type ConversationMetadata = {
  chat_mode?: ChatMode;
  qa_review?: ConversationQaReview | null;
  source_context?: SourceContext;
  pending_chat_form?: Record<string, unknown> | null;
  pending_runtime_clarification?: RuntimeClarificationSpec | null;
  pending_crm_action?: PendingCrmAction | null;
  recent_crm_tool_context?: RecentCrmToolContext | null;
  recent_action_context?: RecentActionContext | null;
  pending_gmail_resolution?: PendingGmailResolution | null;
  active_intent?: WhatsAppKnownIntent | null;
  intent_confidence?: number | null;
  intent_source?: WhatsAppIntentSource | null;
  intent_updated_at?: string | null;
  needs_clarification?: boolean;
  last_auto_reply_at?: string | null;
  action_execution_status?: ActionExecutionStatus | null;
  runtime_checkpoint?: RuntimeCheckpointMetadata | null;
  runtime_trace_summary?: RuntimeTraceSummaryMetadata | null;
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
  pending_chat_form: z.record(z.string(), z.unknown()).optional(),
  pending_runtime_clarification: z.record(z.string(), z.unknown()).optional(),
  pending_crm_action: pendingCrmActionSchema.optional(),
  recent_crm_tool_context: recentCrmToolContextSchema.optional(),
  recent_action_context: recentActionContextSchema.optional(),
  pending_gmail_resolution: pendingGmailResolutionSchema.optional(),
  active_intent: conversationIntentMetadataSchema.shape.active_intent,
  intent_confidence: conversationIntentMetadataSchema.shape.intent_confidence,
  intent_source: conversationIntentMetadataSchema.shape.intent_source,
  intent_updated_at: conversationIntentMetadataSchema.shape.intent_updated_at,
  needs_clarification: conversationIntentMetadataSchema.shape.needs_clarification,
  last_auto_reply_at: conversationIntentMetadataSchema.shape.last_auto_reply_at,
  action_execution_status: z.object({
    status: z.enum(["pending", "success", "error"]),
    message: z.string().max(500).optional(),
    updatedAt: z.string().datetime(),
  }).optional(),
  runtime_checkpoint: z.object({
    actionId: z.string().min(1).max(120),
    actionIndex: z.number().int().min(0).max(10),
    node: z.string().min(1).max(80),
    status: z.enum([
      "needs_user",
      "failed",
      "blocked",
      "waiting_approval",
      "waiting_async_execution",
      "completed_with_degradation",
    ]),
    resumeFrom: z.string().min(1).max(80),
    reason: z.string().max(200).optional(),
    createdAt: z.string().datetime(),
    retries: z.number().int().min(0).max(10),
    llmRepairCalls: z.number().int().min(0).max(10),
    nodeVisitCounts: z.record(z.string(), z.number().int().min(0).max(20)),
    errorFingerprint: z.string().max(200).optional(),
    actionSnapshot: z.record(z.string(), z.unknown()).optional(),
    contextSnapshot: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  runtime_trace_summary: z.object({
    traceId: z.string().min(1).max(120),
    requestId: z.string().min(1).max(120),
    outcome: z.enum(["success", "needs_user", "failed", "blocked"]),
    planIntent: z.string().min(1).max(120),
    actionCount: z.number().int().min(0).max(10),
    eventCount: z.number().int().min(0).max(500),
    capturedAt: z.string().datetime(),
    actions: z.array(z.object({
      actionId: z.string().min(1).max(120),
      actionType: z.string().min(1).max(80),
      status: z.enum([
        "success",
        "needs_user",
        "failed",
        "blocked",
        "waiting_approval",
        "waiting_async_execution",
        "completed_with_degradation",
      ]),
      currentNode: z.string().min(1).max(80).optional(),
      reason: z.string().max(200).optional(),
      approvalItemId: z.string().uuid().optional(),
      workflowRunId: z.string().uuid().optional(),
    })).max(4),
  }).optional(),
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
  session?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!session || typeof session !== "object") {
    return undefined;
  }

  return session;
}

function buildPendingRuntimeClarification(
  value?: RuntimeClarificationSpec | null
): RuntimeClarificationSpec | undefined {
  if (!value) {
    return undefined;
  }

  return parseRuntimeClarificationSpec(value as Record<string, unknown>) ?? undefined;
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

function buildRecentActionContext(
  value?: RecentActionContext | null
): RecentActionContext | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = recentActionContextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function buildRuntimeCheckpoint(
  value?: RuntimeCheckpointMetadata | null
): RuntimeCheckpointMetadata | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = conversationMetadataSchema.shape.runtime_checkpoint.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function buildRuntimeTraceSummary(
  value?: RuntimeTraceSummaryMetadata | null
): RuntimeTraceSummaryMetadata | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = conversationMetadataSchema.shape.runtime_trace_summary.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function buildPendingGmailResolution(
  value?: PendingGmailResolution | null
): PendingGmailResolution | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = pendingGmailResolutionSchema.safeParse(value);
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

export function createRecentActionContext(
  actions: RecentActionContext["actions"]
): RecentActionContext {
  return {
    actions,
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

  return {
    ...parsed.data,
    pending_runtime_clarification: buildPendingRuntimeClarification(
      parsed.data.pending_runtime_clarification as RuntimeClarificationSpec | null | undefined
    ),
  };
}

export function readPendingCrmAction<TActionInput = Record<string, unknown>>(
  value: Json | null | undefined,
  provider: string
): PendingCrmAction<TActionInput> | null {
  const metadata = readConversationMetadata(value);

  if (metadata.pending_crm_action?.provider === provider) {
    return metadata.pending_crm_action as PendingCrmAction<TActionInput>;
  }

  return null;
}

export function readPendingChatForm(
  value: Json | null | undefined
): Record<string, unknown> | null {
  const metadata = readConversationMetadata(value);
  return metadata.pending_chat_form ?? null;
}

export function readPendingRuntimeClarification(
  value: Json | null | undefined
): RuntimeClarificationSpec | null {
  const metadata = readConversationMetadata(value);
  return metadata.pending_runtime_clarification ?? null;
}

export function readPendingToolAction(value: Json | null | undefined): PendingSalesforceToolAction | null {
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

  return null;
}

export function readPendingGmailResolution(
  value: Json | null | undefined
): PendingGmailResolution | null {
  const metadata = readConversationMetadata(value);
  return metadata.pending_gmail_resolution?.provider === "gmail"
    ? metadata.pending_gmail_resolution
    : null;
}

export function readRecentActionContext(
  value: Json | null | undefined
): RecentActionContext | null {
  const metadata = readConversationMetadata(value);
  return metadata.recent_action_context ?? null;
}

export function readRecentSalesforceToolContext(
  value: Json | null | undefined
): RecentSalesforceToolContext | null {
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

export function isPendingGmailResolutionExpired(
  value: Pick<PendingGmailResolution, "expiresAt">,
  now = Date.now()
): boolean {
  return new Date(value.expiresAt).getTime() <= now;
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

export function isRecentActionContextExpired(
  value: Pick<RecentActionContext, "actions" | "recordedAt">,
  now = Date.now()
): boolean {
  const providers = new Set(value.actions.map((action) => action.provider));
  const ttlMs = [...providers].reduce((ttl, provider) => {
    return Math.min(ttl, getRecentCrmToolContextTtlMs(provider));
  }, RECENT_DECLARATIVE_ENGINE_CONTEXT_DEFAULT_TTL_MS);

  return new Date(value.recordedAt).getTime() + ttlMs <= now;
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
  const nextPendingRuntimeClarification =
    patch.pending_runtime_clarification === null
      ? undefined
      : buildPendingRuntimeClarification(
          patch.pending_runtime_clarification === undefined
            ? current.pending_runtime_clarification
            : patch.pending_runtime_clarification
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
  const nextRecentActionContext =
    patch.recent_action_context === null
      ? undefined
      : buildRecentActionContext(
          patch.recent_action_context === undefined
            ? current.recent_action_context
            : patch.recent_action_context
        );
  const nextPendingGmailResolution =
    patch.pending_gmail_resolution === null
      ? undefined
      : buildPendingGmailResolution(
          patch.pending_gmail_resolution === undefined
            ? current.pending_gmail_resolution
            : patch.pending_gmail_resolution
        );
  const nextRuntimeCheckpoint =
    patch.runtime_checkpoint === null
      ? undefined
      : buildRuntimeCheckpoint(
          patch.runtime_checkpoint === undefined
            ? current.runtime_checkpoint
            : patch.runtime_checkpoint
        );
  const nextRuntimeTraceSummary =
    patch.runtime_trace_summary === null
      ? undefined
      : buildRuntimeTraceSummary(
          patch.runtime_trace_summary === undefined
            ? current.runtime_trace_summary
            : patch.runtime_trace_summary
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

  if (nextPendingRuntimeClarification) {
    next.pending_runtime_clarification = nextPendingRuntimeClarification;
  }

  if (nextPendingCrmAction) {
    next.pending_crm_action = nextPendingCrmAction;
  }

  if (nextRecentCrmToolContext) {
    next.recent_crm_tool_context = nextRecentCrmToolContext;
  }

  if (nextRecentActionContext) {
    next.recent_action_context = nextRecentActionContext;
  }

  if (nextPendingGmailResolution) {
    next.pending_gmail_resolution = nextPendingGmailResolution;
  }

  if (nextRuntimeCheckpoint) {
    next.runtime_checkpoint = nextRuntimeCheckpoint;
  }

  if (nextRuntimeTraceSummary) {
    next.runtime_trace_summary = nextRuntimeTraceSummary;
  }

  if (nextIntentMetadata) {
    next.active_intent = nextIntentMetadata.active_intent;
    next.intent_confidence = nextIntentMetadata.intent_confidence;
    next.intent_source = nextIntentMetadata.intent_source;
    next.intent_updated_at = nextIntentMetadata.intent_updated_at;
    next.needs_clarification = nextIntentMetadata.needs_clarification;
    next.last_auto_reply_at = nextIntentMetadata.last_auto_reply_at;
  }

  const nextActionExecutionStatus =
    patch.action_execution_status === null
      ? undefined
      : patch.action_execution_status === undefined
        ? current.action_execution_status
        : patch.action_execution_status;

  if (nextActionExecutionStatus) {
    next.action_execution_status = nextActionExecutionStatus;
  }

  return next as Json;
}
