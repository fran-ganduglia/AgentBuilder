import assert from "node:assert/strict";

import {
  buildChatOperationalMetrics,
  buildWorkflowOperationalMetrics,
  createOperationalLlmUsage,
  summarizeWorkflowRunOperationalMetrics,
} from "@/lib/engine/observability";

async function runChatClassificationTest(): Promise<void> {
  const metrics = buildChatOperationalMetrics({
    plannedActions: [
      { provider: "gmail", type: "search_threads", params: {} },
      { provider: "gmail", type: "read_thread", params: {} },
    ],
    executedActions: [
      { provider: "gmail", type: "search_threads", params: {} },
      { provider: "gmail", type: "read_thread", params: {} },
    ],
    executionStatus: "executed",
    plannerUsage: createOperationalLlmUsage({
      calls: 1,
      tokensInput: 120,
      tokensOutput: 40,
    }),
    fallbackUsage: createOperationalLlmUsage({
      calls: 1,
      tokensInput: 30,
      tokensOutput: 10,
    }),
    synthesisUsage: createOperationalLlmUsage({
      calls: 1,
      tokensInput: 60,
      tokensOutput: 20,
    }),
    clarifications: 0,
    approvalsEnqueued: 0,
  });

  assert.equal(metrics.actionClass, "multi_step_read");
  assert.equal(metrics.plannerCalls, 1);
  assert.equal(metrics.fallbackCalls, 1);
  assert.equal(metrics.actionsExecuted, 2);
  assert.equal(metrics.llmUsage.total.tokensInput, 210);
  assert.equal(metrics.llmUsage.total.tokensOutput, 70);
  assert.equal(metrics.actionUsage.length, 2);
  assert.equal(metrics.actionUsage[0]?.tokensInputAllocated, 105);
  assert.equal(metrics.actionUsage[1]?.tokensOutputAllocated, 35);
}

async function runWorkflowSummaryTest(): Promise<void> {
  const stepMetrics = buildWorkflowOperationalMetrics({
    provider: "gmail",
    action: "send_email",
  });
  const summary = summarizeWorkflowRunOperationalMetrics({
    current: null,
    stepMetrics,
    workflowStepId: "step-1",
    provider: "gmail",
    action: "send_email",
    status: "completed",
  });

  assert.equal(summary.actionClass, "workflow_async");
  assert.equal(summary.actionsExecuted, 1);
  assert.equal(summary.stepsCompleted, 1);
  assert.equal(summary.stepsFailed, 0);
  assert.equal(summary.lastStep?.workflowStepId, "step-1");
}

async function main(): Promise<void> {
  await runChatClassificationTest();
  await runWorkflowSummaryTest();
  console.log("engine observability checks passed");
}

void main();
