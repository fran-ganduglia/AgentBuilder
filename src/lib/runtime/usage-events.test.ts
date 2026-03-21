import assert from "node:assert/strict";

import { buildRuntimeUsageEvents } from "./usage-events";
import type { ActionExecutionOutcomeV1, RuntimeActionPlan, RuntimeEventV1 } from "./types";

function createPlan(): RuntimeActionPlan {
  return {
    version: 1,
    intent: "buscar, resumir y proponer draft",
    actions: [
      {
        id: "action-1",
        type: "summarize_thread",
        approvalMode: "auto",
        params: {},
      },
      {
        id: "action-2",
        type: "send_email",
        approvalMode: "required",
        params: {},
      },
    ],
    confidence: 0.91,
    missingFields: [],
  };
}

function createOutcomes(): ActionExecutionOutcomeV1[] {
  return [
    {
      actionId: "action-1",
      actionType: "summarize_thread",
      status: "success",
      action: {
        id: "action-1",
        type: "summarize_thread",
        approvalMode: "auto",
        params: {},
      },
      retries: 0,
      llmRepairCalls: 0,
      output: {
        summary: "Resumen listo",
      },
    },
    {
      actionId: "action-2",
      actionType: "send_email",
      status: "waiting_approval",
      action: {
        id: "action-2",
        type: "send_email",
        approvalMode: "required",
        params: {},
      },
      retries: 0,
      llmRepairCalls: 0,
      output: {
        approvalItemId: "approval-1",
        workflowRunId: "workflow-1",
        workflowStepId: "step-1",
      },
    },
  ];
}

function createTraceEvents(): RuntimeEventV1[] {
  return [
    {
      type: "runtime.node.completed",
      requestId: "req-1",
      traceId: "trace-1",
      actionId: "action-1",
      actionType: "summarize_thread",
      node: "execute",
      status: "success",
      provider: "gmail",
      providerRequestId: "provider-call-1",
    },
    {
      type: "runtime.node.completed",
      requestId: "req-1",
      traceId: "trace-1",
      actionId: "action-1",
      actionType: "summarize_thread",
      node: "llm_repair",
      status: "success",
      provider: "openai",
      tokensInput: 80,
      tokensOutput: 20,
    },
  ];
}

function runUsageEventBuilderTest(): void {
  const usageEvents = buildRuntimeUsageEvents({
    ctx: {
      organizationId: "org-1",
      agentId: "agent-1",
      surface: "chat_web",
    },
    runtimeRunId: "run-1",
    actionPlan: createPlan(),
    actionOutcomes: createOutcomes(),
    traceEvents: createTraceEvents(),
    plannerUsage: {
      model: "gpt-4o-mini",
      provider: "openai",
      tokensInput: 100,
      tokensOutput: 40,
    },
    postprocessUsage: {
      actionId: "action-1",
      model: "gpt-4o",
      provider: "openai",
      tokensInput: 120,
      tokensOutput: 60,
    },
    occurredAt: "2026-03-18T12:00:00.000Z",
  });

  assert.ok(usageEvents.some((event) => event.usageKind === "runtime_run"));
  assert.ok(usageEvents.some((event) => event.usageKind === "llm_planner_call"));
  assert.ok(usageEvents.some((event) => event.usageKind === "llm_postprocess_call"));
  assert.ok(usageEvents.some((event) => event.usageKind === "llm_repair_call"));
  assert.ok(
    usageEvents.some(
      (event) =>
        event.usageKind === "action_executed" &&
        event.actionType === "summarize_thread" &&
        event.estimatedCostUsd > 0
    )
  );
  assert.ok(
    usageEvents.some(
      (event) =>
        event.usageKind === "approval_enqueued" &&
        event.actionType === "send_email" &&
        event.approvalItemId === "approval-1"
    )
  );
  assert.ok(
    usageEvents.some(
      (event) =>
        event.usageKind === "provider_call" &&
        event.providerRequestId === "provider-call-1"
    )
  );

  const runtimeRun = usageEvents.find((event) => event.usageKind === "runtime_run");
  assert.equal(runtimeRun?.tokensInput, 300);
  assert.equal(runtimeRun?.tokensOutput, 120);
  assert.ok((runtimeRun?.estimatedCostUsd ?? 0) > 0);
}

function main(): void {
  runUsageEventBuilderTest();
  console.log("runtime usage events checks passed");
}

main();
