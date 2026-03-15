import { z } from "zod";
import type { ChatConfirmationProvider } from "@/lib/chat/inline-forms";

export const chatFormSearchRequestSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  formId: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().min(1).max(80),
  query: z.string().trim().min(2, "La busqueda debe tener al menos 2 caracteres").max(120),
  limit: z.number().int().min(1).max(10).default(10),
});

export type ChatFormSearchRequest = z.infer<typeof chatFormSearchRequestSchema>;

export type ActiveChatUiState =
  | { kind: "none" }
  | {
      kind: "confirmation";
      provider: ChatConfirmationProvider;
      summary: string;
      expiresAt: string;
      sourceMessageId: string | null;
      formId: string | null;
    };
