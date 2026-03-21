import assert from "node:assert/strict";

import type { ActionPlanV1 } from "@/lib/runtime/types";
import { readRuntimeKillSwitchConfig } from "./runtime-kill-switch";

import {
  isRuntimeActionAllowedForAgent,
  resolveRuntimeChatRoutingDecision,
  shouldAttemptRuntimePlanner,
  type RuntimeAvailabilityLike,
} from "./chat-route";

function createPlan(actionTypes: ActionPlanV1["actions"][number]["type"][]): ActionPlanV1 {
  return {
    version: 1,
    intent: "test",
    confidence: 0.9,
    missingFields: [],
    actions: actionTypes.map((type, index) => ({
      id: `action-${index + 1}`,
      type,
      params: {},
      approvalMode:
        type === "search_email" ||
        type === "summarize_thread" ||
        type === "list_events" ||
        type === "read_sheet_range" ||
        type === "search_records"
          ? "auto"
          : "required",
    })),
  };
}

function createRuntimes(): RuntimeAvailabilityLike {
  return {
    gmail: {
      actionPolicies: [
        { action: "search_threads" },
        { action: "read_thread" },
        { action: "send_email" },
      ],
    },
    google_calendar: {
      actionPolicies: [{ action: "list_events" }, { action: "create_event" }],
    },
    google_sheets: {
      actionPolicies: [{ action: "read_range" }, { action: "append_rows" }],
    },
    salesforce: {
      config: {
        allowed_actions: ["lookup_records", "create_lead"],
      },
    },
  };
}

async function shouldAttemptPlannerTest(): Promise<void> {
  assert.equal(
    shouldAttemptRuntimePlanner({
      selectedSurfaces: ["gmail"],
      runtimes: createRuntimes(),
    }),
    true
  );

  assert.equal(
    shouldAttemptRuntimePlanner({
      selectedSurfaces: [],
      runtimes: createRuntimes(),
    }),
    false
  );
}

async function actionAllowedByAgentTest(): Promise<void> {
  const runtimes = createRuntimes();

  assert.equal(isRuntimeActionAllowedForAgent("search_email", runtimes), true);
  assert.equal(isRuntimeActionAllowedForAgent("update_sheet_range", runtimes), false);
  assert.equal(isRuntimeActionAllowedForAgent("search_records", runtimes), true);
  assert.equal(isRuntimeActionAllowedForAgent("update_lead", runtimes), false);
}

async function usesRuntimeWhenPlanHasAvailableActionsTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail", "google_calendar"],
    runtimes: createRuntimes(),
    plan: createPlan(["send_email"]),
  });

  assert.equal(decision.shouldAttemptPlanner, true);
  assert.equal(decision.runtimeDecision, "accept");
  assert.equal(decision.rejectionReason, null);
  assert.equal(decision.actionAvailability[0]?.actionAllowedByAgent, true);
}

async function plannerEmptyRejectsInsideRuntimeTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail"],
    runtimes: createRuntimes(),
    plan: createPlan([]),
  });

  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "planner_empty");
}

async function rejectsWhenPlannerReturnsInvalidOutputTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail"],
    runtimes: createRuntimes(),
    plan: {
      ...createPlan([]),
      missingFields: ["planner_invalid_output"],
    },
  });

  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "planner_invalid_output");
}

async function rejectsWhenPlannerFailsTechnicallyTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail"],
    runtimes: createRuntimes(),
    plan: null,
    plannerErrorType: "request_timeout",
  });

  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "planner_failed");
}

async function rejectsWhenRuntimeUnavailableForActionTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail", "google_sheets"],
    runtimes: {
      ...createRuntimes(),
      google_sheets: null,
    },
    plan: createPlan(["append_sheet_rows"]),
  });

  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "runtime_unavailable_for_action");
  assert.deepEqual(decision.unsupportedActions, ["append_sheet_rows"]);
}

async function stillAttemptsPlannerWhenKillSwitchDisablesSurfaceTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail"],
    runtimes: createRuntimes(),
    plan: createPlan(["send_email"]),
    killSwitch: readRuntimeKillSwitchConfig({
      runtime_rollout: {
        disabled_surfaces: ["gmail"],
      },
    }),
  });

  assert.equal(decision.shouldAttemptPlanner, true);
  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "runtime_unavailable_for_action");
  assert.deepEqual(decision.unsupportedActions, ["send_email"]);
}

async function rejectsWhenKillSwitchDisablesCapabilityTest(): Promise<void> {
  const decision = resolveRuntimeChatRoutingDecision({
    selectedSurfaces: ["gmail"],
    runtimes: createRuntimes(),
    plan: createPlan(["send_email"]),
    killSwitch: readRuntimeKillSwitchConfig({
      runtime_rollout: {
        disabled_action_types: ["send_email"],
      },
    }),
  });

  assert.equal(decision.runtimeDecision, "reject");
  assert.equal(decision.rejectionReason, "runtime_unavailable_for_action");
  assert.deepEqual(decision.unsupportedActions, ["send_email"]);
}

async function main(): Promise<void> {
  await shouldAttemptPlannerTest();
  await actionAllowedByAgentTest();
  await usesRuntimeWhenPlanHasAvailableActionsTest();
  await plannerEmptyRejectsInsideRuntimeTest();
  await rejectsWhenPlannerReturnsInvalidOutputTest();
  await rejectsWhenPlannerFailsTechnicallyTest();
  await rejectsWhenRuntimeUnavailableForActionTest();
  await stillAttemptsPlannerWhenKillSwitchDisablesSurfaceTest();
  await rejectsWhenKillSwitchDisablesCapabilityTest();
  console.log("runtime chat route checks passed");
}

void main();
