import assert from "node:assert/strict";

import { buildRuntimeMigrationSnapshot } from "./migration-snapshot";

function snapshotBuildTest(): void {
  const snapshot = buildRuntimeMigrationSnapshot({
    windowHours: 168,
    messages: [
      {
        createdAt: "2026-03-18T10:00:00.000Z",
        metadata: {
          runtime_observability: {
            planner_empty_count: 0,
            runtime_clarification_count: 0,
            runtime_failure_count: 0,
            unsupported_action_count: 0,
          },
          runtime: {
            routingDecision: "runtime_primary",
            outcome: "success",
            actionPlan: {
              version: 1,
              actions: [{ type: "send_email" }],
            },
          },
        },
      },
      {
        createdAt: "2026-03-18T10:30:00.000Z",
        metadata: {
          runtime_observability: {
            planner_empty_count: 1,
            runtime_clarification_count: 1,
            runtime_failure_count: 1,
            unsupported_action_count: 2,
          },
          runtime: {
            routingDecision: "runtime_primary",
            outcome: "failed",
            actionPlan: {
              version: 1,
              actions: [{ type: "send_email" }],
            },
          },
        },
      },
    ],
  });

  assert.equal(snapshot.assistantMessagesConsidered, 2);
  assert.equal(snapshot.runtimePrimaryCount, 2);
  assert.equal(snapshot.runtimeCoverageRate, 1);
  assert.equal(snapshot.runtimeSuccessRate, 0.5);
  assert.deepEqual(snapshot.runtimeOutcomeCounts, {
    runtimePrimaryCount: 2,
    successCount: 1,
    needsUserCount: 0,
    blockedCount: 0,
    failedCount: 1,
    waitingApprovalCount: 0,
  });
  assert.deepEqual(snapshot.runtimeObservability, {
    plannerEmptyCount: 1,
    runtimeClarificationCount: 1,
    runtimeFailureCount: 1,
    unsupportedActionCount: 2,
  });

  const sendEmail = snapshot.capabilities.find((capability) => capability.actionType === "send_email");
  assert.equal(sendEmail?.runtimePrimaryCount, 2);
  assert.equal(sendEmail?.successCount, 1);
  assert.equal(sendEmail?.failedCount, 1);
  assert.deepEqual(sendEmail?.runtimeObservability, {
    plannerEmptyCount: 1,
    runtimeClarificationCount: 1,
    runtimeFailureCount: 1,
    unsupportedActionCount: 2,
  });
  assert.equal(sendEmail?.status, "runtime_attention_needed");
  assert.equal(sendEmail?.recommendation, "stabilize_runtime");
}

function main(): void {
  snapshotBuildTest();
  console.log("runtime migration snapshot checks passed");
}

main();
