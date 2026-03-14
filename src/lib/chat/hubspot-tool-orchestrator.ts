import "server-only";

import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import {
  isPendingToolActionExpired,
  isRecentSalesforceToolContextExpired,
  readPendingCrmAction,
  readRecentCrmToolContext,
} from "@/lib/chat/conversation-metadata";
import { orchestrateCrmForChat, type CrmChatAdapter } from "@/lib/chat/crm-core";
import { planHubSpotToolAction } from "@/lib/chat/hubspot-tool-planner";
import { updateConversationMetadata } from "@/lib/db/conversations";
import {
  assertHubSpotActionEnabled,
  assertHubSpotRuntimeUsable,
  buildHubSpotConfirmationSummary,
  executeHubSpotToolAction,
  formatHubSpotToolResultForPrompt,
  getHubSpotAgentToolRuntime,
  type HubSpotAgentToolRuntime,
  type HubSpotToolExecutionResult,
} from "@/lib/integrations/hubspot-agent-runtime";
import { isHubSpotWriteAction, type ExecuteHubSpotCrmToolInput } from "@/lib/integrations/hubspot-tools";
import { createApprovalRequest } from "@/lib/workflows/approval-request";
import type { Agent, Conversation } from "@/types/app";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HubSpotChatOrchestrationResult =
  | {
      kind: "continue";
      toolContext?: string;
      hasUsableHubSpotRuntime: boolean;
      allowedActions: ExecuteHubSpotCrmToolInput["action"][];
    }
  | { kind: "respond_now"; content: string };

function buildHubSpotAdapter(input: {
  agent: Agent;
  conversationId: string;
  workflowTemplateId: string | null;
  automationPreset: "copilot" | "assisted" | "autonomous" | null;
}): CrmChatAdapter<
  HubSpotAgentToolRuntime,
  ExecuteHubSpotCrmToolInput,
  HubSpotToolExecutionResult
> {
  return {
    provider: "hubspot",
    toolName: "hubspot_crm",
    loadRuntime: () => getHubSpotAgentToolRuntime(input.agent.id, input.agent.organization_id),
    isRuntimeUsable: assertHubSpotRuntimeUsable,
    planNextAction: ({ runtime, systemPrompt, latestUserMessage, recentMessages, toolResults, recentToolContext }) =>
      planHubSpotToolAction({
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
    isActionAllowed: assertHubSpotActionEnabled,
    executeAction: ({ organizationId, userId, agentId, runtime, actionInput }) =>
      executeHubSpotToolAction({
        organizationId,
        userId,
        agentId,
        integrationId: runtime.integration.id,
        actionInput,
      }),
    formatResultForPrompt: formatHubSpotToolResultForPrompt,
    buildConfirmationSummary: buildHubSpotConfirmationSummary,
    isWriteAction: isHubSpotWriteAction,
    readConversationState: (metadata) => {
      const pendingAction = readPendingCrmAction<ExecuteHubSpotCrmToolInput>(
        metadata,
        "hubspot"
      );
      const recentToolContext = readRecentCrmToolContext(metadata, "hubspot");

      return {
        pendingAction,
        recentToolContext: recentToolContext?.context,
        hasExpiredPendingAction: pendingAction
          ? isPendingToolActionExpired(pendingAction)
          : false,
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
            ? { pending_crm_action: pendingAction }
            : {}),
          ...(recentToolContext !== undefined
            ? {
                recent_crm_tool_context: recentToolContext
                  ? {
                      provider: "hubspot",
                      context: recentToolContext,
                      recordedAt: new Date().toISOString(),
                    }
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
        provider: "hubspot",
        action: actionInput.action,
        integrationId: runtime.integration.id,
        toolName: "hubspot_crm",
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
      }),
    onLoadRuntimeFailure: (error) => {
      if (error === "El agente no tiene la tool CRM de HubSpot habilitada") {
        return {
          kind: "respond_now",
          content:
            "HubSpot no esta conectado para este agente. Ve a Configuracion > Integraciones para conectar tu cuenta de HubSpot y luego habilita la tool CRM en la configuracion del agente.",
        };
      }

      return { kind: "respond_now", content: error ?? "No se pudo cargar HubSpot para este agente." };
    },
  };
}

export async function orchestrateHubSpotForChat(input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  userId: string;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
}): Promise<HubSpotChatOrchestrationResult> {
  const setupState = readAgentSetupState(input.agent);
  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: input.agent.system_prompt,
    setupState,
    promptEnvironment: { hubspotUsable: true },
    allowConflictCleanupForCustom: true,
  });

  if (promptResolution.hasPromptConflict) {
    console.warn("chat.hubspot_prompt_conflict", {
      agentId: input.agent.id,
      organizationId: input.organizationId,
      snippet: promptResolution.promptConflictSnippet,
    });
  }

  const orchestration = await orchestrateCrmForChat({
    adapter: buildHubSpotAdapter({
      agent: input.agent,
      conversationId: input.conversation.id,
      workflowTemplateId: setupState?.workflowTemplateId ?? null,
      automationPreset: setupState?.automationPreset ?? null,
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
        hasUsableHubSpotRuntime: orchestration.hasUsableRuntime,
        allowedActions: [
          ...(
            orchestration.runtime as HubSpotAgentToolRuntime
          ).config.allowed_actions,
        ],
      }
    : orchestration;
}
