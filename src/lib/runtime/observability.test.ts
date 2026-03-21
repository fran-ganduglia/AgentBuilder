import assert from "node:assert/strict";

import { enrichRuntimeEvents, serializeRuntimeEvent } from "./observability";
import type { RuntimeEventV1 } from "./types";

function createEvents(): RuntimeEventV1[] {
  return [
    {
      type: "runtime.plan.started",
      requestId: "req-1",
      traceId: "trace-1",
    },
    {
      type: "runtime.node.completed",
      requestId: "req-1",
      traceId: "trace-1",
      actionId: "action-1",
      actionType: "summarize_thread",
      node: "postprocess",
      status: "success",
      latencyMs: 12,
    },
    {
      type: "runtime.plan.completed",
      requestId: "req-1",
      traceId: "trace-1",
    },
  ];
}

function runPlannerMetricsTest(): void {
  const events = enrichRuntimeEvents({
    events: createEvents(),
    plannerMetrics: {
      llmCalls: 1,
      tokensInput: 120,
      tokensOutput: 40,
      provider: "openai",
    },
  });

  const planCompleted = events[2];
  assert.equal(planCompleted?.llmCalls, 1);
  assert.equal(planCompleted?.tokensInput, 120);
  assert.equal(planCompleted?.tokensOutput, 40);
  assert.equal(planCompleted?.provider, "openai");
}

function runPostprocessMetricsTest(): void {
  const events = enrichRuntimeEvents({
    events: createEvents(),
    postprocessMetrics: {
      actionId: "action-1",
      llmCalls: 1,
      tokensInput: 300,
      tokensOutput: 90,
      provider: "openai",
    },
  });

  const postprocessCompleted = events[1];
  assert.equal(postprocessCompleted?.llmCalls, 1);
  assert.equal(postprocessCompleted?.tokensInput, 300);
  assert.equal(postprocessCompleted?.tokensOutput, 90);
  assert.equal(postprocessCompleted?.provider, "openai");
}

function runSerializationTest(): void {
  const payload = serializeRuntimeEvent({
    type: "runtime.action.approval_enqueued",
    requestId: "req-1",
    traceId: "trace-1",
    actionId: "action-1",
    actionType: "send_email",
    status: "completed",
    approvalItemId: "approval-1",
    workflowRunId: "workflow-1",
  });

  assert.deepEqual(payload, {
    request_id: "req-1",
    trace_id: "trace-1",
    action_id: "action-1",
    action_type: "send_email",
    node: null,
    status: "completed",
    latency_ms: null,
    llm_calls: null,
    tokens_input: null,
    tokens_output: null,
    provider: null,
    provider_request_id: null,
    approval_item_id: "approval-1",
    runtime_run_id: null,
    workflow_run_id: "workflow-1",
    workflow_step_id: null,
  });
}

function main(): void {
  runPlannerMetricsTest();
  runPostprocessMetricsTest();
  runSerializationTest();
  console.log("runtime observability checks passed");
}

main();
