import { z } from "zod";
import type { ChatConfirmationProvider } from "@/lib/chat/inline-forms";

const dynamicFormFieldTypeSchema = z.enum([
  "text",
  "email",
  "tel",
  "date",
  "datetime-local",
  "textarea",
  "select",
  "url",
  "file",
  "number",
]);

const dynamicFormFieldOptionSchema = z.object({
  value: z.string().max(200),
  label: z.string().max(200),
});

const dynamicFormFieldDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  type: dynamicFormFieldTypeSchema,
  label: z.string().trim().min(1).max(200),
  required: z.boolean(),
  options: z.array(dynamicFormFieldOptionSchema).max(50).optional(),
  helperText: z.string().trim().min(1).max(500).optional(),
  placeholder: z.string().trim().min(1).max(200).optional(),
  accept: z.string().max(500).optional(),
  maxFileSize: z.number().int().positive().max(50 * 1024 * 1024).optional(),
  maxFiles: z.number().int().min(1).max(10).optional(),
});

const dynamicFormDefinitionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fields: z.array(dynamicFormFieldDefinitionSchema).min(1).max(40),
});

const dynamicFormFieldUiSchema = z.object({
  hidden: z.boolean().optional(),
  readOnly: z.boolean().optional(),
});

export const pendingChatFormStateSchema = z.object({
  kind: z.literal("dynamic_form"),
  formId: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(40),
  surface: z.string().trim().min(1).max(40),
  action: z.string().trim().min(1).max(80),
  toolName: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(4000),
  definition: dynamicFormDefinitionSchema,
  initialValues: z.record(z.string(), z.string()).default({}),
  fieldUi: z.record(z.string(), dynamicFormFieldUiSchema).default({}),
  clarificationId: z.string().trim().min(1).max(120).optional(),
  source: z.enum(["planner", "runtime"]).optional(),
  resumeMode: z.enum(["resume_checkpoint", "start_from_draft"]).optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime().optional(),
});

export const chatFormSearchRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().min(1).max(80),
  query: z.string().trim().min(2, "La busqueda debe tener al menos 2 caracteres").max(120),
  limit: z.number().int().min(1).max(10).default(10),
});

export type ChatFormSearchRequest = z.infer<typeof chatFormSearchRequestSchema>;
export type PendingChatFormState = z.infer<typeof pendingChatFormStateSchema>;

export type ActiveChatUiState =
  | { kind: "none" }
  | {
      kind: "confirmation";
      provider: ChatConfirmationProvider;
      summary: string;
      expiresAt: string;
      sourceMessageId: string | null;
      formId: string | null;
    }
  | PendingChatFormState;

export function parsePendingChatFormState(
  value: Record<string, unknown> | null | undefined
): PendingChatFormState | null {
  const parsed = pendingChatFormStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
