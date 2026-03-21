import type {
  ActionDefinition,
  PlannedAction,
  RunActionPlanResult,
} from "@/lib/engine/types";

export type OperationalActionClass =
  | "simple_read"
  | "multi_step_read"
  | "write_with_approval"
  | "workflow_async";

export type OperationalLlmUsage = {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
};

export type ActionUsageAllocation = {
  provider: string;
  action: string;
  allocation: "equal_split";
  tokensInputAllocated: number;
  tokensOutputAllocated: number;
  estimatedCostUsdAllocated: number;
};

export type OperationalMetrics = {
  actionClass: OperationalActionClass;
  plannerCalls: number;
  fallbackCalls: number;
  clarifications: number;
  actionsExecuted: number;
  approvalsEnqueued: number;
  llmUsage: {
    planner: OperationalLlmUsage;
    fallback: OperationalLlmUsage;
    synthesis: OperationalLlmUsage;
    total: OperationalLlmUsage;
  };
  actionUsage: ActionUsageAllocation[];
};

export type WorkflowRunOperationalSummary = {
  actionClass: "workflow_async";
  plannerCalls: number;
  fallbackCalls: number;
  clarifications: number;
  actionsExecuted: number;
  approvalsEnqueued: number;
  llmTokensInput: number;
  llmTokensOutput: number;
  estimatedCostUsd: number;
  stepsCompleted: number;
  stepsFailed: number;
  lastStep: {
    workflowStepId: string;
    provider: string;
    action: string;
    status: "completed" | "failed";
  } | null;
};

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function allocateIntegerEvenly(total: number, count: number, index: number): number {
  if (count <= 0) {
    return 0;
  }

  const base = Math.floor(total / count);
  const remainder = total % count;
  return base + (index < remainder ? 1 : 0);
}

export function estimateLlmCostUsd(tokensInput: number, tokensOutput: number): number {
  return roundUsd((tokensInput * 0.003 + tokensOutput * 0.006) / 1000);
}

export function createOperationalLlmUsage(input?: {
  calls?: number;
  tokensInput?: number;
  tokensOutput?: number;
}): OperationalLlmUsage {
  const calls = input?.calls ?? 0;
  const tokensInput = input?.tokensInput ?? 0;
  const tokensOutput = input?.tokensOutput ?? 0;

  return {
    calls,
    tokensInput,
    tokensOutput,
    estimatedCostUsd: estimateLlmCostUsd(tokensInput, tokensOutput),
  };
}

export function sumOperationalLlmUsage(
  items: OperationalLlmUsage[]
): OperationalLlmUsage {
  const calls = items.reduce((sum, item) => sum + item.calls, 0);
  const tokensInput = items.reduce((sum, item) => sum + item.tokensInput, 0);
  const tokensOutput = items.reduce((sum, item) => sum + item.tokensOutput, 0);

  return createOperationalLlmUsage({
    calls,
    tokensInput,
    tokensOutput,
  });
}

function allocateUsageAcrossActions(
  actions: PlannedAction[],
  usage: OperationalLlmUsage
): ActionUsageAllocation[] {
  if (actions.length === 0) {
    return [];
  }

  return actions.map((action, index) => ({
    provider: action.provider,
    action: action.type,
    allocation: "equal_split",
    tokensInputAllocated: allocateIntegerEvenly(
      usage.tokensInput,
      actions.length,
      index
    ),
    tokensOutputAllocated: allocateIntegerEvenly(
      usage.tokensOutput,
      actions.length,
      index
    ),
    estimatedCostUsdAllocated: roundUsd(usage.estimatedCostUsd / actions.length),
  }));
}

export function classifyChatOperationalAction(input: {
  plannedActions: PlannedAction[];
  executedActions: PlannedAction[];
  executionStatus?: "executed" | "approval_enqueued" | "policy_blocked" | "clarify";
  actionDefinitions?: Array<ActionDefinition<Record<string, unknown>, unknown, unknown>>;
}): Exclude<OperationalActionClass, "workflow_async"> {
  const executionModes = input.actionDefinitions?.map(
    (definition) => definition.executionMode
  ) ?? [];
  const requiresApproval =
    input.executionStatus === "approval_enqueued" ||
    executionModes.includes("approval_async") ||
    input.plannedActions.some((action) => action.requiresApprovalHint === true);

  if (requiresApproval) {
    return "write_with_approval";
  }

  const actionCount = Math.max(
    input.plannedActions.length,
    input.executedActions.length
  );

  return actionCount > 1 ? "multi_step_read" : "simple_read";
}

export function buildChatOperationalMetrics(input: {
  plannedActions: PlannedAction[];
  executedActions: PlannedAction[];
  executionStatus?: "executed" | "approval_enqueued" | "policy_blocked" | "clarify";
  actionDefinitions?: Array<ActionDefinition<Record<string, unknown>, unknown, unknown>>;
  plannerUsage: OperationalLlmUsage;
  fallbackUsage?: OperationalLlmUsage;
  synthesisUsage?: OperationalLlmUsage;
  clarifications: number;
  approvalsEnqueued: number;
}): OperationalMetrics {
  const fallbackUsage = input.fallbackUsage ?? createOperationalLlmUsage();
  const synthesisUsage = input.synthesisUsage ?? createOperationalLlmUsage();
  const totalUsage = sumOperationalLlmUsage([
    input.plannerUsage,
    fallbackUsage,
    synthesisUsage,
  ]);
  const actionUsage = allocateUsageAcrossActions(
    input.executedActions.length > 0 ? input.executedActions : input.plannedActions,
    totalUsage
  );

  return {
    actionClass: classifyChatOperationalAction({
      plannedActions: input.plannedActions,
      executedActions: input.executedActions,
      executionStatus: input.executionStatus,
      actionDefinitions: input.actionDefinitions,
    }),
    plannerCalls: input.plannerUsage.calls,
    fallbackCalls: fallbackUsage.calls,
    clarifications: input.clarifications,
    actionsExecuted: input.executedActions.length,
    approvalsEnqueued: input.approvalsEnqueued,
    llmUsage: {
      planner: input.plannerUsage,
      fallback: fallbackUsage,
      synthesis: synthesisUsage,
      total: totalUsage,
    },
    actionUsage,
  };
}

export function buildWorkflowOperationalMetrics(input: {
  provider: string;
  action: string;
}): OperationalMetrics {
  const totalUsage = createOperationalLlmUsage();

  return {
    actionClass: "workflow_async",
    plannerCalls: 0,
    fallbackCalls: 0,
    clarifications: 0,
    actionsExecuted: 1,
    approvalsEnqueued: 0,
    llmUsage: {
      planner: createOperationalLlmUsage(),
      fallback: createOperationalLlmUsage(),
      synthesis: createOperationalLlmUsage(),
      total: totalUsage,
    },
    actionUsage: [
      {
        provider: input.provider,
        action: input.action,
        allocation: "equal_split",
        tokensInputAllocated: 0,
        tokensOutputAllocated: 0,
        estimatedCostUsdAllocated: 0,
      },
    ],
  };
}

export function summarizeWorkflowRunOperationalMetrics(input: {
  current: WorkflowRunOperationalSummary | null;
  stepMetrics: OperationalMetrics;
  workflowStepId: string;
  provider: string;
  action: string;
  status: "completed" | "failed";
}): WorkflowRunOperationalSummary {
  const current = input.current;
  return {
    actionClass: "workflow_async",
    plannerCalls: (current?.plannerCalls ?? 0) + input.stepMetrics.plannerCalls,
    fallbackCalls: (current?.fallbackCalls ?? 0) + input.stepMetrics.fallbackCalls,
    clarifications: (current?.clarifications ?? 0) + input.stepMetrics.clarifications,
    actionsExecuted: (current?.actionsExecuted ?? 0) + input.stepMetrics.actionsExecuted,
    approvalsEnqueued:
      (current?.approvalsEnqueued ?? 0) + input.stepMetrics.approvalsEnqueued,
    llmTokensInput:
      (current?.llmTokensInput ?? 0) + input.stepMetrics.llmUsage.total.tokensInput,
    llmTokensOutput:
      (current?.llmTokensOutput ?? 0) + input.stepMetrics.llmUsage.total.tokensOutput,
    estimatedCostUsd: roundUsd(
      (current?.estimatedCostUsd ?? 0) +
        input.stepMetrics.llmUsage.total.estimatedCostUsd
    ),
    stepsCompleted:
      (current?.stepsCompleted ?? 0) + (input.status === "completed" ? 1 : 0),
    stepsFailed: (current?.stepsFailed ?? 0) + (input.status === "failed" ? 1 : 0),
    lastStep: {
      workflowStepId: input.workflowStepId,
      provider: input.provider,
      action: input.action,
      status: input.status,
    },
  };
}

export function getExecutedPlannedActions<TResolvedParams, TState>(
  result: RunActionPlanResult<TResolvedParams, TState>
): PlannedAction[] {
  return result.executedActions.map((item) => item.action);
}
