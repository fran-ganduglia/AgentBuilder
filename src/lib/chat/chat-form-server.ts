import "server-only";

import { assertAgentAccess } from "@/lib/auth/agent-access";
import type { Session } from "@/lib/auth/get-session";
import {
  createPendingChatFormSession,
  isPendingChatFormExpired,
  touchPendingChatFormSession,
  type ActiveChatUiState,
  type ChatFormDraftRequest,
  type PendingChatFormSession,
} from "@/lib/chat/chat-form-state";
import { createChatFormSourceContentHash } from "@/lib/chat/chat-form-hash";
import {
  isPendingToolActionExpired,
  readConversationMetadata,
  type ConversationMetadata,
} from "@/lib/chat/conversation-metadata";
import { getConversationById, getConversationByIdWithServiceRole, updateConversationMetadata } from "@/lib/db/conversations";
import { assertHubSpotActionEnabled, assertHubSpotRuntimeUsable, getHubSpotAgentToolRuntime } from "@/lib/integrations/hubspot-agent-runtime";
import { assertSalesforceActionEnabled, assertSalesforceRuntimeUsable, getSalesforceAgentToolRuntime } from "@/lib/integrations/salesforce-agent-runtime";
import {
  getChatFormDefinition,
  parseChatFormMarker,
  type ChatConfirmationProvider,
  type ChatFormAction,
} from "@/lib/chat/inline-forms";
import type { HubSpotCrmAction } from "@/lib/integrations/hubspot-tools";
import type { SalesforceCrmAction } from "@/lib/integrations/salesforce-tools";
import type { Agent, Conversation, Role } from "@/types/app";

const CHAT_FORM_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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

type AuthorizedSession = NonNullable<Session>;

function canUseDraftChat(role: Role): boolean {
  return role === "admin" || role === "editor";
}

function getAllowedStatuses(role: Role): Array<"draft" | "active"> {
  return canUseDraftChat(role) ? ["draft", "active"] : ["active"];
}

async function isChatFormActionAvailable(input: {
  agentId: string;
  organizationId: string;
  provider: ChatConfirmationProvider;
  action: ChatFormAction;
}): Promise<boolean> {
  if (input.provider === "hubspot") {
    const runtimeResult = await getHubSpotAgentToolRuntime(
      input.agentId,
      input.organizationId
    );

    if (runtimeResult.error || !runtimeResult.data) {
      return false;
    }

    const usableRuntime = assertHubSpotRuntimeUsable(runtimeResult.data);
    if (usableRuntime.error || !usableRuntime.data) {
      return false;
    }

    return Boolean(
      assertHubSpotActionEnabled(
        usableRuntime.data,
        input.action as HubSpotCrmAction
      ).data
    );
  }

  const runtimeResult = await getSalesforceAgentToolRuntime(
    input.agentId,
    input.organizationId
  );

  if (runtimeResult.error || !runtimeResult.data) {
    return false;
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return false;
  }

  return Boolean(
    assertSalesforceActionEnabled(
      usableRuntime.data,
      input.action as SalesforceCrmAction
    ).data
  );
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

export async function maybeActivateChatForm(input: {
  agentId: string;
  conversationId: string;
  organizationId: string;
  assistantMessageId: string;
  assistantContent: string;
}): Promise<PendingChatFormSession | null> {
  const conversationResult = await getConversationByIdWithServiceRole(
    input.conversationId,
    input.agentId,
    input.organizationId
  );

  if (conversationResult.error || !conversationResult.data) {
    return null;
  }

  const conversation = conversationResult.data;
  const metadata = readConversationMetadata(conversation.metadata);
  const parsedMarker = getChatFormDefinitionFromMessage(input.assistantContent);

  if (!parsedMarker || conversation.channel !== "web") {
    await clearPendingChatFormIfNeeded(conversation, input.agentId, input.organizationId, metadata);
    return null;
  }

  const isAvailable = await isChatFormActionAvailable({
    agentId: input.agentId,
    organizationId: input.organizationId,
    provider: parsedMarker.provider,
    action: parsedMarker.action,
  });

  if (!isAvailable) {
    await clearPendingChatFormIfNeeded(conversation, input.agentId, input.organizationId, metadata);
    return null;
  }

  const pendingChatForm = createPendingChatFormSession({
    formId: parsedMarker.id,
    provider: parsedMarker.provider,
    sourceMessageId: input.assistantMessageId,
    sourceContentHash: createChatFormSourceContentHash(input.assistantContent),
    ttlMs: CHAT_FORM_SESSION_TTL_MS,
    draftValues:
      metadata.pending_chat_form?.formId === parsedMarker.id
        ? metadata.pending_chat_form.draftValues
        : undefined,
    relationSelections:
      metadata.pending_chat_form?.formId === parsedMarker.id
        ? metadata.pending_chat_form.relationSelections
        : undefined,
  });

  await updateConversationMetadata(
    input.conversationId,
    input.agentId,
    input.organizationId,
    { pending_chat_form: pendingChatForm },
    { useServiceRole: true }
  );

  return pendingChatForm;
}

function getChatFormDefinitionFromMessage(content: string) {
  const parsed = parseChatFormMarker(content);
  if (!parsed) {
    return null;
  }

  return getChatFormDefinition(parsed.formId);
}

async function clearPendingChatFormIfNeeded(
  conversation: Conversation,
  agentId: string,
  organizationId: string,
  metadata: ConversationMetadata
): Promise<void> {
  if (!metadata.pending_chat_form) {
    return;
  }

  await updateConversationMetadata(
    conversation.id,
    agentId,
    organizationId,
    { pending_chat_form: null },
    { useServiceRole: true }
  );
}

export function buildActiveChatUiState(
  conversation: Conversation
): ActiveChatUiState {
  const metadata = readConversationMetadata(conversation.metadata);
  const pendingChatForm = metadata.pending_chat_form;

  if (
    conversation.channel === "web" &&
    pendingChatForm &&
    !isPendingChatFormExpired(pendingChatForm)
  ) {
    return { kind: "form", session: pendingChatForm };
  }

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
      formId: pendingAction.formId ?? null,
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

  if (metadata.pending_chat_form && isPendingChatFormExpired(metadata.pending_chat_form)) {
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

export async function savePendingChatFormDraft(input: {
  conversation: Conversation;
  agentId: string;
  organizationId: string;
  draft: ChatFormDraftRequest;
}): Promise<ActiveChatUiState> {
  const metadata = readConversationMetadata(input.conversation.metadata);
  const pendingChatForm = metadata.pending_chat_form;

  if (!pendingChatForm || pendingChatForm.formId !== input.draft.formId) {
    return { kind: "none" };
  }

  const updated = await updateConversationMetadata(
    input.conversation.id,
    input.agentId,
    input.organizationId,
    {
      pending_chat_form: touchPendingChatFormSession(pendingChatForm, {
        draftValues: input.draft.draftValues,
        relationSelections: input.draft.relationSelections,
      }),
    },
    { useServiceRole: true }
  );

  return updated.data ? buildActiveChatUiState(updated.data) : { kind: "none" };
}

export async function dismissPendingChatForm(input: {
  conversation: Conversation;
  agentId: string;
  organizationId: string;
}): Promise<ActiveChatUiState> {
  const updated = await updateConversationMetadata(
    input.conversation.id,
    input.agentId,
    input.organizationId,
    { pending_chat_form: null, pending_crm_action: null, pending_tool_action: null },
    { useServiceRole: true }
  );

  return updated.data ? buildActiveChatUiState(updated.data) : { kind: "none" };
}
