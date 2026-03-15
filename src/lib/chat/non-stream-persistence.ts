import "server-only";

import type { ConversationMetadata } from "@/lib/chat/conversation-metadata";
import { updateConversationMetadata } from "@/lib/db/conversations";
import { insertMessageWithServiceRole } from "@/lib/db/messages";
import { insertPlanLimitNotification } from "@/lib/db/notifications-writer";
import { recordUsage } from "@/lib/db/usage-writer";

export type PersistedAssistantReplyInput = {
  agentId: string;
  conversationId: string;
  organizationId: string;
  content: string;
  llmModel?: string | null;
  llmProvider?: string | null;
  responseTimeMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  conversationMetadataPatch?: ConversationMetadata;
};

export async function persistAssistantReply(
  input: PersistedAssistantReplyInput
): Promise<void> {
  const assistantInsertResult = await insertMessageWithServiceRole({
    agentId: input.agentId,
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    role: "assistant",
    content: input.content,
    llmModel: input.llmModel ?? null,
    responseTimeMs: input.responseTimeMs ?? null,
    tokensInput: input.tokensInput ?? null,
    tokensOutput: input.tokensOutput ?? null,
  });

  if (assistantInsertResult.error) {
    console.error("chat.assistant_message_error", {
      conversationId: input.conversationId,
      error: assistantInsertResult.error,
    });
  }

  if (input.conversationMetadataPatch) {
    const updateResult = await updateConversationMetadata(
      input.conversationId,
      input.agentId,
      input.organizationId,
      input.conversationMetadataPatch,
      { useServiceRole: true }
    );

    if (updateResult.error) {
      console.error("chat.assistant_metadata_error", {
        conversationId: input.conversationId,
        error: updateResult.error,
      });
    }
  }

  if (!input.llmProvider) {
    return;
  }

  const usageResult = await recordUsage({
    organizationId: input.organizationId,
    agentId: input.agentId,
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    llmProvider: input.llmProvider,
  });

  if (usageResult && usageResult.planLimit && usageResult.planLimit > 0) {
    await insertPlanLimitNotification({
      organizationId: input.organizationId,
      currentUsage: usageResult.currentUsage,
      planLimit: usageResult.planLimit,
    });
  }
}
