import assert from "node:assert/strict";

import type { EventRow } from "@/lib/workers/event-queue";

import {
  buildWorkflowStepEventFromResumeToken,
  buildWorkflowStepResumeToken,
  readRuntimeQueueDispatchPayload,
} from "./runtime-queue-dispatcher";

async function runPayloadRoundtripTest(): Promise<void> {
  const token = buildWorkflowStepResumeToken({
    runtimeRunId: "runtime-run-1",
    workflowRunId: "workflow-run-1",
    workflowStepId: "workflow-step-1",
    checkpointNode: "execute",
    resumeReason: "resume_after_approval",
    actionId: "action-1",
    actionType: "send_email",
    approvalItemId: "approval-1",
    requestedAt: "2026-03-18T11:00:00.000Z",
  });

  const payload = readRuntimeQueueDispatchPayload({
    runtimeRunId: "runtime-run-1",
    resumeToken: token,
  });

  assert.ok(payload);
  assert.equal(payload?.runtimeRunId, "runtime-run-1");
  assert.equal(payload?.resumeToken.resumeReason, "resume_after_approval");
  assert.equal(payload?.resumeToken.target.workflowStepId, "workflow-step-1");
}

async function runDispatchEventHydrationTest(): Promise<void> {
  const token = buildWorkflowStepResumeToken({
    runtimeRunId: "runtime-run-1",
    workflowRunId: "workflow-run-1",
    workflowStepId: "workflow-step-1",
    checkpointNode: "execute",
    resumeReason: "resume_after_retry_delay",
    actionId: "action-1",
    actionType: "send_email",
    requestedAt: "2026-03-18T11:00:00.000Z",
  });
  const event: EventRow = {
    id: "event-1",
    organization_id: "org-1",
    event_type: "runtime.queue.dispatch",
    payload: {
      runtimeRunId: "runtime-run-1",
      resumeToken: token,
    },
    idempotency_key: null,
    created_at: "2026-03-18T11:00:01.000Z",
  };

  const workflowEvent = buildWorkflowStepEventFromResumeToken(event, token);
  assert.equal(workflowEvent.event_type, "workflow.step.execute");
  assert.deepEqual(workflowEvent.payload, {
    workflowRunId: "workflow-run-1",
    workflowStepId: "workflow-step-1",
  });
}

async function main(): Promise<void> {
  await runPayloadRoundtripTest();
  await runDispatchEventHydrationTest();
  console.log("runtime queue dispatcher checks passed");
}

void main();
