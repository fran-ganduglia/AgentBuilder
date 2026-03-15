import type { PendingCrmAction } from "@/lib/chat/conversation-metadata";

const DEFAULT_PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

export function createPendingCrmAction<TActionInput>(input: {
  provider: string;
  toolName: string;
  integrationId: string;
  initiatedBy: string;
  summary: string;
  actionInput: TActionInput;
  ttlMs?: number;
  sourceMessageId?: string | null;
  sourceContentHash?: string | null;
  formId?: string | null;
}): PendingCrmAction<TActionInput> {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + (input.ttlMs ?? DEFAULT_PENDING_ACTION_TTL_MS)
  ).toISOString();

  return {
    provider: input.provider,
    tool: input.toolName,
    integrationId: input.integrationId,
    actionInput: input.actionInput,
    summary: input.summary,
    initiatedBy: input.initiatedBy,
    createdAt,
    expiresAt,
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    ...(input.sourceContentHash
      ? { sourceContentHash: input.sourceContentHash }
      : {}),
    ...(input.formId ? { formId: input.formId } : {}),
  };
}
