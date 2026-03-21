import assert from "node:assert/strict";

import {
  appendRuntimeWorkflowTraceEvent,
  getRuntimeActionFromWorkflowPayload,
} from "./workflow-bridge";

function runRuntimeActionHydrationTest(): void {
  const action = getRuntimeActionFromWorkflowPayload({
    abstract_action: {
      id: "action-1",
      type: "archive_thread",
      approvalMode: "required",
      params: {
        threadRef: {
          kind: "reference",
          refType: "threadRef",
          value: "thread-123",
          label: "Demo thread",
        },
      },
      metadata: {
        source: "test",
      },
    },
  });

  assert.ok(action);
  assert.equal(action?.id, "action-1");
  assert.equal(action?.type, "archive_thread");
  assert.equal(action?.approvalMode, "required");
}

function runTraceAppendTest(): void {
  const first = appendRuntimeWorkflowTraceEvent({
    current: null,
    traceId: "trace-1",
    requestId: "req-1",
    actionId: "action-1",
    actionType: "archive_thread",
    provider: "gmail",
    workflowRunId: "run-1",
    workflowStepId: "step-1",
    event: {
      at: "2026-03-18T00:00:00.000Z",
      event: "approval_enqueued",
      status: "waiting_approval",
      provider: "gmail",
      workflowRunId: "run-1",
      workflowStepId: "step-1",
    },
  });

  const second = appendRuntimeWorkflowTraceEvent({
    current: first,
    event: {
      at: "2026-03-18T00:01:00.000Z",
      event: "async_execution_completed",
      status: "completed",
      provider: "gmail",
      providerRequestId: "provider-1",
      workflowRunId: "run-1",
      workflowStepId: "step-1",
    },
  });

  assert.equal(second.status, "completed");
  assert.equal(second.events.length, 2);
  assert.equal(second.events[0]?.event, "approval_enqueued");
  assert.equal(second.events[1]?.event, "async_execution_completed");
  assert.equal(second.provider, "gmail");
}

function main(): void {
  runRuntimeActionHydrationTest();
  runTraceAppendTest();
  console.log("runtime workflow bridge checks passed");
}

main();

export {};
