import assert from "node:assert/strict";

import {
  buildRuntimeEventOperationalPayload,
  buildRuntimeOperationsSnapshot,
  buildRuntimeSideEffectTraces,
} from "./operations";
import type { ActionExecutionOutcomeV1, RuntimeActionPlan } from "./types";

function createActionOutcome(): ActionExecutionOutcomeV1 {
  return {
    actionId: "action-1",
    actionType: "send_email",
    status: "waiting_approval",
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {},
      metadata: {
        execution: {
          provider: "gmail",
          idempotencyKey: "idem-1",
          approvalItemId: "approval-1",
          workflowRunId: "workflow-1",
          workflowStepId: "step-1",
        },
      },
    },
    retries: 0,
    llmRepairCalls: 0,
    output: {
      approvalItemId: "approval-1",
      workflowRunId: "workflow-1",
      workflowStepId: "step-1",
    },
  };
}

function createPlan(): RuntimeActionPlan {
  return {
    version: 1,
    intent: "enviar seguimiento",
    actions: [
      {
        id: "action-1",
        type: "send_email",
        approvalMode: "required",
        params: {},
      },
    ],
    confidence: 0.92,
    missingFields: [],
  };
}

function runPayloadTest(): void {
  const payload = buildRuntimeEventOperationalPayload({
    ctx: {
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      surface: "chat_web",
      channel: "web",
      userId: "user-1",
      messageId: "msg-1",
    },
    actionPlan: createPlan(),
    actionOutcomes: [createActionOutcome()],
    event: {
      actionId: "action-1",
      actionType: "send_email",
      provider: "gmail",
      approvalItemId: "approval-1",
    },
  });

  assert.equal(payload.side_effect_kind, "write");
  assert.equal(payload.idempotency_key, "idem-1");
  assert.equal(payload.runtime_surface, "chat_web");
  assert.equal(payload.actor_user_id, "user-1");
}

function runSideEffectTraceTest(): void {
  const sideEffects = buildRuntimeSideEffectTraces({
    runs: [
      {
        id: "run-1",
        requestId: "req-1",
        traceId: "trace-1",
        status: "waiting_approval",
        startedAt: "2026-03-18T11:00:00.000Z",
        finishedAt: null,
        estimatedCostUsd: 0.12,
        llmCalls: 1,
        tokensInput: 120,
        tokensOutput: 60,
      },
    ],
    events: [
      {
        runtimeRunId: "run-1",
        createdAt: "2026-03-18T11:02:00.000Z",
        actionId: "action-1",
        actionType: "send_email",
        provider: "gmail",
        approvalItemId: "approval-1",
        workflowRunId: "workflow-1",
        workflowStepId: "step-1",
        status: "waiting_approval",
        payload: {
          side_effect_kind: "write",
          actor_user_id: "user-1",
          runtime_surface: "chat_web",
          runtime_channel: "web",
          conversation_id: "conv-1",
          trigger_message_id: "msg-1",
          idempotency_key: "idem-1",
        },
      },
    ],
  });

  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0]?.provider.idempotencyKey, "idem-1");
  assert.equal(sideEffects[0]?.approval.approvalItemId, "approval-1");
}

function runSnapshotAlertingTest(): void {
  const snapshot = buildRuntimeOperationsSnapshot({
    runs: [
      {
        id: "run-current-1",
        requestId: "req-current-1",
        traceId: "trace-current-1",
        status: "failed",
        startedAt: "2026-03-18T10:30:00.000Z",
        finishedAt: "2026-03-18T10:31:00.000Z",
        estimatedCostUsd: 6,
        llmCalls: 1,
        tokensInput: 1000,
        tokensOutput: 2000,
      },
      {
        id: "run-current-2",
        requestId: "req-current-2",
        traceId: "trace-current-2",
        status: "blocked",
        startedAt: "2026-03-18T10:40:00.000Z",
        finishedAt: "2026-03-18T10:41:00.000Z",
        estimatedCostUsd: 4,
        llmCalls: 1,
        tokensInput: 900,
        tokensOutput: 1800,
      },
      {
        id: "run-current-3",
        requestId: "req-current-3",
        traceId: "trace-current-3",
        status: "blocked",
        startedAt: "2026-03-18T10:50:00.000Z",
        finishedAt: "2026-03-18T10:52:00.000Z",
        estimatedCostUsd: 3,
        llmCalls: 1,
        tokensInput: 700,
        tokensOutput: 1200,
      },
      {
        id: "run-previous-1",
        requestId: "req-previous-1",
        traceId: "trace-previous-1",
        status: "success",
        startedAt: "2026-03-18T09:10:00.000Z",
        finishedAt: "2026-03-18T09:11:00.000Z",
        estimatedCostUsd: 2,
        llmCalls: 1,
        tokensInput: 300,
        tokensOutput: 500,
      },
    ],
    events: [
      {
        runtimeRunId: "run-current-1",
        createdAt: "2026-03-18T10:30:05.000Z",
        node: "execute",
        status: "failed",
        reason: "provider_timeout",
        provider: "gmail",
        payload: {
          action_type: "send_email",
          side_effect_kind: "write",
        },
      },
      {
        runtimeRunId: "run-current-2",
        createdAt: "2026-03-18T10:40:05.000Z",
        node: "execute",
        status: "failed",
        reason: "circuit_open",
        provider: "gmail",
        payload: {
          action_type: "send_email",
          side_effect_kind: "write",
        },
      },
      {
        runtimeRunId: "run-current-3",
        createdAt: "2026-03-18T10:50:05.000Z",
        node: "execute",
        status: "failed",
        reason: "provider_timeout",
        provider: "gmail",
        payload: {
          action_type: "send_email",
          side_effect_kind: "write",
        },
      },
      {
        runtimeRunId: "run-current-3",
        createdAt: "2026-03-18T10:50:15.000Z",
        node: "execute",
        status: "retry",
        provider: "gmail",
        payload: {
          action_type: "send_email",
          side_effect_kind: "write",
        },
      },
    ],
    approvalBacklog: {
      pendingCount: 12,
      oldestPendingCreatedAt: "2026-03-18T09:45:00.000Z",
    },
    runtimeQueueBacklog: {
      pendingCount: 15,
      processingCount: 8,
      failedCount: 2,
      oldestPendingCreatedAt: "2026-03-18T10:10:00.000Z",
    },
    windowHours: 1,
    now: () => new Date("2026-03-18T11:00:00.000Z"),
  });

  assert.equal(snapshot.dashboards.throughputRuns.current, 3);
  assert.equal(snapshot.dashboards.retries.current, 1);
  assert.ok(snapshot.alerts.some((alert) => alert.code === "node_error_rate_high"));
  assert.ok(snapshot.alerts.some((alert) => alert.code === "approval_backlog_high"));
  assert.ok(snapshot.alerts.some((alert) => alert.code === "runtime_queue_backlog_high"));
  assert.ok(snapshot.alerts.some((alert) => alert.code === "provider_outage"));
  assert.ok(snapshot.alerts.some((alert) => alert.code === "llm_cost_daily_anomaly"));
}

function main(): void {
  runPayloadTest();
  runSideEffectTraceTest();
  runSnapshotAlertingTest();
  console.log("runtime operations checks passed");
}

main();
