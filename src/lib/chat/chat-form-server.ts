import "server-only";

import { assertAgentAccess } from "@/lib/auth/agent-access";
import type { Session } from "@/lib/auth/get-session";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";
import {
  isPendingToolActionExpired,
  readConversationMetadata,
  type ConversationMetadata,
} from "@/lib/chat/conversation-metadata";
import { getConversationById, updateConversationMetadata } from "@/lib/db/conversations";
import type { ChatConfirmationProvider } from "@/lib/chat/inline-forms";
import type { Agent, Conversation, Role } from "@/types/app";

type AuthorizedSession = NonNullable<Session>;

type ChatFormContext =
  | {
      ok: true;
      agent: Agent;
      conversation: Conversation;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function canUseDraftChat(role: Role): boolean {
  return role === "admin" || role === "editor";
}

function getAllowedStatuses(role: Role): Array<"draft" | "active"> {
  return canUseDraftChat(role) ? ["draft", "active"] : ["active"];
}

export async function resolveChatFormContext(input: {
  session: AuthorizedSession;
  agentId: string;
  conversationId: string;
}): Promise<ChatFormContext> {
  const access = await assertAgentAccess({
    session: input.session,
    agentId: input.agentId,
    capability: "use",
    allowedStatuses: getAllowedStatuses(input.session.role),
  });

  if (!access.ok) {
    return { ok: false, status: access.status, error: access.message };
  }

  if (access.connectionSummary.classification === "remote_managed") {
    return {
      ok: false,
      status: 403,
      error: "Este agente no usa el chat local.",
    };
  }

  const conversationResult = await getConversationById(
    input.conversationId,
    input.agentId,
    input.session.organizationId,
    input.session.user.id
  );

  if (conversationResult.error) {
    return {
      ok: false,
      status: 500,
      error: "No se pudo cargar la conversacion.",
    };
  }

  if (!conversationResult.data) {
    return { ok: false, status: 404, error: "Conversacion no encontrada." };
  }

  return { ok: true, agent: access.agent, conversation: conversationResult.data };
}

export function buildActiveChatUiState(
  conversation: Conversation
): ActiveChatUiState {
  const metadata = readConversationMetadata(conversation.metadata);

  const pendingAction = metadata.pending_crm_action;
  if (
    conversation.channel === "web" &&
    pendingAction &&
    !isPendingToolActionExpired(pendingAction)
  ) {
    return {
      kind: "confirmation",
      provider: pendingAction.provider as ChatConfirmationProvider,
      summary: pendingAction.summary,
      expiresAt: pendingAction.expiresAt,
      sourceMessageId: pendingAction.sourceMessageId ?? null,
      formId: null,
    };
  }

  return { kind: "none" };
}

export async function cleanupExpiredChatUiState(input: {
  conversation: Conversation;
  agentId: string;
  organizationId: string;
}): Promise<ActiveChatUiState> {
  const metadata = readConversationMetadata(input.conversation.metadata);
  const patch: ConversationMetadata = {};
  let shouldUpdate = false;

  if (metadata.pending_chat_form) {
    patch.pending_chat_form = null;
    shouldUpdate = true;
  }

  if (metadata.pending_crm_action && isPendingToolActionExpired(metadata.pending_crm_action)) {
    patch.pending_crm_action = null;
    patch.pending_tool_action = null;
    shouldUpdate = true;
  }

  if (!shouldUpdate) {
    return buildActiveChatUiState(input.conversation);
  }

  const updated = await updateConversationMetadata(
    input.conversation.id,
    input.agentId,
    input.organizationId,
    patch,
    { useServiceRole: true }
  );

  return updated.data ? buildActiveChatUiState(updated.data) : { kind: "none" };
}
