import { runExecutionGraph } from "./runner";
import type {
  ExecutionCheckpointV1,
  ExecutionContextV1,
  ReplayRequestV1,
  RuntimeActionDiffV1,
  RuntimeActionPlan,
  RuntimeGraphNodeId,
  RuntimeManualRepairResultV1,
  RuntimeNodeHandlerInputV1,
  RuntimeNodeRegistryV1,
  RuntimeReplayModeV1,
  RuntimeReplayResultV1,
  RuntimeRunDiffV1,
  RuntimeTraceActionViewV1,
  RuntimeTraceTimelineEntryV1,
  RuntimeTraceViewerV1,
} from "./types";
import type {
  RuntimeOperationsEventRecordV1,
  RuntimeOperationsRunRecordV1,
  RuntimeRunTraceViewV1,
} from "./operations";

export type RuntimeReplaySourceV1 = {
  runtimeRunId: string;
  organizationId: string;
  agentId: string;
  conversationId: string | null;
  requestId: string;
  traceId: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  currentActionIndex: number;
  checkpointNode?: string | null;
  actionPlan: RuntimeActionPlan | null;
  trace: RuntimeRunTraceViewV1;
  surface?: ExecutionContextV1["surface"] | null;
  channel?: ExecutionContextV1["channel"] | null;
  userId?: string | null;
  messageId?: string | null;
};

function getPayloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildTimelineEntry(event: RuntimeOperationsEventRecordV1): RuntimeTraceTimelineEntryV1 {
  return {
    at: event.createdAt,
    eventType: getPayloadString(event.payload, "type") ?? "runtime.event",
    actionId: event.actionId ?? null,
    actionType: event.actionType ?? null,
    node: event.node ?? null,
    status: event.status ?? null,
    reason: event.reason ?? null,
    provider: event.provider ?? null,
    providerRequestId: event.providerRequestId ?? null,
    approvalItemId: event.approvalItemId ?? null,
    workflowRunId: event.workflowRunId ?? null,
    workflowStepId: event.workflowStepId ?? null,
  };
}

function getLatestActionState(
  trace: RuntimeRunTraceViewV1,
  actionId: string
): RuntimeTraceActionViewV1 {
  const timeline = trace.events
    .filter((event) => event.actionId === actionId)
    .map(buildTimelineEntry)
    .sort((left, right) => left.at.localeCompare(right.at));
  const latest = timeline.at(-1);

  return {
    actionId,
    actionType: latest?.actionType ?? null,
    latestStatus: latest?.status ?? null,
    latestReason: latest?.reason ?? null,
    timeline,
  };
}

function getActionIdsFromTrace(trace: RuntimeRunTraceViewV1): string[] {
  return [...new Set(trace.events.map((event) => event.actionId).filter((value): value is string => !!value))];
}

function getActionTypeFromPlan(
  actionPlan: RuntimeActionPlan | null,
  actionId: string
): string | null {
  return actionPlan?.actions.find((action) => action.id === actionId)?.type ?? null;
}

function normalizeActionDiff(input: {
  actionId: string;
  baseline: RuntimeTraceActionViewV1 | undefined;
  candidate: RuntimeTraceActionViewV1 | undefined;
  baselinePlan: RuntimeActionPlan | null;
  candidatePlan: RuntimeActionPlan | null;
}): RuntimeActionDiffV1 {
  const baselineActionType =
    input.baseline?.actionType ?? getActionTypeFromPlan(input.baselinePlan, input.actionId);
  const candidateActionType =
    input.candidate?.actionType ?? getActionTypeFromPlan(input.candidatePlan, input.actionId);
  const baselineStatus = input.baseline?.latestStatus ?? null;
  const candidateStatus = input.candidate?.latestStatus ?? null;
  const baselineReason = input.baseline?.latestReason ?? null;
  const candidateReason = input.candidate?.latestReason ?? null;

  return {
    actionId: input.actionId,
    baselineActionType,
    candidateActionType,
    baselineStatus,
    candidateStatus,
    baselineReason,
    candidateReason,
    changed:
      baselineActionType !== candidateActionType ||
      baselineStatus !== candidateStatus ||
      baselineReason !== candidateReason,
  };
}

function readSimulationSnapshot(
  input: RuntimeNodeHandlerInputV1["action"]["metadata"]
): {
  provider?: string;
  summary?: string;
  preview?: Record<string, unknown>;
} | null {
  const simulation = input?.simulation;
  if (!simulation || typeof simulation !== "object") {
    return null;
  }

  const candidate = simulation as Record<string, unknown>;
  return {
    provider: typeof candidate.provider === "string" ? candidate.provider : undefined,
    summary: typeof candidate.summary === "string" ? candidate.summary : undefined,
    preview:
      candidate.preview && typeof candidate.preview === "object" && !Array.isArray(candidate.preview)
        ? (candidate.preview as Record<string, unknown>)
        : undefined,
  };
}

export function buildRuntimeTraceTimeline(
  trace: RuntimeRunTraceViewV1
): RuntimeTraceTimelineEntryV1[] {
  return trace.events
    .map(buildTimelineEntry)
    .sort((left, right) => left.at.localeCompare(right.at));
}

export function buildRuntimeTraceViewer(
  trace: RuntimeRunTraceViewV1
): RuntimeTraceViewerV1 {
  const actionIds = getActionIdsFromTrace(trace);
  const actions = actionIds.map((actionId) => getLatestActionState(trace, actionId));

  return {
    runtimeRunId: trace.runtimeRunId,
    requestId: trace.requestId,
    traceId: trace.traceId,
    status: trace.status,
    startedAt: trace.startedAt,
    finishedAt: trace.finishedAt ?? null,
    timeline: buildRuntimeTraceTimeline(trace),
    actions,
  };
}

export function buildRuntimeRunDiff(input: {
  baseline: RuntimeReplaySourceV1;
  candidate: RuntimeReplaySourceV1;
}): RuntimeRunDiffV1 {
  const baselineViewer = buildRuntimeTraceViewer(input.baseline.trace);
  const candidateViewer = buildRuntimeTraceViewer(input.candidate.trace);
  const actionIds = [
    ...new Set([
      ...baselineViewer.actions.map((action) => action.actionId),
      ...candidateViewer.actions.map((action) => action.actionId),
      ...(input.baseline.actionPlan?.actions.map((action) => action.id) ?? []),
      ...(input.candidate.actionPlan?.actions.map((action) => action.id) ?? []),
    ]),
  ];
  const actions = actionIds.map((actionId) =>
    normalizeActionDiff({
      actionId,
      baseline: baselineViewer.actions.find((action) => action.actionId === actionId),
      candidate: candidateViewer.actions.find((action) => action.actionId === actionId),
      baselinePlan: input.baseline.actionPlan,
      candidatePlan: input.candidate.actionPlan,
    })
  );
  const actionPlanChanged =
    JSON.stringify(input.baseline.actionPlan ?? null) !==
    JSON.stringify(input.candidate.actionPlan ?? null);
  const checkpointChanged =
    (input.baseline.checkpointNode ?? null) !== (input.candidate.checkpointNode ?? null);
  const statusChanged = input.baseline.status !== input.candidate.status;

  return {
    baselineRuntimeRunId: input.baseline.runtimeRunId,
    candidateRuntimeRunId: input.candidate.runtimeRunId,
    changed:
      actionPlanChanged ||
      checkpointChanged ||
      statusChanged ||
      actions.some((action) => action.changed),
    statusChanged,
    actionPlanChanged,
    checkpointChanged,
    eventCountDelta: input.candidate.trace.events.length - input.baseline.trace.events.length,
    actions,
  };
}

function buildReplayExecuteNode(input: {
  baseNodes: RuntimeNodeRegistryV1;
  mode: RuntimeReplayModeV1;
  sourceRuntimeRunId: string;
}): RuntimeNodeRegistryV1["execute"] {
  return async (handlerInput) => {
    const simulation = readSimulationSnapshot(handlerInput.action.metadata);
    if (!simulation) {
      const fallbackSimulation = await input.baseNodes.simulate(handlerInput);
      if (fallbackSimulation.status !== "success") {
        return fallbackSimulation;
      }
    }

    const resolvedSimulation =
      readSimulationSnapshot(handlerInput.action.metadata) ??
      readSimulationSnapshot(
        (await input.baseNodes.simulate(handlerInput)).actionPatch?.metadata as
          | Record<string, unknown>
          | undefined
      );

    const preview = resolvedSimulation?.preview ?? {};

    return {
      status: "success",
      reason:
        input.mode === "dry_run"
          ? "dry_run_simulated_without_side_effects"
          : "runtime_replay_simulated_without_side_effects",
      provider: resolvedSimulation?.provider,
      output: {
        ...preview,
        replayMode: input.mode,
        sourceRuntimeRunId: input.sourceRuntimeRunId,
        sideEffectsPrevented: true,
      },
      actionPatch: {
        metadata: {
          ...(handlerInput.action.metadata ?? {}),
          replay: {
            mode: input.mode,
            sourceRuntimeRunId: input.sourceRuntimeRunId,
            replayedAt: new Date().toISOString(),
            sideEffectsPrevented: true,
          },
        },
      },
      contextPatch: {
        messageMetadata: {
          ...handlerInput.ctx.messageMetadata,
          runtime_replay: {
            mode: input.mode,
            sourceRuntimeRunId: input.sourceRuntimeRunId,
            sideEffectsPrevented: true,
          },
        },
      },
      executionOutcome: {
        outcome: "skipped",
        reason: "replay_no_side_effects",
      },
    };
  };
}

export async function replayRuntimeRun(input: {
  source: RuntimeReplaySourceV1;
  request: ReplayRequestV1;
  ctx?: Partial<ExecutionContextV1>;
  nodes: RuntimeNodeRegistryV1;
  allowLlmRepair?: (payload: {
    ctx: ExecutionContextV1;
    action: RuntimeActionPlan["actions"][number];
    node: RuntimeGraphNodeId;
    reason?: string;
  }) => boolean;
  now?: () => Date;
}): Promise<RuntimeReplayResultV1> {
  if (!input.source.actionPlan) {
    throw new Error("runtime_replay_missing_action_plan");
  }

  const replayContext: ExecutionContextV1 = {
    requestId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    organizationId: input.source.organizationId,
    agentId: input.source.agentId,
    conversationId: input.source.conversationId ?? `runtime-replay:${input.source.runtimeRunId}`,
    surface: input.source.surface ?? "worker",
    channel: input.source.channel ?? "api",
    userId: input.source.userId ?? undefined,
    messageId: input.source.messageId ?? undefined,
    conversationMetadata: {},
    messageMetadata: {
      runtime_replay_source: {
        runtimeRunId: input.source.runtimeRunId,
        status: input.source.status,
      },
    },
    budget: {
      plannerCallsMax: 0,
      plannerCallsUsed: 0,
      llmRepairCallsMaxPerAction: 0,
      llmRepairCallsMaxPerRequest: 0,
      syncRetriesMaxPerAction: 3,
      maxNodeVisitsPerAction: 12,
      maxRetriesPerNode: 3,
      maxActionsPerPlan: 5,
      repeatedErrorFingerprintLimit: 2,
      destructiveActionsMaxPerRequest: 0,
      destructiveActionsUsedInRequest: 0,
    },
    ...(input.ctx ?? {}),
  };

  const replayNodes: RuntimeNodeRegistryV1 = {
    ...input.nodes,
    execute: buildReplayExecuteNode({
      baseNodes: input.nodes,
      mode: input.request.mode,
      sourceRuntimeRunId: input.source.runtimeRunId,
    }),
  };

  const result = await runExecutionGraph({
    ctx: replayContext,
    actionPlan: input.source.actionPlan,
    nodes: replayNodes,
    allowLlmRepair: input.allowLlmRepair,
    resumeFromCheckpoint: input.request.resumeFromCheckpoint ?? null,
    now: input.now,
  });

  return {
    sourceRuntimeRunId: input.source.runtimeRunId,
    replayRequest: input.request,
    outcome: result.outcome,
    actions: result.actions,
    trace: result.trace,
    context: result.context,
  };
}

export function inferReplaySourceFromTrace(input: {
  run: RuntimeOperationsRunRecordV1 & {
    organizationId: string;
    agentId: string;
    conversationId: string | null;
    currentActionIndex: number;
    checkpointNode?: string | null;
    actionPlan: RuntimeActionPlan | null;
  };
  trace: RuntimeRunTraceViewV1;
}): RuntimeReplaySourceV1 {
  const firstPayload = input.trace.events.find((event) => event.payload)?.payload;

  return {
    runtimeRunId: input.run.id,
    organizationId: input.run.organizationId,
    agentId: input.run.agentId,
    conversationId: input.run.conversationId,
    requestId: input.run.requestId,
    traceId: input.run.traceId,
    status: input.run.status,
    startedAt: input.run.startedAt,
    finishedAt: input.run.finishedAt ?? null,
    currentActionIndex: input.run.currentActionIndex,
    checkpointNode: input.run.checkpointNode ?? null,
    actionPlan: input.run.actionPlan,
    trace: input.trace,
    surface: (getPayloadString(firstPayload, "runtime_surface") as ExecutionContextV1["surface"] | null) ?? null,
    channel: (getPayloadString(firstPayload, "runtime_channel") as ExecutionContextV1["channel"] | null) ?? null,
    userId: getPayloadString(firstPayload, "actor_user_id"),
    messageId: getPayloadString(firstPayload, "trigger_message_id"),
  };
}

export function buildManualRepairResult(input: {
  runtimeRunId: string;
  checkpointNode: RuntimeGraphNodeId;
  workflowRunId: string;
  workflowStepId: string;
  resumeReason: "resume_after_approval" | "resume_after_retry_delay" | "resume_after_user_input" | "resume_scheduled_trigger" | "resume_post_side_effect";
  approvalItemId?: string;
}): RuntimeManualRepairResultV1 {
  return {
    runtimeRunId: input.runtimeRunId,
    enqueued: true,
    checkpointNode: input.checkpointNode,
    resumeReason: input.resumeReason,
    workflowRunId: input.workflowRunId,
    workflowStepId: input.workflowStepId,
    ...(input.approvalItemId ? { approvalItemId: input.approvalItemId } : {}),
  };
}

export function readCheckpointFromRuntimeEvents(
  events: RuntimeOperationsEventRecordV1[]
): ExecutionCheckpointV1 | null {
  const checkpointPayload = [...events]
    .reverse()
    .map((event) => event.payload?.runtime_checkpoint)
    .find((value) => value && typeof value === "object" && !Array.isArray(value));

  return checkpointPayload ? (checkpointPayload as ExecutionCheckpointV1) : null;
}
