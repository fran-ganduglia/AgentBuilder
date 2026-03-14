import { z } from "zod";
import {
  CHAT_FORM_IDS,
  type ChatConfirmationProvider,
  type ChatFormId,
  type ChatFormValues,
} from "@/lib/chat/inline-forms";

const chatFormIdSchema = z.enum(CHAT_FORM_IDS);

const chatFormValueSchema = z.string().max(5000);
const chatFormValuesSchema = z.record(z.string().min(1).max(80), chatFormValueSchema);
const relationIdSchema = z.string().trim().min(1).max(120);
const relationSelectionSchema = z
  .array(relationIdSchema)
  .max(20)
  .transform((values) => [...new Set(values)]);

export const pendingChatFormSessionSchema = z.object({
  formId: chatFormIdSchema,
  provider: z.enum(["hubspot", "salesforce"]),
  sourceMessageId: z.string().uuid("sourceMessageId invalido"),
  sourceContentHash: z.string().length(64, "sourceContentHash invalido"),
  draftValues: chatFormValuesSchema.default({}),
  relationSelections: z
    .record(z.string().min(1).max(80), relationSelectionSchema)
    .default({}),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const chatFormDraftRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: chatFormIdSchema,
  draftValues: chatFormValuesSchema.default({}),
  relationSelections: z
    .record(z.string().min(1).max(80), relationSelectionSchema)
    .default({}),
});

export const chatFormDismissRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
});

export const chatFormSubmitRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: chatFormIdSchema,
  submissionKey: z.string().uuid("submissionKey invalido"),
  draftValues: chatFormValuesSchema.default({}),
  relationSelections: z
    .record(z.string().min(1).max(80), relationSelectionSchema)
    .default({}),
});

export const chatFormSearchRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: chatFormIdSchema,
  fieldKey: z.string().trim().min(1).max(80),
  query: z.string().trim().min(2, "La busqueda debe tener al menos 2 caracteres").max(120),
  limit: z.number().int().min(1).max(10).default(10),
});

export const chatFormActiveQuerySchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
});

export const chatFormOptionsQuerySchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: chatFormIdSchema,
  pipelineId: z.string().trim().min(1).max(120).optional(),
});

export type ChatFormRelationSelections = z.infer<
  typeof pendingChatFormSessionSchema
>["relationSelections"];
export type PendingChatFormSession = z.infer<
  typeof pendingChatFormSessionSchema
>;
export type ChatFormDraftRequest = z.infer<typeof chatFormDraftRequestSchema>;
export type ChatFormDismissRequest = z.infer<typeof chatFormDismissRequestSchema>;
export type ChatFormSubmitRequest = z.infer<typeof chatFormSubmitRequestSchema>;
export type ChatFormSearchRequest = z.infer<typeof chatFormSearchRequestSchema>;
export type ChatFormActiveQuery = z.infer<typeof chatFormActiveQuerySchema>;
export type ChatFormOptionsQuery = z.infer<typeof chatFormOptionsQuerySchema>;

export type ActiveChatUiState =
  | { kind: "none" }
  | {
      kind: "form";
      session: PendingChatFormSession;
    }
  | {
      kind: "confirmation";
      provider: ChatConfirmationProvider;
      summary: string;
      expiresAt: string;
      sourceMessageId: string | null;
      formId: ChatFormId | null;
    };

export type ChatFormValidationErrors = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

export function createPendingChatFormSession(input: {
  formId: ChatFormId;
  provider: ChatConfirmationProvider;
  sourceMessageId: string;
  sourceContentHash: string;
  draftValues?: ChatFormValues;
  relationSelections?: ChatFormRelationSelections;
  ttlMs: number;
}): PendingChatFormSession {
  const now = new Date();

  return {
    formId: input.formId,
    provider: input.provider,
    sourceMessageId: input.sourceMessageId,
    sourceContentHash: input.sourceContentHash,
    draftValues: input.draftValues ?? {},
    relationSelections: input.relationSelections ?? {},
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
  };
}

export function touchPendingChatFormSession(
  session: PendingChatFormSession,
  input: {
    draftValues: ChatFormValues;
    relationSelections: ChatFormRelationSelections;
  }
): PendingChatFormSession {
  return {
    ...session,
    draftValues: input.draftValues,
    relationSelections: input.relationSelections,
    updatedAt: new Date().toISOString(),
  };
}

export function isPendingChatFormExpired(
  session: Pick<PendingChatFormSession, "expiresAt">,
  now = Date.now()
): boolean {
  return new Date(session.expiresAt).getTime() <= now;
}
