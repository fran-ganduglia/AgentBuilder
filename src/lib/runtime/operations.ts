import { getActionDefinitionV1 } from "./action-catalog";
import type {
  ActionExecutionOutcomeV1,
  ExecutionContextV1,
  RuntimeActionPlan,
} from "./types";

export type RuntimeOperationsRunRecordV1 = {
  id: string;
  requestId: string;
  traceId: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  estimatedCostUsd: number;
  llmCalls: number;
  tokensInput: number;
  tokensOutput: number;
};

export type RuntimeOperationsEventRecordV1 = {
  runtimeRunId: string;
  createdAt: string;
  actionId?: string | null;
  actionType?: string | null;
  node?: string | null;
  status?: string | null;
  reason?: string | null;
  provider?: string | null;
  providerRequestId?: string | null;
  approvalItemId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  payload?: Record<string, unknown> | null;
};

export type RuntimeApprovalBacklogSnapshotV1 = {
  pendingCount: number;
  oldestPendingCreatedAt?: string | null;
};

export type RuntimeQueueBacklogSnapshotV1 = {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  oldestPendingCreatedAt?: string | null;
};

export type RuntimeProviderHealthSnapshotV1 = {
  provider: string;
  status: "healthy" | "degraded" | "unhealthy" | "disabled" | "circuit_open";
  reason?: string | null;
  checkedAt: string;
};

export type RuntimeOperationsThresholdsV1 = {
  nodeErrorRateHigh: number;
  minimumNodeSamples: number;
  blockedGrowthMultiplier: number;
  needsUserGrowthMultiplier: number;
  approvalBacklogHigh: number;
  approvalBacklogOldestMinutes: number;
  runtimeQueueBacklogHigh: number;
  runtimeQueueOldestMinutes: number;
  llmCostDailyAnomalyMultiplier: number;
  llmCostDailyFloorUsd: number;
  providerFailureOutageCount: number;
};

export type RuntimeOperationsAlertV1 = {
  code:
    | "node_error_rate_high"
    | "blocked_growth_abnormal"
    | "needs_user_growth_abnormal"
    | "approval_backlog_high"
    | "runtime_queue_backlog_high"
    | "provider_outage"
    | "llm_cost_daily_anomaly";
  severity: "warning" | "critical";
  summary: string;
  runbook:
    | "provider_outage"
    | "retry_storm"
    | "approval_backlog"
    | "budget_exhaustion"
    | "stuck_runtime_runs"
    | "compensation_failed";
  metadata?: Record<string, string | number | boolean | null>;
};

export type RuntimeDashboardMetricDeltaV1 = {
  current: number;
  previous: number;
  delta: number;
};

export type RuntimeProviderUsageSnapshotV1 = {
  provider: string;
  totalEvents: number;
  providerCalls: number;
  approvalEnqueues: number;
  sideEffectWrites: number;
  llmTokensInput: number;
  llmTokensOutput: number;
  estimatedLlmCostUsd: number;
};

export type RuntimeSideEffectTraceV1 = {
  runtimeRunId: string;
  requestId: string;
  traceId: string;
  actionId: string;
  actionType: string;
  sideEffectKind: string;
  actor: {
    userId?: string | null;
  };
  trigger: {
    surface?: string | null;
    channel?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
  };
  approval: {
    approvalItemId?: string | null;
  };
  workflow: {
    workflowRunId?: string | null;
    workflowStepId?: string | null;
  };
  provider: {
    provider?: string | null;
    providerRequestId?: string | null;
    idempotencyKey?: string | null;
  };
  status?: string | null;
  lastEventAt: string;
};

export type RuntimeRunTraceViewV1 = {
  runtimeRunId: string;
  requestId: string;
  traceId: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  events: RuntimeOperationsEventRecordV1[];
  sideEffects: RuntimeSideEffectTraceV1[];
};

export type RuntimeOperationsSnapshotV1 = {
  windowHours: number;
  dashboards: {
    throughputRuns: RuntimeDashboardMetricDeltaV1;
    errorRate: RuntimeDashboardMetricDeltaV1;
    avgLatencyMs: RuntimeDashboardMetricDeltaV1;
    retries: RuntimeDashboardMetricDeltaV1;
    approvalBacklog: {
      pendingCount: number;
      oldestPendingMinutes: number | null;
    };
    workerBacklog: {
      pendingCount: number;
      processingCount: number;
      failedCount: number;
      oldestPendingMinutes: number | null;
    };
    llmCostUsd: RuntimeDashboardMetricDeltaV1;
    providerUsage: RuntimeProviderUsageSnapshotV1[];
  };
  alerts: RuntimeOperationsAlertV1[];
  traces: {
    runs: RuntimeRunTraceViewV1[];
    sideEffects: RuntimeSideEffectTraceV1[];
  };
};

const DEFAULT_THRESHOLDS: RuntimeOperationsThresholdsV1 = {
  nodeErrorRateHigh: 0.2,
  minimumNodeSamples: 3,
  blockedGrowthMultiplier: 2,
  needsUserGrowthMultiplier: 2,
  approvalBacklogHigh: 10,
  approvalBacklogOldestMinutes: 30,
  runtimeQueueBacklogHigh: 20,
  runtimeQueueOldestMinutes: 15,
  llmCostDailyAnomalyMultiplier: 1.5,
  llmCostDailyFloorUsd: 5,
  providerFailureOutageCount: 3,
};

const KNOWN_RUNTIME_ACTIONS = {
  search_email: true,
  summarize_thread: true,
  send_email: true,
  create_event: true,
  archive_thread: true,
  apply_label: true,
  reschedule_event: true,
  cancel_event: true,
  list_events: true,
  read_sheet_range: true,
  append_sheet_rows: true,
  update_sheet_range: true,
  search_records: true,
  create_lead: true,
  update_lead: true,
  create_task: true,
} as const;

function round(value: number): number {
  return Number(value.toFixed(4));
}

function minutesBetween(now: Date, value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 60_000));
}

function toDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCurrentWindow(dateValue: string, currentStart: Date, now: Date): boolean {
  const date = toDate(dateValue);
  if (!date) {
    return false;
  }

  return date >= currentStart && date <= now;
}

function isPreviousWindow(dateValue: string, previousStart: Date, currentStart: Date): boolean {
  const date = toDate(dateValue);
  if (!date) {
    return false;
  }

  return date >= previousStart && date < currentStart;
}

function buildDelta(current: number, previous: number): RuntimeDashboardMetricDeltaV1 {
  return {
    current: round(current),
    previous: round(previous),
    delta: round(current - previous),
  };
}

function estimateLlmCostUsd(tokensInput: number, tokensOutput: number): number {
  return round((tokensInput * 0.003 + tokensOutput * 0.006) / 1000);
}

function getPayloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPayloadNumber(
  payload: Record<string, unknown> | null | undefined,
  key: string
): number {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getEventTimestamp(event: RuntimeOperationsEventRecordV1): string {
  return event.createdAt;
}

function buildRunTraceViews(
  runs: RuntimeOperationsRunRecordV1[],
  events: RuntimeOperationsEventRecordV1[]
): RuntimeRunTraceViewV1[] {
  const eventsByRunId = new Map<string, RuntimeOperationsEventRecordV1[]>();
  for (const event of events) {
    const current = eventsByRunId.get(event.runtimeRunId) ?? [];
    current.push(event);
    eventsByRunId.set(event.runtimeRunId, current);
  }

  return runs.map((run) => {
    const runEvents = [...(eventsByRunId.get(run.id) ?? [])].sort((left, right) =>
      getEventTimestamp(left).localeCompare(getEventTimestamp(right))
    );

    return {
      runtimeRunId: run.id,
      requestId: run.requestId,
      traceId: run.traceId,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      events: runEvents,
      sideEffects: buildRuntimeSideEffectTraces({
        runs: [run],
        events: runEvents,
      }),
    };
  });
}

export function buildRuntimeSideEffectTraces(input: {
  runs: RuntimeOperationsRunRecordV1[];
  events: RuntimeOperationsEventRecordV1[];
}): RuntimeSideEffectTraceV1[] {
  const runById = new Map(input.runs.map((run) => [run.id, run]));
  const traces = new Map<string, RuntimeSideEffectTraceV1>();

  for (const event of input.events) {
    const actionId = event.actionId ?? getPayloadString(event.payload, "action_id");
    const actionType = event.actionType ?? getPayloadString(event.payload, "action_type");
    const sideEffectKind = getPayloadString(event.payload, "side_effect_kind");
    const run = runById.get(event.runtimeRunId);

    if (!run || !actionId || !actionType || !sideEffectKind || sideEffectKind === "read") {
      continue;
    }

    const key = `${event.runtimeRunId}:${actionId}`;
    const current = traces.get(key);
    const next: RuntimeSideEffectTraceV1 = {
      runtimeRunId: event.runtimeRunId,
      requestId: run.requestId,
      traceId: run.traceId,
      actionId,
      actionType,
      sideEffectKind,
      actor: {
        userId: getPayloadString(event.payload, "actor_user_id"),
      },
      trigger: {
        surface: getPayloadString(event.payload, "runtime_surface"),
        channel: getPayloadString(event.payload, "runtime_channel"),
        conversationId: getPayloadString(event.payload, "conversation_id"),
        messageId: getPayloadString(event.payload, "trigger_message_id"),
      },
      approval: {
        approvalItemId:
          event.approvalItemId ?? getPayloadString(event.payload, "approval_item_id"),
      },
      workflow: {
        workflowRunId:
          event.workflowRunId ?? getPayloadString(event.payload, "workflow_run_id"),
        workflowStepId:
          event.workflowStepId ?? getPayloadString(event.payload, "workflow_step_id"),
      },
      provider: {
        provider: event.provider ?? getPayloadString(event.payload, "provider"),
        providerRequestId:
          event.providerRequestId ?? getPayloadString(event.payload, "provider_request_id"),
        idempotencyKey: getPayloadString(event.payload, "idempotency_key"),
      },
      status: event.status ?? null,
      lastEventAt: event.createdAt,
    };

    if (!current || current.lastEventAt <= next.lastEventAt) {
      traces.set(key, next);
    }
  }

  return [...traces.values()].sort((left, right) => left.lastEventAt.localeCompare(right.lastEventAt));
}

export function buildRuntimeEventOperationalPayload(input: {
  ctx: Pick<
    ExecutionContextV1,
    "organizationId" | "agentId" | "conversationId" | "surface" | "channel" | "userId" | "messageId"
  >;
  actionPlan: RuntimeActionPlan;
  actionOutcomes: ActionExecutionOutcomeV1[];
  event: {
    actionId?: string;
    actionType?: string;
    provider?: string;
    providerRequestId?: string;
    approvalItemId?: string;
    workflowRunId?: string;
    workflowStepId?: string;
  };
}): Record<string, unknown> {
  const outcome = input.event.actionId
    ? input.actionOutcomes.find((candidate) => candidate.actionId === input.event.actionId)
    : undefined;
  const actionType = outcome?.actionType ?? input.event.actionType;
  const executionMetadata =
    outcome?.action.metadata &&
    typeof outcome.action.metadata === "object" &&
    outcome.action.metadata !== null &&
    typeof (outcome.action.metadata as Record<string, unknown>).execution === "object" &&
    (outcome.action.metadata as Record<string, unknown>).execution !== null
      ? ((outcome.action.metadata as Record<string, unknown>).execution as Record<string, unknown>)
      : null;

  return {
    organization_id: input.ctx.organizationId,
    agent_id: input.ctx.agentId,
    conversation_id: input.ctx.conversationId,
    runtime_surface: input.ctx.surface ?? null,
    runtime_channel: input.ctx.channel ?? null,
    actor_user_id: input.ctx.userId ?? null,
    trigger_message_id: input.ctx.messageId ?? null,
    action_plan_version: input.actionPlan.version,
    action_plan_intent: input.actionPlan.intent,
    action_approval_mode: outcome?.action.approvalMode ?? null,
    action_type: actionType ?? null,
    provider: input.event.provider ?? getPayloadString(executionMetadata, "provider") ?? null,
    side_effect_kind:
      actionType && isKnownActionType(actionType)
        ? getActionDefinitionV1(actionType).sideEffectKind
        : null,
    provider_request_id:
      input.event.providerRequestId ??
      getPayloadString(executionMetadata, "providerRequestId"),
    approval_item_id:
      input.event.approvalItemId ?? getPayloadString(executionMetadata, "approvalItemId"),
    workflow_run_id:
      input.event.workflowRunId ?? getPayloadString(executionMetadata, "workflowRunId"),
    workflow_step_id:
      input.event.workflowStepId ?? getPayloadString(executionMetadata, "workflowStepId"),
    idempotency_key: getPayloadString(executionMetadata, "idempotencyKey"),
  };
}

function isKnownActionType(actionType: string): actionType is keyof typeof KNOWN_RUNTIME_ACTIONS {
  return actionType in KNOWN_RUNTIME_ACTIONS;
}

function buildProviderUsage(
  events: RuntimeOperationsEventRecordV1[],
  sideEffects: RuntimeSideEffectTraceV1[]
): RuntimeProviderUsageSnapshotV1[] {
  const providerUsage = new Map<string, RuntimeProviderUsageSnapshotV1>();

  function touch(provider: string): RuntimeProviderUsageSnapshotV1 {
    const current = providerUsage.get(provider);
    if (current) {
      return current;
    }

    const created: RuntimeProviderUsageSnapshotV1 = {
      provider,
      totalEvents: 0,
      providerCalls: 0,
      approvalEnqueues: 0,
      sideEffectWrites: 0,
      llmTokensInput: 0,
      llmTokensOutput: 0,
      estimatedLlmCostUsd: 0,
    };
    providerUsage.set(provider, created);
    return created;
  }

  const uniqueProviderCalls = new Set<string>();
  for (const event of events) {
    const provider = event.provider ?? getPayloadString(event.payload, "provider");
    if (!provider) {
      continue;
    }

    const item = touch(provider);
    item.totalEvents += 1;
    item.llmTokensInput += getPayloadNumber(event.payload, "tokens_input");
    item.llmTokensOutput += getPayloadNumber(event.payload, "tokens_output");
    if (event.approvalItemId || getPayloadString(event.payload, "approval_item_id")) {
      item.approvalEnqueues += 1;
    }

    const providerRequestId =
      event.providerRequestId ?? getPayloadString(event.payload, "provider_request_id");
    if (providerRequestId) {
      const key = `${provider}:${providerRequestId}`;
      if (!uniqueProviderCalls.has(key)) {
        uniqueProviderCalls.add(key);
        item.providerCalls += 1;
      }
    }
  }

  for (const sideEffect of sideEffects) {
    const provider = sideEffect.provider.provider;
    if (!provider) {
      continue;
    }

    touch(provider).sideEffectWrites += 1;
  }

  for (const item of providerUsage.values()) {
    item.estimatedLlmCostUsd = estimateLlmCostUsd(item.llmTokensInput, item.llmTokensOutput);
  }

  return [...providerUsage.values()].sort((left, right) => right.totalEvents - left.totalEvents);
}

export function buildRuntimeOperationsSnapshot(input: {
  runs: RuntimeOperationsRunRecordV1[];
  events: RuntimeOperationsEventRecordV1[];
  approvalBacklog: RuntimeApprovalBacklogSnapshotV1;
  runtimeQueueBacklog: RuntimeQueueBacklogSnapshotV1;
  adapterHealth?: RuntimeProviderHealthSnapshotV1[];
  windowHours?: number;
  thresholds?: Partial<RuntimeOperationsThresholdsV1>;
  now?: () => Date;
}): RuntimeOperationsSnapshotV1 {
  const now = input.now ?? (() => new Date());
  const threshold = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const currentNow = now();
  const windowHours = input.windowHours ?? 24;
  const currentStart = new Date(currentNow.getTime() - windowHours * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - windowHours * 60 * 60 * 1000);

  const currentRuns = input.runs.filter((run) => isCurrentWindow(run.startedAt, currentStart, currentNow));
  const previousRuns = input.runs.filter((run) =>
    isPreviousWindow(run.startedAt, previousStart, currentStart)
  );
  const currentEvents = input.events.filter((event) =>
    isCurrentWindow(event.createdAt, currentStart, currentNow)
  );
  const previousEvents = input.events.filter((event) =>
    isPreviousWindow(event.createdAt, previousStart, currentStart)
  );

  const currentLatencies = currentRuns
    .map((run) => {
      const startedAt = toDate(run.startedAt);
      const finishedAt = toDate(run.finishedAt ?? "");
      return startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null;
    })
    .filter((value): value is number => value !== null);
  const previousLatencies = previousRuns
    .map((run) => {
      const startedAt = toDate(run.startedAt);
      const finishedAt = toDate(run.finishedAt ?? "");
      return startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null;
    })
    .filter((value): value is number => value !== null);

  const currentErrorCount = currentRuns.filter((run) =>
    ["failed", "blocked", "manual_repair_required"].includes(run.status)
  ).length;
  const previousErrorCount = previousRuns.filter((run) =>
    ["failed", "blocked", "manual_repair_required"].includes(run.status)
  ).length;
  const currentRetryCount = currentEvents.filter((event) => event.status === "retry").length;
  const previousRetryCount = previousEvents.filter((event) => event.status === "retry").length;
  const currentLlmCost = currentRuns.reduce((sum, run) => sum + run.estimatedCostUsd, 0);
  const previousLlmCost = previousRuns.reduce((sum, run) => sum + run.estimatedCostUsd, 0);
  const currentBlockedCount = currentRuns.filter((run) => run.status === "blocked").length;
  const previousBlockedCount = previousRuns.filter((run) => run.status === "blocked").length;
  const currentNeedsUserCount = currentRuns.filter((run) => run.status === "needs_user").length;
  const previousNeedsUserCount = previousRuns.filter((run) => run.status === "needs_user").length;

  const traces = buildRunTraceViews(input.runs, input.events);
  const sideEffects = buildRuntimeSideEffectTraces({
    runs: input.runs,
    events: input.events,
  });
  const providerUsage = buildProviderUsage(currentEvents, sideEffects);
  const alerts: RuntimeOperationsAlertV1[] = [];

  const nodeStats = new Map<string, { total: number; failures: number }>();
  for (const event of currentEvents) {
    if (!event.node) {
      continue;
    }

    const stats = nodeStats.get(event.node) ?? { total: 0, failures: 0 };
    stats.total += 1;
    if (event.status === "failed" || event.status === "blocked") {
      stats.failures += 1;
    }
    nodeStats.set(event.node, stats);
  }

  for (const [node, stats] of nodeStats.entries()) {
    const errorRate = stats.total > 0 ? stats.failures / stats.total : 0;
    if (stats.total >= threshold.minimumNodeSamples && errorRate >= threshold.nodeErrorRateHigh) {
      alerts.push({
        code: "node_error_rate_high",
        severity: "critical",
        summary: `El nodo ${node} supera el error rate esperado.`,
        runbook: "retry_storm",
        metadata: {
          node,
          errorRate: round(errorRate),
          samples: stats.total,
        },
      });
    }
  }

  if (
    currentBlockedCount >= threshold.minimumNodeSamples &&
    currentBlockedCount > Math.max(previousBlockedCount, 0) * threshold.blockedGrowthMultiplier
  ) {
    alerts.push({
      code: "blocked_growth_abnormal",
      severity: "warning",
      summary: "Crecio anormalmente la cantidad de runtime runs bloqueados.",
      runbook: "stuck_runtime_runs",
      metadata: {
        currentBlockedCount,
        previousBlockedCount,
      },
    });
  }

  if (
    currentNeedsUserCount >= threshold.minimumNodeSamples &&
    currentNeedsUserCount > Math.max(previousNeedsUserCount, 0) * threshold.needsUserGrowthMultiplier
  ) {
    alerts.push({
      code: "needs_user_growth_abnormal",
      severity: "warning",
      summary: "Crecio anormalmente la cantidad de runtime runs en needs_user.",
      runbook: "stuck_runtime_runs",
      metadata: {
        currentNeedsUserCount,
        previousNeedsUserCount,
      },
    });
  }

  const approvalOldestMinutes = minutesBetween(
    currentNow,
    input.approvalBacklog.oldestPendingCreatedAt ?? null
  );
  if (
    input.approvalBacklog.pendingCount >= threshold.approvalBacklogHigh ||
    (approvalOldestMinutes !== null &&
      approvalOldestMinutes >= threshold.approvalBacklogOldestMinutes)
  ) {
    alerts.push({
      code: "approval_backlog_high",
      severity: "warning",
      summary: "El backlog de approvals del runtime requiere atencion operativa.",
      runbook: "approval_backlog",
      metadata: {
        pendingCount: input.approvalBacklog.pendingCount,
        oldestPendingMinutes: approvalOldestMinutes,
      },
    });
  }

  const queueOldestMinutes = minutesBetween(
    currentNow,
    input.runtimeQueueBacklog.oldestPendingCreatedAt ?? null
  );
  const totalQueueBacklog =
    input.runtimeQueueBacklog.pendingCount + input.runtimeQueueBacklog.processingCount;
  if (
    totalQueueBacklog >= threshold.runtimeQueueBacklogHigh ||
    (queueOldestMinutes !== null && queueOldestMinutes >= threshold.runtimeQueueOldestMinutes)
  ) {
    alerts.push({
      code: "runtime_queue_backlog_high",
      severity: "critical",
      summary: "El backlog de runtime queue crecio por encima del umbral operativo.",
      runbook: "stuck_runtime_runs",
      metadata: {
        pendingCount: input.runtimeQueueBacklog.pendingCount,
        processingCount: input.runtimeQueueBacklog.processingCount,
        failedCount: input.runtimeQueueBacklog.failedCount,
        oldestPendingMinutes: queueOldestMinutes,
      },
    });
  }

  const providerFailures = new Map<string, number>();
  for (const event of currentEvents) {
    const provider = event.provider ?? getPayloadString(event.payload, "provider");
    if (!provider) {
      continue;
    }

    if (
      event.status === "failed" ||
      event.reason === "circuit_open" ||
      getPayloadString(event.payload, "reason") === "circuit_open"
    ) {
      providerFailures.set(provider, (providerFailures.get(provider) ?? 0) + 1);
    }
  }

  for (const health of input.adapterHealth ?? []) {
    if (health.status === "circuit_open" || health.status === "unhealthy") {
      alerts.push({
        code: "provider_outage",
        severity: "critical",
        summary: `El provider ${health.provider} aparece degradado para el runtime.`,
        runbook: "provider_outage",
        metadata: {
          provider: health.provider,
          healthStatus: health.status,
        },
      });
    }
  }

  for (const [provider, failures] of providerFailures.entries()) {
    if (failures >= threshold.providerFailureOutageCount) {
      alerts.push({
        code: "provider_outage",
        severity: "critical",
        summary: `El provider ${provider} acumula fallas repetidas en la ventana operativa.`,
        runbook: "provider_outage",
        metadata: {
          provider,
          failures,
        },
      });
    }
  }

  const currentDailyCost = (currentLlmCost / windowHours) * 24;
  const previousDailyCost = (previousLlmCost / windowHours) * 24;
  if (
    currentDailyCost >= threshold.llmCostDailyFloorUsd &&
    currentDailyCost >
      Math.max(previousDailyCost, threshold.llmCostDailyFloorUsd / threshold.llmCostDailyAnomalyMultiplier) *
        threshold.llmCostDailyAnomalyMultiplier
  ) {
    alerts.push({
      code: "llm_cost_daily_anomaly",
      severity: "warning",
      summary: "El costo diario estimado de LLM subio por encima del baseline reciente.",
      runbook: "budget_exhaustion",
      metadata: {
        currentDailyCost: round(currentDailyCost),
        previousDailyCost: round(previousDailyCost),
      },
    });
  }

  return {
    windowHours,
    dashboards: {
      throughputRuns: buildDelta(currentRuns.length, previousRuns.length),
      errorRate: buildDelta(
        currentRuns.length > 0 ? currentErrorCount / currentRuns.length : 0,
        previousRuns.length > 0 ? previousErrorCount / previousRuns.length : 0
      ),
      avgLatencyMs: buildDelta(
        currentLatencies.length > 0
          ? currentLatencies.reduce((sum, value) => sum + value, 0) / currentLatencies.length
          : 0,
        previousLatencies.length > 0
          ? previousLatencies.reduce((sum, value) => sum + value, 0) / previousLatencies.length
          : 0
      ),
      retries: buildDelta(currentRetryCount, previousRetryCount),
      approvalBacklog: {
        pendingCount: input.approvalBacklog.pendingCount,
        oldestPendingMinutes: approvalOldestMinutes,
      },
      workerBacklog: {
        pendingCount: input.runtimeQueueBacklog.pendingCount,
        processingCount: input.runtimeQueueBacklog.processingCount,
        failedCount: input.runtimeQueueBacklog.failedCount,
        oldestPendingMinutes: queueOldestMinutes,
      },
      llmCostUsd: buildDelta(currentLlmCost, previousLlmCost),
      providerUsage,
    },
    alerts,
    traces: {
      runs: traces,
      sideEffects,
    },
  };
}
