import "server-only";

import type { ApprovalPolicyConfig } from "@/lib/tools/approval-policy";
import { createApprovalRequest } from "@/lib/workflows/approval-request";
import type { Json } from "@/types/database";
import {
  isGmailReadOnlyAction,
  isGoogleCalendarReadAction,
  isGoogleSheetsReadAction,
  type GmailToolAction,
  type GoogleCalendarToolAction,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import { runGoogleGmailAction, runGoogleGmailWriteAction } from "@/lib/integrations/google-gmail-agent-runtime";
import { runGoogleCalendarAction, runGoogleCalendarWriteAction } from "@/lib/integrations/google-calendar-agent-runtime";
import { runGoogleSheetsReadAction, runGoogleSheetsWriteAction } from "@/lib/integrations/google-sheets-agent-runtime";
import { executeSalesforceToolAction } from "@/lib/integrations/salesforce-agent-runtime";
import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import type { GoogleAgentRuntimeSuccess } from "@/lib/integrations/google-agent-runtime";
import type { PendingChatFormState } from "@/lib/chat/chat-form-state";
import { prepareToolCallExecution } from "@/lib/tools/tool-call-preparation";

export type ToolExecutionResult =
  | {
      kind: "executed";
      toolCallId: string;
      content: string;
      blocked?: boolean;
    }
  | {
      kind: "requires_approval";
      toolCallId: string;
      content: string;
      blocked?: boolean;
    }
  | {
      kind: "needs_form";
      toolCallId: string;
      message: string;
      assistantContent: string;
      pendingChatForm: PendingChatFormState;
    }
  | {
      kind: "error";
      toolCallId: string;
      content: string;
      blocked?: boolean;
    };

type ToolExecutionInput = {
  toolCallId: string;
  toolName: string;
  arguments: string;
  agentId: string;
  organizationId: string;
  userId: string;
  conversationId: string;
  approvalPolicy: ApprovalPolicyConfig;
  googleRuntime?: GoogleAgentRuntimeSuccess | null;
  salesforceIntegrationId?: string | null;
};

async function resolveGoogleAccessToken(
  runtime: GoogleAgentRuntimeSuccess,
  organizationId: string
): Promise<string | null> {
  const integrationId = runtime.integration.id;
  const configResult = await getGoogleIntegrationConfig(integrationId, organizationId);
  if (!configResult.data) {
    return null;
  }

  return configResult.data.accessToken;
}

function buildApprovalSummary(
  provider: string,
  surface: string,
  action: string,
  args: Record<string, unknown>
): string {
  const actionLabel = `${surface}.${action}`;
  const subject = typeof args.subject === "string" ? args.subject : null;
  const to = Array.isArray(args.to) ? (args.to as string[]).join(", ") : typeof args.to === "string" ? args.to : null;
  const title = typeof args.title === "string" ? args.title : null;

  const parts = [actionLabel];
  if (subject) parts.push(`Asunto: ${subject}`);
  if (to) parts.push(`Para: ${to}`);
  if (title) parts.push(`Titulo: ${title}`);

  return parts.join(" — ");
}

function resolveIntegrationId(
  input: ToolExecutionInput,
  provider: string
): string | null {
  if (provider === "google" && input.googleRuntime) {
    return input.googleRuntime.integration.id;
  }
  if (provider === "salesforce") {
    return input.salesforceIntegrationId ?? null;
  }
  return null;
}

export async function executeToolCall(
  input: ToolExecutionInput
): Promise<ToolExecutionResult> {
  const prepared = prepareToolCallExecution({
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    arguments: input.arguments,
    approvalPolicy: input.approvalPolicy,
  });

  if (prepared.kind === "error") {
    return prepared;
  }

  if (prepared.kind === "needs_form") {
    return prepared;
  }

  if (prepared.kind === "requires_approval") {
    const integrationId = resolveIntegrationId(input, prepared.provider);

    if (integrationId) {
      const summary = buildApprovalSummary(
        prepared.provider,
        prepared.surface,
        prepared.action,
        prepared.args
      );
      const approvalResult = await createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        userId: input.userId,
        provider: prepared.surface,
        action: prepared.action,
        integrationId,
        toolName: input.toolName,
        summary,
        payloadSummary: {
          action_input: prepared.args as Record<string, Json | undefined>,
        },
      });

      if (approvalResult.data) {
        return {
          kind: "requires_approval",
          toolCallId: input.toolCallId,
          content: JSON.stringify({
            status: "requires_approval",
            action: prepared.action,
            approval_item_id: approvalResult.data.approvalItemId,
            expires_at: approvalResult.data.expiresAt,
            message: "Esta accion requiere aprobacion humana. Se ha creado una solicitud en el inbox de aprobaciones.",
          }),
        };
      }
    }

    // Fallback if no integrationId or approval creation failed
    return {
      kind: "requires_approval",
      toolCallId: input.toolCallId,
      content: JSON.stringify({
        status: "requires_approval",
        action: prepared.action,
        message: "Esta accion requiere aprobacion humana antes de ejecutarse. El usuario debe confirmarla desde el approval inbox.",
      }),
    };
  }

  try {
    if (prepared.provider === "google") {
      return await executeGoogleTool(
        input,
        prepared.surface,
        prepared.action,
        prepared.args
      );
    }

    if (prepared.provider === "salesforce") {
      return await executeSalesforceTool(input, prepared.action, prepared.args);
    }

    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({
        error: `Provider no soportado: ${prepared.provider}`,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al ejecutar la tool.";
    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({ error: message }),
    };
  }
}

async function executeGoogleTool(
  input: ToolExecutionInput,
  surface: string,
  action: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const runtime = input.googleRuntime;
  if (!runtime) {
    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({ error: "La integracion de Google no esta configurada para este agente." }),
    };
  }

  const accessToken = await resolveGoogleAccessToken(runtime, input.organizationId);
  if (!accessToken) {
    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({ error: "No se pudo obtener un token valido de Google. Puede ser necesario reautenticar." }),
    };
  }

  const integrationId = runtime.integration.id;
  const argsWithAction = { ...args, action };

  if (surface === "gmail") {
    return executeGmailTool(input.toolCallId, action as GmailToolAction, argsWithAction, accessToken, input.organizationId, integrationId);
  }

  if (surface === "google_calendar") {
    return executeGoogleCalendarTool(input.toolCallId, action as GoogleCalendarToolAction, argsWithAction, accessToken, input.organizationId, integrationId);
  }

  if (surface === "google_sheets") {
    return executeGoogleSheetsTool(input.toolCallId, action as GoogleSheetsToolAction, argsWithAction, accessToken, input.organizationId, integrationId);
  }

  return {
    kind: "error",
    toolCallId: input.toolCallId,
    content: JSON.stringify({ error: `Surface de Google no soportada: ${surface}` }),
  };
}

async function executeGmailTool(
  toolCallId: string,
  action: GmailToolAction,
  args: Record<string, unknown>,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<ToolExecutionResult> {
  if (isGmailReadOnlyAction(action)) {
    const result = await runGoogleGmailAction(
      args as Parameters<typeof runGoogleGmailAction>[0],
      accessToken,
      organizationId,
      integrationId
    );
    return { kind: "executed", toolCallId, content: JSON.stringify(result) };
  }

  const result = await runGoogleGmailWriteAction(
    args as Parameters<typeof runGoogleGmailWriteAction>[0],
    accessToken,
    organizationId,
    integrationId
  );
  return { kind: "executed", toolCallId, content: JSON.stringify(result) };
}

async function executeGoogleCalendarTool(
  toolCallId: string,
  action: GoogleCalendarToolAction,
  args: Record<string, unknown>,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<ToolExecutionResult> {
  if (isGoogleCalendarReadAction(action)) {
    const result = await runGoogleCalendarAction(
      args as Parameters<typeof runGoogleCalendarAction>[0],
      accessToken,
      organizationId,
      integrationId
    );
    return { kind: "executed", toolCallId, content: JSON.stringify(result) };
  }

  const result = await runGoogleCalendarWriteAction(
    args as Parameters<typeof runGoogleCalendarWriteAction>[0],
    accessToken,
    organizationId,
    integrationId
  );
  return { kind: "executed", toolCallId, content: JSON.stringify(result) };
}

async function executeGoogleSheetsTool(
  toolCallId: string,
  action: GoogleSheetsToolAction,
  args: Record<string, unknown>,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<ToolExecutionResult> {
  if (isGoogleSheetsReadAction(action)) {
    const result = await runGoogleSheetsReadAction(
      args as Parameters<typeof runGoogleSheetsReadAction>[0],
      accessToken,
      organizationId,
      integrationId
    );
    return { kind: "executed", toolCallId, content: JSON.stringify(result) };
  }

  const result = await runGoogleSheetsWriteAction(
    args as Parameters<typeof runGoogleSheetsWriteAction>[0],
    accessToken,
    organizationId,
    integrationId
  );
  return { kind: "executed", toolCallId, content: JSON.stringify(result) };
}

async function executeSalesforceTool(
  input: ToolExecutionInput,
  action: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const integrationId = input.salesforceIntegrationId;
  if (!integrationId) {
    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({ error: "La integracion de Salesforce no esta configurada para este agente." }),
    };
  }

  const result = await executeSalesforceToolAction({
    organizationId: input.organizationId,
    userId: input.userId,
    agentId: input.agentId,
    integrationId,
    actionInput: args as Parameters<typeof executeSalesforceToolAction>[0]["actionInput"],
  });

  if (result.error || !result.data) {
    return {
      kind: "error",
      toolCallId: input.toolCallId,
      content: JSON.stringify({ error: result.error ?? "Error al ejecutar la accion de Salesforce." }),
    };
  }

  return {
    kind: "executed",
    toolCallId: input.toolCallId,
    content: JSON.stringify(result.data),
  };
}
