import "server-only";

import { ZodError } from "zod";
import { createPendingCrmAction } from "@/lib/chat/crm-pending-action";
import {
  buildActiveChatUiState,
  cleanupExpiredChatUiState,
} from "@/lib/chat/chat-form-server";
import {
  isPendingChatFormExpired,
  type ActiveChatUiState,
  type ChatFormRelationSelections,
  type ChatFormSubmitRequest,
  type ChatFormValidationErrors,
} from "@/lib/chat/chat-form-state";
import {
  readConversationMetadata,
  type PendingCrmAction,
  type PendingSalesforceToolAction,
} from "@/lib/chat/conversation-metadata";
import { updateConversationMetadata } from "@/lib/db/conversations";
import { insertMessageWithServiceRole } from "@/lib/db/messages";
import {
  assertHubSpotActionEnabled,
  assertHubSpotRuntimeUsable,
  buildHubSpotConfirmationSummary,
  getHubSpotAgentToolRuntime,
} from "@/lib/integrations/hubspot-agent-runtime";
import {
  executeHubSpotCrmToolSchema,
} from "@/lib/integrations/hubspot-tools";
import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  buildSalesforceConfirmationSummary,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import {
  executeSalesforceCrmToolSchema,
  type ExecuteSalesforceCrmToolInput,
} from "@/lib/integrations/salesforce-tools";
import {
  buildChatFormActionInput,
  getChatFormDefinition,
  type ChatFormId,
  type ChatFormValues,
} from "@/lib/chat/inline-forms";
import type { HubSpotCrmAction } from "@/lib/integrations/hubspot-tools";
import type { SalesforceCrmAction } from "@/lib/integrations/salesforce-tools";
import type { Conversation } from "@/types/app";

type SubmitResult =
  | { ok: true; state: ActiveChatUiState }
  | { ok: false; status: number; error: string; validation?: ChatFormValidationErrors };

function toLegacyPendingToolAction(
  pendingAction: PendingCrmAction<ExecuteSalesforceCrmToolInput>
): PendingSalesforceToolAction {
  return {
    tool: "salesforce_crm",
    integrationId: pendingAction.integrationId,
    actionInput: pendingAction.actionInput,
    summary: pendingAction.summary,
    initiatedBy: pendingAction.initiatedBy,
    createdAt: pendingAction.createdAt,
    expiresAt: pendingAction.expiresAt,
  };
}

function applyRelationSelections<T extends Record<string, unknown>>(
  actionInput: T,
  relationSelections: ChatFormRelationSelections
): T {
  const next = { ...actionInput } as Record<string, unknown>;

  for (const [fieldKey, values] of Object.entries(relationSelections)) {
    if (values.length === 0) {
      continue;
    }

    next[fieldKey] = values.length === 1 ? values[0] : values;
  }

  return next as T;
}

function buildValidationErrors(error: ZodError): ChatFormValidationErrors {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path[0] === "properties" ? issue.path[1] : issue.path[0];
    if (typeof path === "string" && !fieldErrors[path]) {
      fieldErrors[path] = issue.message;
    }
  }

  return {
    fieldErrors,
    formError: error.issues[0]?.message ?? "No se pudo validar el formulario.",
  };
}

function buildTraceMessage(
  formId: ChatFormId,
  draftValues: ChatFormValues,
  relationSelections: ChatFormRelationSelections
): string {
  const definition = getChatFormDefinition(formId);
  if (!definition) {
    return "Formulario enviado";
  }

  const lines = [`Formulario enviado: ${formId}`];

  for (const field of definition.fields) {
    const value = draftValues[field.key]?.trim();
    if (value) {
      lines.push(`- ${field.key}: ${value.replace(/\r?\n/g, "\\n")}`);
    }
  }

  for (const [fieldKey, values] of Object.entries(relationSelections)) {
    if (values.length > 0) {
      lines.push(`- ${fieldKey}: ${values.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export async function submitChatFormBridge(input: {
  agentId: string;
  organizationId: string;
  userId: string;
  conversation: Conversation;
  request: ChatFormSubmitRequest;
}): Promise<SubmitResult> {
  const currentState = await cleanupExpiredChatUiState({
    conversation: input.conversation,
    agentId: input.agentId,
    organizationId: input.organizationId,
  });

  if (currentState.kind === "confirmation") {
    return { ok: true, state: currentState };
  }

  const metadata = readConversationMetadata(input.conversation.metadata);
  const pendingChatForm = metadata.pending_chat_form;

  if (!pendingChatForm || pendingChatForm.formId !== input.request.formId) {
    return { ok: false, status: 409, error: "El formulario activo ya no coincide con este borrador." };
  }

  if (isPendingChatFormExpired(pendingChatForm)) {
    return { ok: false, status: 409, error: "El formulario vencio. Pide al agente que lo genere de nuevo." };
  }

  const definition = getChatFormDefinition(input.request.formId);
  if (!definition) {
    return { ok: false, status: 400, error: "Formulario no soportado." };
  }

  if (definition.provider === "hubspot") {
    const runtimeResult = await getHubSpotAgentToolRuntime(
      input.agentId,
      input.organizationId
    );

    if (runtimeResult.error || !runtimeResult.data) {
      return { ok: false, status: 409, error: runtimeResult.error ?? "HubSpot no esta disponible." };
    }

    const usableRuntime = assertHubSpotRuntimeUsable(runtimeResult.data);
    if (usableRuntime.error || !usableRuntime.data) {
      return { ok: false, status: 409, error: usableRuntime.error ?? "HubSpot no esta disponible." };
    }

    const enabledRuntime = assertHubSpotActionEnabled(
      usableRuntime.data,
      definition.action as HubSpotCrmAction
    );
    if (enabledRuntime.error || !enabledRuntime.data) {
      return { ok: false, status: 409, error: enabledRuntime.error ?? "La accion ya no esta habilitada." };
    }

    const parsedInput = executeHubSpotCrmToolSchema.safeParse(
      applyRelationSelections(
        buildChatFormActionInput(input.request.formId, input.request.draftValues),
        input.request.relationSelections
      )
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        status: 400,
        error: parsedInput.error.issues[0]?.message ?? "Formulario invalido.",
        validation: buildValidationErrors(parsedInput.error),
      };
    }

    const pendingAction = createPendingCrmAction({
      provider: "hubspot",
      toolName: "hubspot_crm",
      integrationId: enabledRuntime.data.integration.id,
      initiatedBy: input.userId,
      summary: buildHubSpotConfirmationSummary(parsedInput.data),
      actionInput: parsedInput.data,
      sourceMessageId: pendingChatForm.sourceMessageId,
      sourceContentHash: pendingChatForm.sourceContentHash,
      formId: pendingChatForm.formId,
    });

    const updated = await updateConversationMetadata(
      input.conversation.id,
      input.agentId,
      input.organizationId,
      {
        pending_chat_form: null,
        pending_crm_action: pendingAction,
        pending_tool_action: null,
      },
      { useServiceRole: true }
    );

    if (updated.error || !updated.data) {
      return { ok: false, status: 500, error: "No se pudo preparar la confirmacion del CRM." };
    }

    await insertVisibleTraceMessage(input, pendingChatForm);
    return { ok: true, state: buildActiveChatUiState(updated.data) };
  }

  const runtimeResult = await getSalesforceAgentToolRuntime(
    input.agentId,
    input.organizationId
  );

  if (runtimeResult.error || !runtimeResult.data) {
    return { ok: false, status: 409, error: runtimeResult.error ?? "Salesforce no esta disponible." };
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return { ok: false, status: 409, error: usableRuntime.error ?? "Salesforce no esta disponible." };
  }

  const enabledRuntime = assertSalesforceActionEnabled(
    usableRuntime.data,
    definition.action as SalesforceCrmAction
  );
  if (enabledRuntime.error || !enabledRuntime.data) {
    return { ok: false, status: 409, error: enabledRuntime.error ?? "La accion ya no esta habilitada." };
  }

  const parsedInput = executeSalesforceCrmToolSchema.safeParse(
    applyRelationSelections(
      buildChatFormActionInput(input.request.formId, input.request.draftValues),
      input.request.relationSelections
    )
  );

  if (!parsedInput.success) {
    return {
      ok: false,
      status: 400,
      error: parsedInput.error.issues[0]?.message ?? "Formulario invalido.",
      validation: buildValidationErrors(parsedInput.error),
    };
  }

  const pendingAction = createPendingCrmAction({
    provider: "salesforce",
    toolName: "salesforce_crm",
    integrationId: enabledRuntime.data.integration.id,
    initiatedBy: input.userId,
    summary: buildSalesforceConfirmationSummary(parsedInput.data),
    actionInput: parsedInput.data,
    sourceMessageId: pendingChatForm.sourceMessageId,
    sourceContentHash: pendingChatForm.sourceContentHash,
    formId: pendingChatForm.formId,
  });

  const updated = await updateConversationMetadata(
    input.conversation.id,
    input.agentId,
    input.organizationId,
    {
      pending_chat_form: null,
      pending_crm_action: pendingAction,
      pending_tool_action: toLegacyPendingToolAction(pendingAction),
    },
    { useServiceRole: true }
  );

  if (updated.error || !updated.data) {
    return { ok: false, status: 500, error: "No se pudo preparar la confirmacion del CRM." };
  }

  await insertVisibleTraceMessage(input, pendingChatForm);
  return { ok: true, state: buildActiveChatUiState(updated.data) };
}

async function insertVisibleTraceMessage(
  input: {
    agentId: string;
    organizationId: string;
    conversation: Conversation;
    request: ChatFormSubmitRequest;
  },
  pendingChatForm: { formId: ChatFormId }
): Promise<void> {
  const traceMessage = buildTraceMessage(
    pendingChatForm.formId,
    input.request.draftValues,
    input.request.relationSelections
  );

  const inserted = await insertMessageWithServiceRole({
    agentId: input.agentId,
    conversationId: input.conversation.id,
    organizationId: input.organizationId,
    role: "user",
    content: traceMessage,
  });

  if (inserted.error) {
    console.error("chat_form.trace_message_error", {
      conversationId: input.conversation.id,
      error: inserted.error,
    });
  }
}
