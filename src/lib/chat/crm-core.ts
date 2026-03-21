import type { Conversation } from "@/types/app";
import type { PendingCrmAction } from "@/lib/chat/conversation-metadata";
import { createPendingCrmAction } from "@/lib/chat/crm-pending-action";
import {
  CHAT_CONFIRMATION_PROVIDERS,
  formatChatConfirmationMarker,
  type ChatConfirmationProvider,
} from "@/lib/chat/inline-forms";
import { createActionPolicyEvaluator } from "@/lib/engine/policy";
import {
  createActionRegistry,
  createEngineStepRegistry,
  runAction,
} from "@/lib/engine/runtime";
import type {
  ActionDefinition,
  ActionPlan,
  PlannedAction,
  PlannedParam,
  RunActionResult,
} from "@/lib/engine/types";

type DbResult<T> = { data: T | null; error: string | null };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolResult = {
  action: string;
  result: string;
};

type CrmEngineContext<
  TRuntime,
  TActionInput extends { action: string },
  TResult extends { action: string },
> = {
  adapter: CrmChatAdapter<TRuntime, TActionInput, TResult>;
  runtime: TRuntime;
  organizationId: string;
  userId: string;
  agentId: string;
};

type CrmEngineState<TResult extends { action: string }> = {
  executionResult: TResult | null;
  formattedResult: string | null;
};

class CrmActionNotAllowedError extends Error {}

export type CrmChatOrchestrationResult =
  | {
      kind: "continue";
      toolContext?: string;
      hasUsableRuntime: boolean;
      runtime: unknown;
    }
  | { kind: "respond_now"; content: string };

export type CrmPlannerDecision<TActionInput> =
  | { kind: "respond" }
  | { kind: "missing_data"; message: string }
  | { kind: "action"; requiresConfirmation: boolean; input: TActionInput };

export type CrmConversationState<TActionInput> = {
  pendingAction: PendingCrmAction<TActionInput> | null;
  recentToolContext?: string;
  hasExpiredPendingAction: boolean;
  hasExpiredRecentToolContext: boolean;
};

export type CrmChatAdapter<TRuntime, TActionInput extends { action: string }, TResult> = {
  provider: string;
  toolName: string;
  loadRuntime: () => Promise<DbResult<TRuntime>>;
  isRuntimeUsable: (runtime: TRuntime) => DbResult<TRuntime>;
  planNextAction: (input: {
    runtime: TRuntime;
    systemPrompt: string;
    latestUserMessage: string;
    recentMessages: ChatMessage[];
    toolResults: ToolResult[];
    recentToolContext?: string;
  }) => Promise<CrmPlannerDecision<TActionInput>>;
  isActionAllowed: (runtime: TRuntime, action: TActionInput["action"]) => DbResult<TRuntime>;
  executeAction: (input: {
    runtime: TRuntime;
    organizationId: string;
    userId: string;
    agentId: string;
    actionInput: TActionInput;
  }) => Promise<DbResult<TResult>>;
  formatResultForPrompt: (result: TResult) => string;
  buildConfirmationSummary: (input: TActionInput) => string;
  isWriteAction: (action: TActionInput["action"]) => boolean;
  readConversationState: (metadata: Conversation["metadata"]) => CrmConversationState<TActionInput>;
  writeConversationState: (input: {
    conversationId: string;
    agentId: string;
    organizationId: string;
    userId: string;
    pendingAction?: PendingCrmAction<TActionInput> | null;
    recentToolContext?: string | null;
  }) => Promise<void>;
  createApprovalRequest?: (input: {
    runtime: TRuntime;
    conversationId: string;
    organizationId: string;
    userId: string;
    agentId: string;
    actionInput: TActionInput;
    summary: string;
  }) => Promise<
    DbResult<{
      approvalItemId: string;
      workflowRunId: string;
      workflowStepId: string;
      expiresAt: string;
    }>
  >;
  onLoadRuntimeFailure?: (error: string | null) => CrmChatOrchestrationResult;
  maxToolCalls?: number;
  maxRecursionDepth?: number;
  pendingActionTtlMs?: number;
  strictConfirmations?: ReadonlySet<string>;
};

const DEFAULT_MAX_TOOL_CALLS = 5;
const DEFAULT_MAX_RECURSION_DEPTH = 3;
const DEFAULT_PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_STRICT_CONFIRMATIONS = new Set([
  "confirmo",
  "confirmar",
  "si confirmo",
  "si, confirmo",
  "sÃ¯Â¿Â½ confirmo",
  "sÃ¯Â¿Â½, confirmo",
]);
const CRM_ENGINE_STEP_CHECK_ACTION_ALLOWED = "crm.check_action_allowed";
const CRM_ENGINE_STEP_EXECUTE_ACTION = "crm.execute_action";
const CRM_ENGINE_STEP_FORMAT_RESULT = "crm.format_result";

function buildToolContext(toolResults: ToolResult[]): string {
  return toolResults.map((item) => item.result).join("\n\n");
}

function toPlannedParam(value: unknown): PlannedParam {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return { kind: "primitive", value };
  }

  if (Array.isArray(value)) {
    return {
      kind: "collection",
      items: value.map((item) => toPlannedParam(item)),
    };
  }

  if (value instanceof Date) {
    return {
      kind: "temporal_ref",
      value: value.toISOString(),
      granularity: "datetime",
    };
  }

  if (value && typeof value === "object") {
    return {
      kind: "generated_text",
      value: JSON.stringify(value),
    };
  }

  return {
    kind: "unresolved",
  };
}

function buildActionPlan<TActionInput extends { action: string }>(
  provider: string,
  plannerDecision: CrmPlannerDecision<TActionInput>
): ActionPlan {
  if (plannerDecision.kind !== "action") {
    return {
      actions: [],
      plannerConfidence: plannerDecision.kind === "respond" ? 1 : 0,
      missingFields: plannerDecision.kind === "missing_data" ? ["planner_missing_data"] : [],
      candidateProviders: [provider],
    };
  }

  const params = Object.fromEntries(
    Object.entries(plannerDecision.input)
      .filter(([key]) => key !== "action")
      .map(([key, value]) => [key, toPlannedParam(value)])
  );

  return {
    actions: [
      {
        type: plannerDecision.input.action,
        provider,
        params,
        requiresApprovalHint: plannerDecision.requiresConfirmation,
      },
    ],
    plannerConfidence: 1,
    missingFields: [],
    candidateProviders: [provider],
  };
}

function buildActionDefinition<TActionInput extends { action: string }>(
  action: PlannedAction,
  actionInput: TActionInput,
  requiresApproval: boolean
): ActionDefinition<Record<string, unknown>> {
  return {
    type: action.type,
    provider: action.provider,
    steps: [
      CRM_ENGINE_STEP_CHECK_ACTION_ALLOWED,
      CRM_ENGINE_STEP_EXECUTE_ACTION,
      CRM_ENGINE_STEP_FORMAT_RESULT,
    ],
    resolverSchema: null,
    executionMode: requiresApproval ? "approval_async" : "sync",
    policyKey: `${action.provider}:${action.type}`,
    resolve: async () => ({
      status: "ok",
      resolvedParams: actionInput as Record<string, unknown>,
    }),
  };
}

function createCrmEngineRuntime<
  TRuntime extends { integration: { id: string } },
  TActionInput extends { action: string },
  TResult extends { action: string },
>(input: {
  adapter: CrmChatAdapter<TRuntime, TActionInput, TResult>;
  runtime: TRuntime;
  organizationId: string;
  userId: string;
  agentId: string;
  action: PlannedAction;
  actionInput: TActionInput;
  requiresApproval: boolean;
}) {
  const context: CrmEngineContext<TRuntime, TActionInput, TResult> = {
    adapter: input.adapter,
    runtime: input.runtime,
    organizationId: input.organizationId,
    userId: input.userId,
    agentId: input.agentId,
  };
  const definition = buildActionDefinition(
    input.action,
    input.actionInput,
    input.requiresApproval
  );

  return {
    context,
    initialState: {
      executionResult: null,
      formattedResult: null,
    } satisfies CrmEngineState<TResult>,
    actions: createActionRegistry<
      CrmEngineContext<TRuntime, TActionInput, TResult>,
      CrmEngineState<TResult>
    >([definition as ActionDefinition<Record<string, unknown>>]),
    engineSteps: createEngineStepRegistry<
      CrmEngineContext<TRuntime, TActionInput, TResult>,
      CrmEngineState<TResult>
    >([
      [
        CRM_ENGINE_STEP_CHECK_ACTION_ALLOWED,
        async ({ context, resolvedParams, state }) => {
          const enabledRuntime = context.adapter.isActionAllowed(
            context.runtime,
            resolvedParams.action as TActionInput["action"]
          );

          if (enabledRuntime.error || !enabledRuntime.data) {
            throw new CrmActionNotAllowedError(
              enabledRuntime.error ?? "La accion CRM ya no esta disponible."
            );
          }

          return state;
        },
      ],
      [
        CRM_ENGINE_STEP_EXECUTE_ACTION,
        async ({ context, resolvedParams, state }) => {
          const execution = await context.adapter.executeAction({
            runtime: context.runtime,
            organizationId: context.organizationId,
            userId: context.userId,
            agentId: context.agentId,
            actionInput: resolvedParams as TActionInput,
          });

          if (execution.error || !execution.data) {
            throw new Error(
              execution.error ?? `No se pudo ejecutar la accion en ${context.adapter.provider}.`
            );
          }

          return {
            ...state,
            executionResult: execution.data,
          };
        },
      ],
      [
        CRM_ENGINE_STEP_FORMAT_RESULT,
        async ({ context, state }) => {
          if (!state.executionResult) {
            throw new Error("CRM engine missing execution result.");
          }

          return {
            ...state,
            formattedResult: context.adapter.formatResultForPrompt(state.executionResult),
          };
        },
      ],
    ]),
  };
}

async function executePlannedCrmAction<
  TRuntime extends { integration: { id: string } },
  TActionInput extends { action: string },
  TResult extends { action: string },
>(input: {
  adapter: CrmChatAdapter<TRuntime, TActionInput, TResult>;
  runtime: TRuntime;
  organizationId: string;
  userId: string;
  agentId: string;
  plannerDecision: Extract<CrmPlannerDecision<TActionInput>, { kind: "action" }>;
  forceSyncExecution?: boolean;
}): Promise<RunActionResult<Record<string, unknown>, CrmEngineState<TResult>>> {
  const actionPlan = buildActionPlan(input.adapter.provider, input.plannerDecision);
  const plannedAction = actionPlan.actions[0];

  if (!plannedAction) {
    throw new Error("CRM engine expected a planned action.");
  }

  const engineRuntime = createCrmEngineRuntime({
    adapter: input.adapter,
    runtime: input.runtime,
    organizationId: input.organizationId,
    userId: input.userId,
    agentId: input.agentId,
    action: plannedAction,
    actionInput: input.plannerDecision.input,
    requiresApproval:
      input.forceSyncExecution === true
        ? false
        : input.plannerDecision.requiresConfirmation ||
          input.adapter.isWriteAction(input.plannerDecision.input.action),
  });

  return runAction({
    action: plannedAction,
    context: engineRuntime.context,
    initialState: engineRuntime.initialState,
    actions: engineRuntime.actions,
    engineSteps: engineRuntime.engineSteps,
    evaluatePolicy:
      input.forceSyncExecution === true
        ? () => "execute"
        : createActionPolicyEvaluator<Record<string, unknown>>(),
  });
}

function isStrictConfirmation(
  content: string,
  strictConfirmations: ReadonlySet<string>
): boolean {
  return strictConfirmations.has(content.trim().toLowerCase());
}

function isChatConfirmationProvider(
  provider: string
): provider is ChatConfirmationProvider {
  return (CHAT_CONFIRMATION_PROVIDERS as readonly string[]).includes(provider);
}

function buildConfirmationResponse(action: PendingCrmAction<unknown>): string {
  const lines = [
    `Necesito confirmacion antes de escribir en ${action.provider}: ${action.summary}`,
    "Si quieres ejecutarlo, responde exactamente `confirmo` dentro de esta conversacion.",
  ];

  if (isChatConfirmationProvider(action.provider)) {
    lines.push(formatChatConfirmationMarker(action.provider));
  }

  return lines.join("\n");
}

function buildApprovalInboxResponse(input: {
  provider: string;
  summary: string;
  expiresAt: string;
}): string {
  const expiresAt = new Date(input.expiresAt).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return [
    `Prepare una aprobacion para ${input.provider}: ${input.summary}`,
    `Revisala en /approvals antes de ${expiresAt}.`,
    "Esta accion ya no se confirma con `confirmo` dentro del chat.",
  ].join("\n");
}

export async function orchestrateCrmForChat<
  TRuntime extends { integration: { id: string } },
  TActionInput extends { action: string },
  TResult extends { action: string },
>(input: {
  adapter: CrmChatAdapter<TRuntime, TActionInput, TResult>;
  conversation: Conversation;
  agentId: string;
  organizationId: string;
  userId: string;
  systemPrompt: string;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
}): Promise<CrmChatOrchestrationResult> {
  const maxToolCalls = input.adapter.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const maxRecursionDepth =
    input.adapter.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;
  const pendingActionTtlMs =
    input.adapter.pendingActionTtlMs ?? DEFAULT_PENDING_ACTION_TTL_MS;
  const strictConfirmations =
    input.adapter.strictConfirmations ?? DEFAULT_STRICT_CONFIRMATIONS;

  const runtimeResult = await input.adapter.loadRuntime();
  if (runtimeResult.error || !runtimeResult.data) {
    return input.adapter.onLoadRuntimeFailure
      ? input.adapter.onLoadRuntimeFailure(runtimeResult.error)
      : {
          kind: "respond_now",
          content: runtimeResult.error ?? "No se pudo cargar la tool CRM del agente.",
        };
  }

  const usableRuntime = input.adapter.isRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return {
      kind: "respond_now",
      content: usableRuntime.error ?? "La integracion CRM no esta disponible.",
    };
  }

  const conversationState = input.adapter.readConversationState(
    input.conversation.metadata
  );

  if (conversationState.hasExpiredRecentToolContext) {
    await input.adapter.writeConversationState({
      conversationId: input.conversation.id,
      agentId: input.agentId,
      organizationId: input.organizationId,
      userId: input.userId,
      recentToolContext: null,
    });
  }

  if (conversationState.pendingAction) {
    if (conversationState.hasExpiredPendingAction) {
      await input.adapter.writeConversationState({
        conversationId: input.conversation.id,
        agentId: input.agentId,
        organizationId: input.organizationId,
        userId: input.userId,
        pendingAction: null,
      });

      if (isStrictConfirmation(input.latestUserMessage, strictConfirmations)) {
        return {
          kind: "respond_now",
          content: `La confirmacion pendiente para ${input.adapter.provider} expiro. Vuelve a pedir la accion si quieres intentarlo otra vez.`,
        };
      }
    } else if (isStrictConfirmation(input.latestUserMessage, strictConfirmations)) {
      if (input.adapter.createApprovalRequest) {
        return {
          kind: "respond_now",
          content:
            "Esa accion ya quedo enviada a la approval inbox. Revisala desde /approvals para aprobarla o rechazarla.",
        };
      }

      await input.adapter.writeConversationState({
        conversationId: input.conversation.id,
        agentId: input.agentId,
        organizationId: input.organizationId,
        userId: input.userId,
        pendingAction: null,
      });

      try {
        const execution = await executePlannedCrmAction({
          adapter: input.adapter,
          runtime: usableRuntime.data,
          organizationId: input.organizationId,
          userId: input.userId,
          agentId: input.agentId,
          plannerDecision: {
            kind: "action",
            requiresConfirmation: false,
            input: conversationState.pendingAction.actionInput,
          },
          forceSyncExecution: true,
        });

        if (execution.status !== "executed") {
          return {
            kind: "respond_now",
            content: `No se pudo ejecutar la accion en ${input.adapter.provider}.`,
          };
        }

        const toolContext = execution.state.formattedResult ?? "";
        await input.adapter.writeConversationState({
          conversationId: input.conversation.id,
          agentId: input.agentId,
          organizationId: input.organizationId,
          userId: input.userId,
          recentToolContext: toolContext,
        });

        return {
          kind: "continue",
          toolContext,
          hasUsableRuntime: true,
          runtime: usableRuntime.data,
        };
      } catch (error) {
        return {
          kind: "respond_now",
          content:
            error instanceof Error
              ? error.message
              : `No se pudo ejecutar la accion en ${input.adapter.provider}.`,
        };
      }
    } else {
      await input.adapter.writeConversationState({
        conversationId: input.conversation.id,
        agentId: input.agentId,
        organizationId: input.organizationId,
        userId: input.userId,
        pendingAction: null,
      });
    }
  }

  const toolResults: ToolResult[] = [];

  for (
    let depth = 0;
    depth < maxRecursionDepth && toolResults.length < maxToolCalls;
    depth += 1
  ) {
    const plannerDecision = await input.adapter.planNextAction({
      runtime: usableRuntime.data,
      systemPrompt: input.systemPrompt,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      toolResults,
      recentToolContext: conversationState.recentToolContext,
    });

    if (plannerDecision.kind === "missing_data") {
      return { kind: "respond_now", content: plannerDecision.message };
    }

    if (plannerDecision.kind === "respond") {
      if (toolResults.length > 0) {
        const toolContext = buildToolContext(toolResults);
        await input.adapter.writeConversationState({
          conversationId: input.conversation.id,
          agentId: input.agentId,
          organizationId: input.organizationId,
          userId: input.userId,
          recentToolContext: toolContext,
        });

        return {
          kind: "continue",
          toolContext,
          hasUsableRuntime: true,
          runtime: usableRuntime.data,
        };
      }

      return {
        kind: "continue",
        hasUsableRuntime: true,
        runtime: usableRuntime.data,
      };
    }

    try {
      const execution = await executePlannedCrmAction({
        adapter: input.adapter,
        runtime: usableRuntime.data,
        organizationId: input.organizationId,
        userId: input.userId,
        agentId: input.agentId,
        plannerDecision,
      });

      if (execution.status === "policy_blocked") {
        if (execution.policyDecision !== "enqueue_approval") {
          return {
            kind: "continue",
            hasUsableRuntime: true,
            runtime: usableRuntime.data,
          };
        }

        const summary = input.adapter.buildConfirmationSummary(plannerDecision.input);
        const pendingAction = createPendingCrmAction({
          provider: input.adapter.provider,
          toolName: input.adapter.toolName,
          integrationId: usableRuntime.data.integration.id,
          initiatedBy: input.userId,
          summary,
          actionInput: plannerDecision.input,
          ttlMs: pendingActionTtlMs,
        });

        if (input.adapter.createApprovalRequest) {
          const approvalRequest = await input.adapter.createApprovalRequest({
            runtime: usableRuntime.data,
            conversationId: input.conversation.id,
            organizationId: input.organizationId,
            userId: input.userId,
            agentId: input.agentId,
            actionInput: plannerDecision.input,
            summary,
          });

          if (approvalRequest.error || !approvalRequest.data) {
            return {
              kind: "respond_now",
              content:
                approvalRequest.error ??
                `No se pudo preparar la aprobacion para ${input.adapter.provider}.`,
            };
          }

          await input.adapter.writeConversationState({
            conversationId: input.conversation.id,
            agentId: input.agentId,
            organizationId: input.organizationId,
            userId: input.userId,
            pendingAction,
          });

          return {
            kind: "respond_now",
            content: buildApprovalInboxResponse({
              provider: input.adapter.provider,
              summary,
              expiresAt: approvalRequest.data.expiresAt,
            }),
          };
        }

        await input.adapter.writeConversationState({
          conversationId: input.conversation.id,
          agentId: input.agentId,
          organizationId: input.organizationId,
          userId: input.userId,
          pendingAction,
        });

        return {
          kind: "respond_now",
          content: buildConfirmationResponse(pendingAction),
        };
      }

      toolResults.push({
        action: plannerDecision.input.action,
        result: execution.state.formattedResult ?? "",
      });
    } catch (error) {
      if (error instanceof CrmActionNotAllowedError) {
        return {
          kind: "continue",
          hasUsableRuntime: true,
          runtime: usableRuntime.data,
        };
      }

      return {
        kind: "respond_now",
        content:
          error instanceof Error
            ? error.message
            : `No se pudo consultar ${input.adapter.provider}.`,
      };
    }
  }

  if (toolResults.length > 0) {
    const toolContext = buildToolContext(toolResults);
    await input.adapter.writeConversationState({
      conversationId: input.conversation.id,
      agentId: input.agentId,
      organizationId: input.organizationId,
      userId: input.userId,
      recentToolContext: toolContext,
    });

    return {
      kind: "continue",
      toolContext,
      hasUsableRuntime: true,
      runtime: usableRuntime.data,
    };
  }

  return {
    kind: "continue",
    hasUsableRuntime: true,
    runtime: usableRuntime.data,
  };
}
