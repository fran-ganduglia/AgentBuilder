import assert from "node:assert/strict";

import { createActionPolicyEvaluator } from "./policy";
import {
  createActionRegistry,
  createEngineStepRegistry,
  runAction,
} from "./runtime";
import type { ActionDefinition, PlannedAction } from "./types";

async function runExecutesStepsInOrderTest(): Promise<void> {
  const calls: string[] = [];
  const action: PlannedAction = {
    type: "search_threads",
    provider: "gmail",
    params: {},
  };
  const definition: ActionDefinition<Record<string, unknown>> = {
    type: action.type,
    provider: action.provider,
    steps: ["step.one", "step.two"],
    resolverSchema: null,
    executionMode: "sync",
    policyKey: "gmail:search_threads",
    resolve: async () => ({
      status: "ok",
      resolvedParams: { action: "search_threads" },
    }),
  };

  const result = await runAction({
    action,
    context: { traceId: "trace-1" },
    initialState: { calls },
    actions: createActionRegistry<{ traceId: string }, { calls: string[] }>([definition]),
    engineSteps: createEngineStepRegistry<{ traceId: string }, { calls: string[] }>([
      [
        "step.one",
        async ({ state }) => {
          state.calls.push("one");
          return state;
        },
      ],
      [
        "step.two",
        async ({ state }) => {
          state.calls.push("two");
          return state;
        },
      ],
    ]),
    evaluatePolicy: createActionPolicyEvaluator(),
  });

  assert.equal(result.status, "executed");
  assert.deepEqual(result.state.calls, ["one", "two"]);
}

async function runApprovalPolicyTest(): Promise<void> {
  let touched = false;
  const action: PlannedAction = {
    type: "send_email",
    provider: "gmail",
    params: {},
    requiresApprovalHint: true,
  };
  const definition: ActionDefinition<Record<string, unknown>> = {
    type: action.type,
    provider: action.provider,
    steps: ["step.never"],
    resolverSchema: null,
    executionMode: "approval_async",
    policyKey: "gmail:send_email",
    resolve: async () => ({
      status: "ok",
      resolvedParams: { action: "send_email" },
    }),
  };

  const result = await runAction({
    action,
    context: {},
    initialState: { touched: false },
    actions: createActionRegistry<Record<string, never>, { touched: boolean }>([definition]),
    engineSteps: createEngineStepRegistry<Record<string, never>, { touched: boolean }>([
      [
        "step.never",
        async ({ state }) => {
          touched = true;
          return { ...state, touched: true };
        },
      ],
    ]),
    evaluatePolicy: createActionPolicyEvaluator(),
  });

  assert.equal(result.status, "approval_enqueued");
  assert.equal(result.policyDecision, "enqueue_approval");
  assert.equal(touched, true);
}

async function runFailureMappingTest(): Promise<void> {
  const action: PlannedAction = {
    type: "check_availability",
    provider: "google_calendar",
    params: {},
  };
  const definition: ActionDefinition<Record<string, unknown>> = {
    type: action.type,
    provider: action.provider,
    steps: ["step.never"],
    resolverSchema: null,
    executionMode: "sync",
    policyKey: "google_calendar:check_availability",
    resolve: async () => ({
      status: "clarify",
      resolvedParams: null,
      failure: "ambiguous_reference",
    }),
  };

  const result = await runAction({
    action,
    context: {},
    initialState: { touched: false },
    actions: createActionRegistry<Record<string, never>, { touched: boolean }>([definition]),
    engineSteps: createEngineStepRegistry<Record<string, never>, { touched: boolean }>([
      [
        "step.never",
        async () => {
          throw new Error("step should not run");
        },
      ],
    ]),
    evaluatePolicy: createActionPolicyEvaluator(),
  });

  assert.equal(result.status, "policy_blocked");
  assert.equal(result.policyDecision, "clarify_user");
  assert.equal(result.failure, "ambiguous_reference");
}

async function main(): Promise<void> {
  await runExecutesStepsInOrderTest();
  await runApprovalPolicyTest();
  await runFailureMappingTest();
  console.log("engine runtime checks passed");
}

void main();
