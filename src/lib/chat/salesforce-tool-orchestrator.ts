import "server-only";

import {
  createRecentCrmToolContext,
  createRecentSalesforceToolContext,
  isPendingToolActionExpired,
  isRecentSalesforceToolContextExpired,
  readPendingCrmAction,
  readRecentCrmToolContext,
  type PendingCrmAction,
  type PendingSalesforceToolAction,
} from "@/lib/chat/conversation-metadata";
import { orchestrateCrmForChat, type CrmChatAdapter } from "@/lib/chat/crm-core";
import { planSalesforceToolAction } from "@/lib/chat/salesforce-tool-planner";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { updateConversationMetadata } from "@/lib/db/conversations";
import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  buildSalesforceConfirmationSummary,
  executeSalesforceToolAction,
  formatSalesforceToolResultForPrompt,
  getSalesforceAgentToolRuntime,
  type SalesforceAgentToolRuntime,
  type SalesforceToolExecutionResult,
} from "@/lib/integrations/salesforce-agent-runtime";
import {
  isSalesforceWriteAction,
  type ExecuteSalesforceCrmToolInput,
} from "@/lib/integrations/salesforce-tools";
import { createApprovalRequest } from "@/lib/workflows/approval-request";
import type { AgentScope } from "@/lib/agents/agent-scope";
import type { Agent, Conversation } from "@/types/app";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SalesforceChatOrchestrationResult =
  | {
      kind: "continue";
      toolContext?: string;
      hasUsableSalesforceRuntime: boolean;
      allowedActions: ExecuteSalesforceCrmToolInput["action"][];
    }
  | { kind: "respond_now"; content: string };

function toLegacyPendingToolAction(
  pendingAction: PendingCrmAction<ExecuteSalesforceCrmToolInput> | null
): PendingSalesforceToolAction | null {
  if (!pendingAction) {
    return null;
  }

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

function buildSalesforceAdapter(input: {
  agent: Agent;
  conversationId: string;
  workflowTemplateId: string | null;
  automationPreset: "copilot" | "assisted" | "autonomous" | null;
  agentScope: AgentScope;
}): CrmChatAdapter<
  SalesforceAgentToolRuntime,
  ExecuteSalesforceCrmToolInput,
  SalesforceToolExecutionResult
> {
  return {
    provider: "salesforce",
    toolName: "salesforce_crm",
    loadRuntime: () => getSalesforceAgentToolRuntime(input.agent.id, input.agent.organization_id),
    isRuntimeUsable: assertSalesforceRuntimeUsable,
    planNextAction: ({ runtime, systemPrompt, latestUserMessage, recentMessages, toolResults, recentToolContext }) =>
      planSalesforceToolAction({
        model: input.agent.llm_model,
        organizationId: input.agent.organization_id,
        agentId: input.agent.id,
        conversationId: input.conversationId,
        systemPrompt,
        config: runtime.config,
        latestUserMessage,
        recentMessages,
        toolResults,
        recentToolContext,
      }),
    isActionAllowed: assertSalesforceActionEnabled,
    executeAction: ({ organizationId, userId, agentId, runtime, actionInput }) =>
      executeSalesforceToolAction({
        organizationId,
        userId,
        agentId,
        integrationId: runtime.integration.id,
        actionInput,
      }),
    formatResultForPrompt: formatSalesforceToolResultForPrompt,
    buildConfirmationSummary: buildSalesforceConfirmationSummary,
    isWriteAction: isSalesforceWriteAction,
    readConversationState: (metadata) => {
      const pendingAction = readPendingCrmAction<ExecuteSalesforceCrmToolInput>(metadata, "salesforce");
      const recentToolContext = readRecentCrmToolContext(metadata, "salesforce");

      return {
        pendingAction,
        recentToolContext: recentToolContext?.context,
        hasExpiredPendingAction: pendingAction ? isPendingToolActionExpired(pendingAction) : false,
        hasExpiredRecentToolContext: recentToolContext
          ? isRecentSalesforceToolContextExpired(recentToolContext)
          : false,
      };
    },
    writeConversationState: async ({
      conversationId,
      agentId,
      organizationId,
      userId,
      pendingAction,
      recentToolContext,
    }) => {
      await updateConversationMetadata(
        conversationId,
        agentId,
        organizationId,
        {
          ...(pendingAction !== undefined
            ? {
                pending_crm_action: pendingAction,
                pending_tool_action: toLegacyPendingToolAction(pendingAction),
              }
            : {}),
          ...(recentToolContext !== undefined
            ? {
                recent_crm_tool_context: recentToolContext
                  ? createRecentCrmToolContext("salesforce", recentToolContext)
                  : null,
                recent_salesforce_tool_context: recentToolContext
                  ? createRecentSalesforceToolContext(recentToolContext)
                  : null,
              }
            : {}),
        },
        {
          initiatedBy: userId,
          useServiceRole: true,
        }
      );
    },
    onLoadRuntimeFailure: (error) => {
      console.info("chat.salesforce_runtime_skipped", {
        agentId: input.agent.id,
        organizationId: input.agent.organization_id,
        error,
      });

      if (error === "El agente no tiene la tool CRM de Salesforce habilitada") {
        return {
          kind: "respond_now",
          content:
            "Salesforce no esta conectado para este agente. Ve a Configuracion > Integraciones para conectar tu cuenta de Salesforce y luego habilita la tool CRM en la configuracion del agente.",
        };
      }

      return {
        kind: "respond_now",
        content: error ?? "No se pudo cargar Salesforce para este agente.",
      };
    },
    createApprovalRequest: ({
      runtime,
      conversationId,
      organizationId,
      userId,
      agentId,
      actionInput,
      summary,
    }) =>
      createApprovalRequest({
        organizationId,
        agentId,
        conversationId,
        userId,
        provider: "salesforce",
        action: actionInput.action,
        integrationId: runtime.integration.id,
        toolName: "salesforce_crm",
        summary,
        payloadSummary: {
          action: actionInput.action,
          action_input: actionInput as never,
        },
        context: {
          source: "chat",
        },
        workflowTemplateId: input.workflowTemplateId,
        automationPreset: input.automationPreset,
        agentScope: input.agentScope,
      }),
  };
}

export async function orchestrateSalesforceForChat(input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  userId: string;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
}): Promise<SalesforceChatOrchestrationResult> {
  const setupState = readAgentSetupState(input.agent);
  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: input.agent.system_prompt,
    setupState,
    promptEnvironment: { salesforceUsable: true },
    allowConflictCleanupForCustom: true,
  });

  if (promptResolution.hasPromptConflict) {
    console.warn("chat.salesforce_prompt_conflict", {
      agentId: input.agent.id,
      organizationId: input.organizationId,
      snippet: promptResolution.promptConflictSnippet,
    });
  }

  const orchestration = await orchestrateCrmForChat({
    adapter: buildSalesforceAdapter({
      agent: input.agent,
      conversationId: input.conversation.id,
      workflowTemplateId: setupState?.workflowTemplateId ?? null,
      automationPreset: setupState?.automationPreset ?? null,
      agentScope: setupState?.agentScope ?? "operations",
    }),
    conversation: input.conversation,
    agentId: input.agent.id,
    organizationId: input.organizationId,
    userId: input.userId,
    systemPrompt: promptResolution.effectivePrompt,
    latestUserMessage: input.latestUserMessage,
    recentMessages: input.recentMessages,
  });

  return orchestration.kind === "continue"
    ? {
        kind: "continue",
        toolContext: orchestration.toolContext,
        hasUsableSalesforceRuntime: orchestration.hasUsableRuntime,
        allowedActions: [
          ...(
            orchestration.runtime as SalesforceAgentToolRuntime
          ).config.allowed_actions,
        ],
      }
    : orchestration;
}
