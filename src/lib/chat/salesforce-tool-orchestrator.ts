import "server-only";

import {
  isPendingToolActionExpired,
  readPendingToolAction,
  type PendingSalesforceToolAction,
} from "@/lib/chat/conversation-metadata";
import { planSalesforceToolAction } from "@/lib/chat/salesforce-tool-planner";
import { updateConversationMetadata } from "@/lib/db/conversations";
import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  buildSalesforceConfirmationSummary,
  executeSalesforceToolAction,
  formatSalesforceToolResultForPrompt,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import { isSalesforceWriteAction } from "@/lib/integrations/salesforce-tools";
import {
  detectSalesforcePromptConflict,
  stripSalesforcePromptConflicts,
} from "@/lib/integrations/salesforce-selection";
import type { Agent, Conversation } from "@/types/app";

const MAX_TOOL_CALLS = 5;
const MAX_TOOL_RECURSION_DEPTH = 3;
const PENDING_TOOL_TTL_MS = 10 * 60 * 1000;
const STRICT_CONFIRMATIONS = new Set([
  "confirmo",
  "confirmar",
  "si confirmo",
  "sí confirmo",
  "si, confirmo",
  "sí, confirmo",
]);

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SalesforceChatOrchestrationResult =
  | { kind: "continue"; toolContext?: string }
  | { kind: "respond_now"; content: string };

function isStrictConfirmation(content: string): boolean {
  return STRICT_CONFIRMATIONS.has(content.trim().toLowerCase());
}

function buildPendingAction(input: {
  integrationId: string;
  initiatedBy: string;
  summary: string;
  actionInput: PendingSalesforceToolAction["actionInput"];
}): PendingSalesforceToolAction {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PENDING_TOOL_TTL_MS).toISOString();

  return {
    tool: "salesforce_crm",
    integrationId: input.integrationId,
    actionInput: input.actionInput,
    summary: input.summary,
    initiatedBy: input.initiatedBy,
    createdAt,
    expiresAt,
  };
}

function buildConfirmationResponse(action: PendingSalesforceToolAction): string {
  return [
    `Necesito confirmacion antes de escribir en Salesforce: ${action.summary}`,
    "Si quieres ejecutarlo, responde exactamente `confirmo` dentro de esta conversacion.",
  ].join(" ");
}

export async function orchestrateSalesforceForChat(input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  userId: string;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
}): Promise<SalesforceChatOrchestrationResult> {
  const runtimeResult = await getSalesforceAgentToolRuntime(input.agent.id, input.organizationId);
  if (runtimeResult.error || !runtimeResult.data) {
    console.info("chat.salesforce_runtime_skipped", {
      agentId: input.agent.id,
      organizationId: input.organizationId,
      error: runtimeResult.error,
    });
    return runtimeResult.error === "El agente no tiene la tool CRM de Salesforce habilitada"
      ? { kind: "continue" }
      : { kind: "respond_now", content: runtimeResult.error ?? "No se pudo cargar Salesforce para este agente." };
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return { kind: "respond_now", content: usableRuntime.error ?? "La integracion de Salesforce no esta disponible." };
  }

  const pendingAction = readPendingToolAction(input.conversation.metadata);
  if (pendingAction) {
    if (isPendingToolActionExpired(pendingAction)) {
      await updateConversationMetadata(input.conversation.id, input.agent.id, input.organizationId, {
        pending_tool_action: null,
      }, {
        initiatedBy: input.userId,
        useServiceRole: true,
      });

      if (isStrictConfirmation(input.latestUserMessage)) {
        return {
          kind: "respond_now",
          content: "La confirmacion pendiente para Salesforce expiro. Vuelve a pedir la accion si quieres intentarlo otra vez.",
        };
      }
    } else if (isStrictConfirmation(input.latestUserMessage)) {
      const enabledRuntime = assertSalesforceActionEnabled(usableRuntime.data, pendingAction.actionInput.action);
      if (enabledRuntime.error) {
        await updateConversationMetadata(input.conversation.id, input.agent.id, input.organizationId, {
          pending_tool_action: null,
        }, {
          initiatedBy: input.userId,
          useServiceRole: true,
        });

        return { kind: "respond_now", content: enabledRuntime.error };
      }

      const execution = await executeSalesforceToolAction({
        organizationId: input.organizationId,
        userId: input.userId,
        agentId: input.agent.id,
        integrationId: pendingAction.integrationId,
        actionInput: pendingAction.actionInput,
      });

      await updateConversationMetadata(input.conversation.id, input.agent.id, input.organizationId, {
        pending_tool_action: null,
      }, {
        initiatedBy: input.userId,
        useServiceRole: true,
      });

      if (execution.error || !execution.data) {
        return { kind: "respond_now", content: execution.error ?? "No se pudo ejecutar la accion en Salesforce." };
      }

      return {
        kind: "continue",
        toolContext: formatSalesforceToolResultForPrompt(execution.data),
      };
    } else {
      await updateConversationMetadata(input.conversation.id, input.agent.id, input.organizationId, {
        pending_tool_action: null,
      }, {
        initiatedBy: input.userId,
        useServiceRole: true,
      });
    }
  }

  const promptConflict = detectSalesforcePromptConflict(input.agent.system_prompt);
  const plannerSystemPrompt = promptConflict.hasConflict
    ? stripSalesforcePromptConflicts(input.agent.system_prompt)
    : input.agent.system_prompt;

  if (promptConflict.hasConflict) {
    console.warn("chat.salesforce_prompt_conflict", {
      agentId: input.agent.id,
      organizationId: input.organizationId,
      snippet: promptConflict.snippet,
    });
  }

  const toolResults: Array<{ action: string; result: string }> = [];

  for (let depth = 0; depth < MAX_TOOL_RECURSION_DEPTH && toolResults.length < MAX_TOOL_CALLS; depth += 1) {
    const plannerDecision = await planSalesforceToolAction({
      model: input.agent.llm_model,
      organizationId: input.organizationId,
      agentId: input.agent.id,
      conversationId: input.conversation.id,
      systemPrompt: plannerSystemPrompt,
      config: usableRuntime.data.config,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      toolResults,
    });

    if (plannerDecision.kind === "respond") {
      console.info("chat.salesforce_planner_respond", {
        agentId: input.agent.id,
        organizationId: input.organizationId,
        depth,
        hasToolResults: toolResults.length > 0,
        latestUserMessage: input.latestUserMessage.slice(0, 100),
      });
      return toolResults.length > 0
        ? { kind: "continue", toolContext: toolResults.map((item) => item.result).join("\n\n") }
        : { kind: "continue" };
    }

    const enabledRuntime = assertSalesforceActionEnabled(usableRuntime.data, plannerDecision.input.action);
    if (enabledRuntime.error) {
      return { kind: "continue" };
    }

    if (plannerDecision.requiresConfirmation || isSalesforceWriteAction(plannerDecision.input.action)) {
      const pending = buildPendingAction({
        integrationId: usableRuntime.data.integration.id,
        initiatedBy: input.userId,
        summary: buildSalesforceConfirmationSummary(plannerDecision.input),
        actionInput: plannerDecision.input,
      });

      await updateConversationMetadata(input.conversation.id, input.agent.id, input.organizationId, {
        pending_tool_action: pending,
      }, {
        initiatedBy: input.userId,
        useServiceRole: true,
      });

      return {
        kind: "respond_now",
        content: buildConfirmationResponse(pending),
      };
    }

    const execution = await executeSalesforceToolAction({
      organizationId: input.organizationId,
      userId: input.userId,
      agentId: input.agent.id,
      integrationId: usableRuntime.data.integration.id,
      actionInput: plannerDecision.input,
    });

    if (execution.error || !execution.data) {
      return { kind: "respond_now", content: execution.error ?? "No se pudo consultar Salesforce." };
    }

    toolResults.push({
      action: execution.data.action,
      result: formatSalesforceToolResultForPrompt(execution.data),
    });
  }

  return toolResults.length > 0
    ? { kind: "continue", toolContext: toolResults.map((item) => item.result).join("\n\n") }
    : { kind: "continue" };
}


