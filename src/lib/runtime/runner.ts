import { getActionDefinitionV1 } from "./action-catalog";
import { getRuntimeGraphV1 } from "./graph";
import { DEFAULT_RUNTIME_BUDGET_V1 } from "./types";
import type {
  ActionExecutionOutcomeV1,
  ActionDependencyV3,
  ExecutionCheckpointV1,
  ExecutionContextV1,
  ExecutionTraceV1,
  NodeResultV1,
  RunExecutionGraphInputV1,
  RunExecutionGraphResultV1,
  RuntimeActionPlan,
  RuntimeActionV1,
  RuntimeAuxiliaryNodeId,
  RuntimeEventV1,
  RuntimeGraphNodeId,
  RuntimeNodeId,
  RuntimeNodeStatus,
  RuntimeNodeVisitV1,
} from "./types";

type RuntimeDependencyState = {
  byTargetActionId: Map<string, ActionDependencyV3[]>;
  executionOrder: string[];
  actionIndexById: Map<string, number>;
};

type RuntimeExecutionState = {
  completedActionIds: Set<string>;
  actionOutputsByActionId: Map<string, Record<string, unknown>>;
  executionOrder: string[];
};

function cloneContext(ctx: ExecutionContextV1): ExecutionContextV1 {
  return {
    ...ctx,
    budget: {
      ...DEFAULT_RUNTIME_BUDGET_V1,
      ...ctx.budget,
    },
    conversationMetadata: { ...ctx.conversationMetadata },
    messageMetadata: { ...ctx.messageMetadata },
  };
}

function mergeContext(
  current: ExecutionContextV1,
  patch?: Partial<ExecutionContextV1>
): ExecutionContextV1 {
  if (!patch) {
    return current;
  }

  return {
    ...current,
    ...patch,
    budget: patch.budget ? { ...current.budget, ...patch.budget } : current.budget,
    conversationMetadata: patch.conversationMetadata
      ? { ...current.conversationMetadata, ...patch.conversationMetadata }
      : current.conversationMetadata,
    messageMetadata: patch.messageMetadata
      ? { ...current.messageMetadata, ...patch.messageMetadata }
      : current.messageMetadata,
  };
}

function mergeAction(current: RuntimeActionV1, patch?: Partial<RuntimeActionV1>): RuntimeActionV1 {
  if (!patch) {
    return current;
  }

  return {
    ...current,
    ...patch,
    params: patch.params ? { ...current.params, ...patch.params } : current.params,
    metadata: patch.metadata ? { ...(current.metadata ?? {}), ...patch.metadata } : current.metadata,
  };
}

function createEvent(input: {
  type: RuntimeEventV1["type"];
  ctx: ExecutionContextV1;
  action?: RuntimeActionV1;
  node?: RuntimeNodeId;
  status?: RuntimeEventV1["status"];
  latencyMs?: number;
  reason?: string;
  result?: NodeResultV1;
}): RuntimeEventV1 {
  return {
    type: input.type,
    requestId: input.ctx.requestId,
    traceId: input.ctx.traceId,
    runtimeRunId: input.ctx.runtimeRunId,
    actionId: input.action?.id,
    actionType: input.action?.type,
    node: input.node,
    status: input.status,
    latencyMs: input.latencyMs,
    reason: input.reason ?? input.result?.reason,
    provider: input.result?.provider,
    providerRequestId: input.result?.providerRequestId,
    approvalItemId: input.result?.approvalItemId,
    workflowRunId: input.result?.workflowRunId,
    workflowStepId: input.result?.workflowStepId,
  };
}

function createVisit(input: {
  node: RuntimeNodeId;
  status: RuntimeNodeStatus;
  attempt: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  reason?: string;
  viaLlmRepair?: boolean;
  errorFingerprint?: string;
  policyDecision?: NodeResultV1["policyDecision"];
  executionOutcome?: NodeResultV1["executionOutcome"];
}): RuntimeNodeVisitV1 {
  return {
    node: input.node,
    status: input.status,
    attempt: input.attempt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    latencyMs: input.latencyMs,
    reason: input.reason,
    viaLlmRepair: input.viaLlmRepair ?? false,
    errorFingerprint: input.errorFingerprint,
    policyDecision: input.policyDecision,
    executionOutcome: input.executionOutcome,
  };
}

function createCheckpoint(
  ctx: ExecutionContextV1,
  action: RuntimeActionV1,
  actionIndex: number,
  planVersion: RuntimeActionPlan["version"],
  node: RuntimeNodeId,
  status: Exclude<RuntimeNodeStatus, "success" | "needs_llm">,
  resumeFrom: RuntimeGraphNodeId,
  reason: string | undefined,
  retries: number,
  llmRepairCalls: number,
  nodeVisitCounts: Map<RuntimeNodeId, number>,
  errorFingerprint: string | undefined,
  executionState: RuntimeExecutionState,
  now: () => Date
): ExecutionCheckpointV1 {
  return {
    planVersion,
    actionId: action.id,
    actionIndex,
    node,
    status,
    resumeFrom,
    reason,
    createdAt: now().toISOString(),
    retries,
    llmRepairCalls,
    nodeVisitCounts: Object.fromEntries(nodeVisitCounts.entries()),
    errorFingerprint,
    actionSnapshot: action,
    contextSnapshot: {
      budget: { ...ctx.budget },
      conversationMetadata: { ...ctx.conversationMetadata },
      messageMetadata: { ...ctx.messageMetadata },
      timezone: ctx.timezone ?? null,
    },
    executionStateSnapshot: {
      completedActionIds: [...executionState.completedActionIds],
      actionOutputsByActionId: Object.fromEntries(executionState.actionOutputsByActionId.entries()),
      executionOrder: [...executionState.executionOrder],
    },
  };
}

function getErrorSignature(node: RuntimeNodeId, status: RuntimeNodeStatus, reason?: string): string {
  return `${node}:${status}:${reason ?? "unknown"}`;
}

function mapStopStatus(
  status:
    | "needs_user"
    | "failed"
    | "blocked"
    | "waiting_async_execution"
    | "completed_with_degradation"
): RunExecutionGraphResultV1["outcome"] {
  if (status === "waiting_async_execution" || status === "completed_with_degradation") {
    return "success";
  }

  return status;
}

function mergeCheckpointIntoContext(
  ctx: ExecutionContextV1,
  checkpoint: ExecutionCheckpointV1 | undefined
): ExecutionContextV1 {
  return mergeContext(ctx, {
    conversationMetadata: {
      runtime_checkpoint: checkpoint ?? null,
    },
  });
}

function shouldPauseForCheckpoint(status: RuntimeNodeStatus): boolean {
  return status === "needs_user" ||
    status === "waiting_approval" ||
    status === "waiting_async_execution";
}

function normalizeFinalStatus(
  status: RuntimeNodeStatus
): ActionExecutionOutcomeV1["status"] {
  if (status === "retry") {
    return "failed";
  }

  if (status === "needs_llm") {
    return "needs_user";
  }

  return status;
}

function normalizeCheckpointStatus(
  status: RuntimeNodeStatus
): Exclude<RuntimeNodeStatus, "success" | "needs_llm"> {
  if (status === "success" || status === "needs_llm" || status === "retry") {
    return "needs_user";
  }

  return status;
}

function isActionPlanV3(plan: RuntimeActionPlan): plan is Extract<RuntimeActionPlan, { version: 3 }> {
  return plan.version === 3;
}

function isPrimitiveValue(
  value: unknown
): value is string | number | boolean | null | ReadonlyArray<string | number | boolean | null> {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      value.every((item) =>
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
      ));
}

function getValueAtPath(source: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index)) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function toParamValue(
  value: unknown,
  mapping: ActionDependencyV3["outputMapping"][number],
  sourceActionId: string
): RuntimeActionV1["params"][string] {
  const label = mapping.labelPath && typeof value === "object" && value !== null
    ? getValueAtPath(value as Record<string, unknown>, mapping.labelPath)
    : undefined;

  if (mapping.valueType === "reference") {
    return {
      kind: "reference",
      refType: mapping.refType ?? "runtime_output",
      value: typeof value === "string" ? value : JSON.stringify(value),
      ...(typeof label === "string" && label.trim().length > 0 ? { label } : {}),
    };
  }

  if (mapping.valueType === "entity") {
    return {
      kind: "entity",
      entityType: mapping.entityType ?? "runtime_entity",
      value: typeof value === "string" ? value : JSON.stringify(value),
      ...(typeof label === "string" && label.trim().length > 0 ? { label } : {}),
    };
  }

  if (mapping.valueType === "time") {
    return {
      kind: "time",
      value: typeof value === "string" ? value : JSON.stringify(value),
      ...(mapping.timezone ? { timezone: mapping.timezone } : {}),
      ...(mapping.granularity ? { granularity: mapping.granularity } : {}),
    };
  }

  if (mapping.valueType === "computed") {
    return {
      kind: "computed",
      value: isPrimitiveValue(value) || Array.isArray(value)
        ? value
        : (value as Record<string, unknown>),
      source: `action_output:${sourceActionId}.${mapping.outputPath}`,
    };
  }

  if (isPrimitiveValue(value)) {
    return {
      kind: "primitive",
      value,
    };
  }

  return {
    kind: "computed",
    value: Array.isArray(value) ? value : (value as Record<string, unknown>),
    source: `action_output:${sourceActionId}.${mapping.outputPath}`,
  };
}

function buildDependencyState(plan: RuntimeActionPlan): RuntimeDependencyState | null {
  const actionIndexById = new Map<string, number>();

  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = plan.actions[index];
    if (!action || actionIndexById.has(action.id)) {
      return null;
    }

    actionIndexById.set(action.id, index);
  }

  if (!isActionPlanV3(plan)) {
    return {
      byTargetActionId: new Map(),
      executionOrder: plan.actions.map((action) => action.id),
      actionIndexById,
    };
  }

  const byTargetActionId = new Map<string, ActionDependencyV3[]>();
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const action of plan.actions) {
    indegree.set(action.id, 0);
  }

  for (const edge of plan.edges) {
    if (
      edge.fromActionId === edge.toActionId ||
      !actionIndexById.has(edge.fromActionId) ||
      !actionIndexById.has(edge.toActionId)
    ) {
      return null;
    }

    byTargetActionId.set(edge.toActionId, [...(byTargetActionId.get(edge.toActionId) ?? []), edge]);
    adjacency.set(edge.fromActionId, [...(adjacency.get(edge.fromActionId) ?? []), edge.toActionId]);
    indegree.set(edge.toActionId, (indegree.get(edge.toActionId) ?? 0) + 1);
  }

  const rootIds = plan.actions
    .map((action) => action.id)
    .filter((actionId) => (indegree.get(actionId) ?? 0) === 0);
  const normalizedEntryIds = [...new Set(plan.entryActionIds)];

  if (
    normalizedEntryIds.length === 0 ||
    normalizedEntryIds.length !== rootIds.length ||
    normalizedEntryIds.some((actionId) => !rootIds.includes(actionId))
  ) {
    return null;
  }

  const ready = [...rootIds].sort((left, right) =>
    (actionIndexById.get(left) ?? 0) - (actionIndexById.get(right) ?? 0)
  );
  const executionOrder: string[] = [];

  while (ready.length > 0) {
    const currentActionId = ready.shift();
    if (!currentActionId) {
      continue;
    }

    executionOrder.push(currentActionId);
    const nextIds = adjacency.get(currentActionId) ?? [];

    for (const nextId of nextIds) {
      const nextIndegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(nextId);
        ready.sort((left, right) =>
          (actionIndexById.get(left) ?? 0) - (actionIndexById.get(right) ?? 0)
        );
      }
    }
  }

  if (executionOrder.length !== plan.actions.length) {
    return null;
  }

  return {
    byTargetActionId,
    executionOrder,
    actionIndexById,
  };
}

function createExecutionState(
  plan: RuntimeActionPlan,
  dependencyState: RuntimeDependencyState,
  checkpoint: ExecutionCheckpointV1 | null
): RuntimeExecutionState {
  const executionOrder = checkpoint?.executionStateSnapshot?.executionOrder?.length
    ? [...checkpoint.executionStateSnapshot.executionOrder]
    : [...dependencyState.executionOrder];
  const actionOutputsByActionId = new Map<string, Record<string, unknown>>(
    Object.entries(checkpoint?.executionStateSnapshot?.actionOutputsByActionId ?? {})
      .filter(([, output]) => typeof output === "object" && output !== null)
      .map(([actionId, output]) => [actionId, output as Record<string, unknown>])
  );
  const completedActionIds = new Set<string>(checkpoint?.executionStateSnapshot?.completedActionIds ?? []);

  if (!checkpoint?.executionStateSnapshot && checkpoint) {
    for (let index = 0; index < checkpoint.actionIndex; index += 1) {
      const action = plan.actions[index];
      if (action) {
        completedActionIds.add(action.id);
      }
    }
  }

  return {
    completedActionIds,
    actionOutputsByActionId,
    executionOrder,
  };
}

function applyDependencyMappings(
  action: RuntimeActionV1,
  dependencies: ActionDependencyV3[],
  executionState: RuntimeExecutionState
): { action: RuntimeActionV1; reason?: string } {
  let nextAction = action;

  for (const dependency of dependencies) {
    const output = executionState.actionOutputsByActionId.get(dependency.fromActionId);
    if (!output) {
      return {
        action,
        reason: `dependency_output_unavailable:${dependency.fromActionId}`,
      };
    }

    for (const mapping of dependency.outputMapping) {
      const resolvedValue = getValueAtPath(output, mapping.outputPath);

      if (resolvedValue === undefined) {
        if (mapping.required === false) {
          continue;
        }

        return {
          action,
          reason: `dependency_output_missing:${dependency.fromActionId}.${mapping.outputPath}`,
        };
      }

      nextAction = mergeAction(nextAction, {
        params: {
          [mapping.toParamKey]: toParamValue(resolvedValue, mapping, dependency.fromActionId),
        },
      });
    }
  }

  return { action: nextAction };
}

export async function runExecutionGraph(
  input: RunExecutionGraphInputV1
): Promise<RunExecutionGraphResultV1> {
  const now = input.now ?? (() => new Date());
  const graph = getRuntimeGraphV1();
  const initialContext = cloneContext(input.ctx);
  const dependencyState = buildDependencyState(input.actionPlan);
  if (!dependencyState) {
    const trace: ExecutionTraceV1 = {
      requestId: initialContext.requestId,
      traceId: initialContext.traceId,
      planVersion: input.actionPlan.version,
      graph,
      actions: [],
      events: [
        createEvent({ type: "runtime.plan.started", ctx: initialContext }),
        createEvent({
          type: "runtime.plan.failed",
          ctx: initialContext,
          status: "blocked",
          reason: "invalid_action_plan_graph",
        }),
      ],
    };

    return {
      outcome: "blocked",
      actions: [],
      trace,
      context: initialContext,
    };
  }

  if (
    input.actionPlan.actions.length >
    (initialContext.budget.maxActionsPerPlan ?? DEFAULT_RUNTIME_BUDGET_V1.maxActionsPerPlan)
  ) {
    const blockedAction = input.actionPlan.actions[0];
    const trace: ExecutionTraceV1 = {
      requestId: initialContext.requestId,
      traceId: initialContext.traceId,
      planVersion: input.actionPlan.version,
      graph,
      actions: [],
      events: [
        createEvent({ type: "runtime.plan.started", ctx: initialContext }),
        createEvent({
          type: "runtime.plan.failed",
          ctx: initialContext,
          action: blockedAction,
          status: "blocked",
          reason: "plan_action_limit_exceeded",
        }),
      ],
    };

    return {
      outcome: "blocked",
      actions: [],
      trace,
      context: initialContext,
    };
  }

  const trace: ExecutionTraceV1 = {
    requestId: initialContext.requestId,
    traceId: initialContext.traceId,
    planVersion: input.actionPlan.version,
    graph,
    actions: [],
    events: [createEvent({ type: "runtime.plan.started", ctx: initialContext })],
  };

  let ctx = initialContext;
  const outcomes: ActionExecutionOutcomeV1[] = [];
  const resumeCheckpoint = input.resumeFromCheckpoint ?? null;
  const resumeActionIndex = resumeCheckpoint?.actionIndex ?? 0;
  const executionState = createExecutionState(input.actionPlan, dependencyState, resumeCheckpoint);

  for (const scheduledActionId of dependencyState.executionOrder) {
    const actionIndex = dependencyState.actionIndexById.get(scheduledActionId);
    if (actionIndex === undefined) {
      continue;
    }

    const originalAction = input.actionPlan.actions[actionIndex];
    if (!originalAction) {
      continue;
    }

    if (
      executionState.completedActionIds.has(originalAction.id) &&
      originalAction.id !== resumeCheckpoint?.actionId
    ) {
      continue;
    }

    if (!resumeCheckpoint?.executionStateSnapshot && actionIndex < resumeActionIndex) {
      continue;
    }

    const isResumedAction = resumeCheckpoint !== null && actionIndex === resumeActionIndex;
    let action = mergeAction(
      originalAction,
      isResumedAction ? resumeCheckpoint?.actionSnapshot : undefined
    );
    if (isResumedAction && resumeCheckpoint) {
      ctx = mergeContext(ctx, resumeCheckpoint.contextSnapshot);
    }

    const dependencies = dependencyState.byTargetActionId.get(action.id) ?? [];
    const dependencyApplication = applyDependencyMappings(action, dependencies, executionState);
    if (dependencyApplication.reason) {
      const blockedOutcome: ActionExecutionOutcomeV1 = {
        actionId: action.id,
        actionType: action.type,
        status: "blocked",
        action,
        dependencyActionIds: dependencies.map((dependency) => dependency.fromActionId),
        currentNode: "resolve",
        retries: 0,
        llmRepairCalls: 0,
        reason: dependencyApplication.reason,
      };
      outcomes.push(blockedOutcome);
      trace.actions.push({
        ...blockedOutcome,
        nodeVisits: [],
      });
      trace.events.push(
        createEvent({
          type: "runtime.action.blocked",
          ctx,
          action,
          node: "resolve",
          status: "blocked",
          reason: dependencyApplication.reason,
        })
      );

      return {
        outcome: "blocked",
        actions: outcomes,
        trace,
        context: ctx,
      };
    }
    action = dependencyApplication.action;

    let actionRetries = isResumedAction ? resumeCheckpoint?.retries ?? 0 : 0;
    let llmRepairCalls = isResumedAction ? resumeCheckpoint?.llmRepairCalls ?? 0 : 0;
    let totalLlmRepairCalls = ctx.budget.llmRepairCallsUsedInRequest ?? 0;
    let currentNodeIndex = isResumedAction
      ? Math.max(graph.indexOf(resumeCheckpoint?.resumeFrom ?? "normalize"), 0)
      : 0;
    let previousErrorSignature: string | null = isResumedAction
      ? resumeCheckpoint?.errorFingerprint ?? null
      : null;
    const repeatedErrorCounts = new Map<string, number>();
    if (isResumedAction && resumeCheckpoint?.errorFingerprint) {
      repeatedErrorCounts.set(resumeCheckpoint.errorFingerprint, 1);
    }
    const nodeAttempts = new Map<RuntimeNodeId, number>(
      isResumedAction
        ? Object.entries(resumeCheckpoint?.nodeVisitCounts ?? {}).map(([node, count]) => [
          node as RuntimeNodeId,
          count ?? 0,
        ])
        : []
    );
    const nodeVisits: RuntimeNodeVisitV1[] = [];
    let finalStatus: ActionExecutionOutcomeV1["status"] = "success";
    let finalReason: string | undefined;
    let finalNode: RuntimeNodeId | undefined;
    let finalOutput: Record<string, unknown> | undefined;
    let finalCheckpoint: ExecutionCheckpointV1 | undefined;
    const invokeAuxiliaryNode = async (inputNode: RuntimeAuxiliaryNodeId, inputResult: NodeResultV1, sourceNode: RuntimeNodeId) => {
      const handler = input.nodes[inputNode];
      const attempt = (nodeAttempts.get(inputNode) ?? 0) + 1;
      nodeAttempts.set(inputNode, attempt);

      trace.events.push(
        createEvent({
          type: "runtime.node.started",
          ctx,
          action,
          node: inputNode,
          status: inputResult.status,
        })
      );

      const startedAt = now();
      const auxiliaryResult = await handler({
        ctx,
        action,
        node: inputNode,
        attempt,
        llmRepairCalls,
        sourceNode,
        sourceStatus: inputResult.status,
        sourceReason: inputResult.reason,
        sourceOutput: inputResult.output,
      });
      const completedAt = now();
      const latencyMs = completedAt.getTime() - startedAt.getTime();

      ctx = mergeContext(ctx, auxiliaryResult.contextPatch);
      action = mergeAction(action, auxiliaryResult.actionPatch);
      nodeVisits.push(
        createVisit({
          node: inputNode,
          status: auxiliaryResult.status,
          attempt,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs,
          reason: auxiliaryResult.reason,
          viaLlmRepair: inputNode === "llm_repair",
          errorFingerprint: auxiliaryResult.status === "success"
            ? undefined
            : getErrorSignature(inputNode, auxiliaryResult.status, auxiliaryResult.reason),
          policyDecision: auxiliaryResult.policyDecision,
          executionOutcome: auxiliaryResult.executionOutcome,
        })
      );
      trace.events.push(
        createEvent({
          type: auxiliaryResult.status === "failed"
            ? "runtime.node.failed"
            : "runtime.node.completed",
          ctx,
          action,
          node: inputNode,
          status: auxiliaryResult.status,
          latencyMs,
          result: auxiliaryResult,
        })
      );
      if (auxiliaryResult.events) {
        trace.events.push(...auxiliaryResult.events);
      }
      if (auxiliaryResult.output) {
        finalOutput = { ...(finalOutput ?? {}), ...auxiliaryResult.output };
      }

      return auxiliaryResult;
    };
    const settleNonSuccess = async (inputResult: NodeResultV1, sourceNode: RuntimeNodeId) => {
      let result = inputResult;
      let resultNode = sourceNode;

      if (
        resultNode !== "error_handler" &&
        (result.status === "retry" || result.status === "failed" || result.status === "blocked")
      ) {
        result = await invokeAuxiliaryNode("error_handler", result, sourceNode);
        resultNode = "error_handler";
      }

      if (resultNode !== "user_clarification" && result.status === "needs_user") {
        result = await invokeAuxiliaryNode("user_clarification", result, sourceNode);
        resultNode = "user_clarification";
      }

      return {
        result,
        resultNode,
      };
    };
    const invokeLlmRepair = async (inputResult: NodeResultV1, sourceNode: RuntimeGraphNodeId) => {
      return invokeAuxiliaryNode("llm_repair", inputResult, sourceNode);
    };

    while (currentNodeIndex < graph.length) {
      const node = graph[currentNodeIndex];
      const attempt = (nodeAttempts.get(node) ?? 0) + 1;
      nodeAttempts.set(node, attempt);

      if (
        attempt >
        (ctx.budget.maxNodeVisitsPerAction ?? DEFAULT_RUNTIME_BUDGET_V1.maxNodeVisitsPerAction)
      ) {
        finalStatus = "failed";
        finalReason = "max_node_visits_exceeded";
        finalNode = node;
        break;
      }

      trace.events.push(
        createEvent({
          type: "runtime.node.started",
          ctx,
          action,
          node,
          status: "success",
        })
      );

      const startedAt = now();
      const result = await input.nodes[node]({
        ctx,
        action,
        node,
        attempt,
        llmRepairCalls,
      });
      const completedAt = now();
      const latencyMs = completedAt.getTime() - startedAt.getTime();

      ctx = mergeContext(ctx, result.contextPatch);
      action = mergeAction(action, result.actionPatch);
      const errorSignature = getErrorSignature(node, result.status, result.reason);
      nodeVisits.push(
        createVisit({
          node,
          status: result.status,
          attempt,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs,
          reason: result.reason,
          errorFingerprint: result.status === "success" ? undefined : errorSignature,
          policyDecision: result.policyDecision,
          executionOutcome: result.executionOutcome,
        })
      );
      trace.events.push(
        createEvent({
          type: result.status === "failed" ? "runtime.node.failed" : "runtime.node.completed",
          ctx,
          action,
          node,
          status: result.status,
          latencyMs,
          result,
        })
      );
      if (result.events) {
        trace.events.push(...result.events);
      }

      if (result.output) {
        finalOutput = { ...(finalOutput ?? {}), ...result.output };
      }

      if (result.status === "success") {
        previousErrorSignature = null;
        currentNodeIndex += 1;
        continue;
      }

      const repeatedCount = (repeatedErrorCounts.get(errorSignature) ?? 0) + 1;
      repeatedErrorCounts.set(errorSignature, repeatedCount);
      if (
        previousErrorSignature === errorSignature &&
        repeatedCount >=
          (ctx.budget.repeatedErrorFingerprintLimit ??
            DEFAULT_RUNTIME_BUDGET_V1.repeatedErrorFingerprintLimit)
      ) {
        finalStatus = "failed";
        finalReason = result.reason ?? "repeated_runtime_error";
        finalNode = node;
        break;
      }
      previousErrorSignature = errorSignature;

      if (result.status === "retry") {
        if (
          actionRetries >= ctx.budget.syncRetriesMaxPerAction ||
          attempt >
            (ctx.budget.maxRetriesPerNode ?? DEFAULT_RUNTIME_BUDGET_V1.maxRetriesPerNode)
        ) {
          finalStatus = "failed";
          finalReason = result.reason ?? "retry_limit_exceeded";
          finalNode = node;
          break;
        }

        actionRetries += 1;
        continue;
      }

      if (result.status === "needs_llm") {
        const llmRepairAllowed =
          llmRepairCalls < ctx.budget.llmRepairCallsMaxPerAction &&
          totalLlmRepairCalls <
            (ctx.budget.llmRepairCallsMaxPerRequest ?? ctx.budget.llmRepairCallsMaxPerAction) &&
          (input.allowLlmRepair?.({
            ctx,
            action,
            node,
            reason: result.reason,
          }) ?? false);

        if (!llmRepairAllowed) {
          const clarification = await invokeAuxiliaryNode(
            "user_clarification",
            {
              status: "needs_user",
              reason: result.reason ?? "llm_repair_not_allowed",
              output: result.output,
            },
            node
          );
          finalStatus = normalizeFinalStatus(clarification.status);
          finalReason = clarification.reason ?? result.reason ?? "llm_repair_not_allowed";
          finalNode = "user_clarification";
          finalCheckpoint = createCheckpoint(
            ctx,
            action,
            actionIndex,
            input.actionPlan.version,
            finalNode,
            normalizeCheckpointStatus(finalStatus),
            node,
            finalReason,
            actionRetries,
            llmRepairCalls,
            nodeAttempts,
            errorSignature,
            executionState,
            now
          );
          trace.checkpoint = finalCheckpoint;
          ctx = mergeCheckpointIntoContext(ctx, finalCheckpoint);
          break;
        }

        llmRepairCalls += 1;
        totalLlmRepairCalls += 1;
        ctx = mergeContext(ctx, {
          budget: {
            ...ctx.budget,
            llmRepairCallsUsedInRequest: totalLlmRepairCalls,
          },
        });
        const llmResult = await invokeLlmRepair(result, node);
        if (llmResult.status === "success") {
          previousErrorSignature = null;
          continue;
        }

        if (llmResult.status === "needs_llm") {
          const clarification = await invokeAuxiliaryNode(
            "user_clarification",
            {
              status: "needs_user",
              reason: llmResult.reason ?? "nested_llm_repair_not_allowed",
              output: llmResult.output,
            },
            node
          );
          finalStatus = normalizeFinalStatus(clarification.status);
          finalReason = clarification.reason ?? llmResult.reason ?? "nested_llm_repair_not_allowed";
          finalNode = "user_clarification";
          finalCheckpoint = createCheckpoint(
            ctx,
            action,
            actionIndex,
            input.actionPlan.version,
            finalNode,
            normalizeCheckpointStatus(finalStatus),
            node,
            finalReason,
            actionRetries,
            llmRepairCalls,
            nodeAttempts,
            getErrorSignature(finalNode, clarification.status, clarification.reason),
            executionState,
            now
          );
          trace.checkpoint = finalCheckpoint;
          ctx = mergeCheckpointIntoContext(ctx, finalCheckpoint);
          break;
        }

        const settledLlmResult = await settleNonSuccess(llmResult, "llm_repair");
        finalStatus = normalizeFinalStatus(settledLlmResult.result.status);
        finalReason = settledLlmResult.result.reason;
        finalNode = settledLlmResult.resultNode;

        if (
          finalStatus !== "success" &&
          shouldPauseForCheckpoint(finalStatus)
        ) {
          finalCheckpoint = createCheckpoint(
            ctx,
            action,
            actionIndex,
            input.actionPlan.version,
            finalNode,
            normalizeCheckpointStatus(finalStatus),
            node,
            finalReason,
            actionRetries,
            llmRepairCalls,
            nodeAttempts,
            getErrorSignature(finalNode, settledLlmResult.result.status, settledLlmResult.result.reason),
            executionState,
            now
          );
          trace.checkpoint = finalCheckpoint;
          ctx = mergeCheckpointIntoContext(ctx, finalCheckpoint);
        }

        break;
      }

      const settledResult = await settleNonSuccess(result, node);
      finalStatus = normalizeFinalStatus(settledResult.result.status);
      finalReason = settledResult.result.reason;
      finalNode = settledResult.resultNode;

      if (
        finalStatus !== "success" &&
        shouldPauseForCheckpoint(finalStatus)
      ) {
        finalCheckpoint = createCheckpoint(
          ctx,
          action,
          actionIndex,
          input.actionPlan.version,
          finalNode,
          normalizeCheckpointStatus(finalStatus),
          node,
          finalReason,
          actionRetries,
          llmRepairCalls,
          nodeAttempts,
          getErrorSignature(finalNode, finalStatus, finalReason),
          executionState,
          now
        );
        trace.checkpoint = finalCheckpoint;
        ctx = mergeCheckpointIntoContext(ctx, finalCheckpoint);
      }

      break;
    }

    if (finalStatus === "success" && action.approvalMode === "required") {
      finalStatus = "waiting_approval";
      finalNode = "execute";
      finalReason = finalReason ?? "approval_enqueued";
      finalCheckpoint = createCheckpoint(
        ctx,
        action,
        actionIndex,
        input.actionPlan.version,
        "execute",
        finalStatus,
        "execute",
        finalReason,
        actionRetries,
        llmRepairCalls,
        nodeAttempts,
        undefined,
        executionState,
        now
      );
      trace.checkpoint = finalCheckpoint;
      ctx = mergeCheckpointIntoContext(ctx, finalCheckpoint);
    }

    const outcome: ActionExecutionOutcomeV1 = {
      actionId: action.id,
      actionType: action.type,
      status: finalStatus,
      action,
      dependencyActionIds: dependencies.map((dependency) => dependency.fromActionId),
      currentNode: finalNode,
      retries: actionRetries,
      llmRepairCalls,
      reason: finalReason,
      output: finalOutput,
      checkpoint: finalCheckpoint,
    };

    outcomes.push(outcome);
    trace.actions.push({
      ...outcome,
      nodeVisits,
    });

    if (
      (outcome.status === "success" || outcome.status === "waiting_approval") &&
      getActionDefinitionV1(action.type).sideEffectKind === "destructive"
    ) {
      ctx = mergeContext(ctx, {
        budget: {
          ...ctx.budget,
          destructiveActionsUsedInRequest:
            (ctx.budget.destructiveActionsUsedInRequest ?? 0) + 1,
        },
      });
    }

    if (outcome.status === "success" || outcome.status === "waiting_approval") {
      if (outcome.output) {
        executionState.actionOutputsByActionId.set(action.id, outcome.output);
      }

      if (outcome.status === "success") {
        executionState.completedActionIds.add(action.id);
      }

      trace.events.push(
        createEvent({
          type: action.approvalMode === "required"
            ? "runtime.action.approval_enqueued"
            : "runtime.action.completed",
          ctx,
          action,
          status: "completed",
          result: {
            status: "success",
            approvalItemId: finalOutput?.approvalItemId as string | undefined,
            workflowRunId: finalOutput?.workflowRunId as string | undefined,
          },
        })
      );

      if (outcome.status === "waiting_approval") {
        return {
          outcome: "success",
          actions: outcomes,
          trace,
          context: ctx,
        };
      }

      continue;
    }

    trace.events.push(
      createEvent({
        type: outcome.status === "blocked"
          ? "runtime.action.blocked"
          : "runtime.plan.failed",
        ctx,
        action,
        node: outcome.currentNode,
        status: outcome.status,
        reason: outcome.reason,
      })
    );

    return {
      outcome: mapStopStatus(outcome.status),
      actions: outcomes,
      trace,
      context: ctx,
    };
  }

  trace.events.push(createEvent({ type: "runtime.plan.completed", ctx }));

  return {
    outcome: "success",
    actions: outcomes,
    trace,
    context: ctx,
  };
}
