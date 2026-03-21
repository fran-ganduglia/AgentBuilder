import assert from "node:assert/strict";

import { runExecutionGraph } from "./runner";
import type {
  ActionPlanV1,
  ActionPlanV3,
  ExecutionContextV1,
  RuntimeNodeRegistryV1,
} from "./types";

function createContext(): ExecutionContextV1 {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    conversationMetadata: {},
    messageMetadata: {},
    budget: {
      plannerCallsMax: 1,
      plannerCallsUsed: 0,
      llmRepairCallsMaxPerAction: 2,
      llmRepairCallsMaxPerRequest: 2,
      syncRetriesMaxPerAction: 3,
      maxNodeVisitsPerAction: 12,
      maxRetriesPerNode: 3,
      maxActionsPerPlan: 3,
      repeatedErrorFingerprintLimit: 2,
      destructiveActionsMaxPerRequest: 1,
    },
  };
}

function createPlan(): ActionPlanV1 {
  return {
    version: 1,
    intent: "runtime_mvp",
    confidence: 0.9,
    missingFields: [],
    actions: [
      {
        id: "action-1",
        type: "search_email",
        approvalMode: "auto",
        params: {
          query: {
            kind: "primitive",
            value: "factura",
          },
        },
      },
    ],
  };
}

function createRegistry(overrides: Partial<RuntimeNodeRegistryV1> = {}, calls: string[] = []): RuntimeNodeRegistryV1 {
  return {
    normalize: async () => {
      calls.push("normalize");
      return { status: "success" };
    },
    enrich: async () => {
      calls.push("enrich");
      return { status: "success" };
    },
    resolve: async () => {
      calls.push("resolve");
      return { status: "success" };
    },
    validate: async () => {
      calls.push("validate");
      return { status: "success" };
    },
    policy_gate: async () => {
      calls.push("policy_gate");
      return { status: "success" };
    },
    simulate: async () => {
      calls.push("simulate");
      return { status: "success" };
    },
    execute: async () => {
      calls.push("execute");
      return { status: "success" };
    },
    postprocess: async () => {
      calls.push("postprocess");
      return { status: "success" };
    },
    llm_repair: async () => ({
      status: "success",
    }),
    user_clarification: async ({ sourceNode, sourceReason }) => ({
      status: "needs_user",
      reason: sourceReason,
      output: {
        question: `clarify:${sourceNode ?? "unknown"}`,
      },
    }),
    error_handler: async ({ sourceStatus, sourceReason }) => ({
      status: sourceStatus === "retry" ? "retry" : "failed",
      reason: sourceReason,
    }),
    ...overrides,
  };
}

async function runNodesInOrderTest(): Promise<void> {
  const calls: string[] = [];
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({}, calls),
  });

  assert.equal(result.outcome, "success");
  assert.deepEqual(calls, [
    "normalize",
    "enrich",
    "resolve",
    "validate",
    "policy_gate",
    "simulate",
    "execute",
    "postprocess",
  ]);
  assert.equal(result.actions[0]?.status, "success");
}

async function runRetryLimitTest(): Promise<void> {
  let attempts = 0;
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({
      normalize: async () => {
        attempts += 1;
        return { status: "retry", reason: `provider_timeout_${attempts}` };
      },
      error_handler: async ({ sourceStatus, sourceReason }) => ({
        status: sourceStatus === "retry" ? "retry" : "failed",
        reason: sourceReason,
      }),
    }),
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.actions[0]?.status, "failed");
  assert.equal(result.actions[0]?.retries, 3);
  assert.equal(attempts, 4);
}

async function runNeedsUserCheckpointTest(): Promise<void> {
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({
      resolve: async () => ({ status: "needs_user", reason: "missing_thread_reference" }),
    }),
  });

  assert.equal(result.outcome, "needs_user");
  assert.equal(result.trace.checkpoint?.resumeFrom, "resolve");
  assert.equal(result.trace.checkpoint?.node, "user_clarification");
  assert.equal(result.trace.checkpoint?.actionIndex, 0);
  assert.equal(result.trace.checkpoint?.actionId, "action-1");
  assert.deepEqual(result.context.conversationMetadata.runtime_checkpoint, result.trace.checkpoint);
}

async function runLlmRepairPolicyTest(): Promise<void> {
  let validateCalls = 0;
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({
      validate: async () => {
        validateCalls += 1;
        if (validateCalls === 1) {
          return { status: "needs_llm", reason: "draft_body_requested" };
        }

        return { status: "success" };
      },
      llm_repair: async () => ({
        status: "success",
        actionPatch: {
          metadata: {
            repaired: true,
          },
        },
      }),
    }),
    allowLlmRepair: ({ node, reason }) =>
      node === "validate" && reason === "draft_body_requested",
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.actions[0]?.llmRepairCalls, 1);
  assert.equal(validateCalls, 2);
  assert.equal(result.actions[0]?.action.metadata?.repaired, true);
}

async function runDisallowedLlmRepairTest(): Promise<void> {
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({
      validate: async () => ({ status: "needs_llm", reason: "missing_recipient" }),
    }),
    allowLlmRepair: () => false,
  });

  assert.equal(result.outcome, "needs_user");
  assert.equal(result.actions[0]?.status, "needs_user");
  assert.equal(result.trace.checkpoint?.resumeFrom, "validate");
  assert.equal(result.trace.checkpoint?.node, "user_clarification");
}

async function runWaitingApprovalCheckpointTest(): Promise<void> {
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: {
      ...createPlan(),
      actions: [{
        ...createPlan().actions[0]!,
        type: "send_email",
        approvalMode: "required",
      }],
    },
    nodes: createRegistry({
      execute: async () => ({
        status: "success",
        output: { approvalItemId: "approval-1" },
      }),
    }),
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.actions[0]?.status, "waiting_approval");
  assert.equal(result.trace.checkpoint?.status, "waiting_approval");
  assert.equal(result.trace.checkpoint?.resumeFrom, "execute");
}

async function runPlanActionLimitTest(): Promise<void> {
  const plan = createPlan();
  plan.actions = [
    plan.actions[0]!,
    { ...plan.actions[0]!, id: "action-2" },
    { ...plan.actions[0]!, id: "action-3" },
    { ...plan.actions[0]!, id: "action-4" },
  ];

  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: plan,
    nodes: createRegistry(),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.actions.length, 0);
}

async function runResumeFromCheckpointTest(): Promise<void> {
  const calls: string[] = [];
  const baseContext = createContext();
  const checkpoint = {
    planVersion: 1 as const,
    actionId: "action-1",
    actionIndex: 0,
    node: "user_clarification" as const,
    status: "needs_user" as const,
    resumeFrom: "resolve" as const,
    createdAt: "2026-03-18T10:00:00.000Z",
    retries: 0,
    llmRepairCalls: 0,
    nodeVisitCounts: {
      normalize: 1,
      enrich: 1,
      user_clarification: 1,
    },
    actionSnapshot: createPlan().actions[0]!,
    contextSnapshot: {
      budget: baseContext.budget,
      conversationMetadata: { restored: true },
      messageMetadata: {},
      timezone: null,
    },
    executionStateSnapshot: {
      completedActionIds: [],
      actionOutputsByActionId: {},
      executionOrder: ["action-1"],
    },
  };

  const result = await runExecutionGraph({
    ctx: baseContext,
    actionPlan: createPlan(),
    resumeFromCheckpoint: checkpoint,
    nodes: createRegistry({}, calls),
  });

  assert.equal(result.outcome, "success");
  assert.deepEqual(calls, ["resolve", "validate", "policy_gate", "simulate", "execute", "postprocess"]);
  assert.equal(result.context.conversationMetadata.restored, true);
}

async function runErrorHandlerDegradationTest(): Promise<void> {
  const calls: string[] = [];
  const result = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlan(),
    nodes: createRegistry({
      postprocess: async () => ({ status: "failed", reason: "postprocess_summary_timeout" }),
      error_handler: async ({ sourceNode, sourceStatus, sourceReason }) => {
        calls.push(`${sourceNode}:${sourceStatus}`);
        return {
          status: sourceNode === "postprocess" ? "completed_with_degradation" : "failed",
          reason: sourceReason,
        };
      },
    }),
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.actions[0]?.status, "completed_with_degradation");
  assert.deepEqual(calls, ["postprocess:failed"]);
}

async function runLlmRepairRequestLimitTest(): Promise<void> {
  const validateCallsByAction = new Map<string, number>();
  const plan = createPlan();
  plan.actions = [
    plan.actions[0]!,
    { ...plan.actions[0]!, id: "action-2" },
    { ...plan.actions[0]!, id: "action-3" },
  ];

  const result = await runExecutionGraph({
    ctx: {
      ...createContext(),
      budget: {
        ...createContext().budget,
        llmRepairCallsMaxPerAction: 2,
        llmRepairCallsMaxPerRequest: 2,
      },
    },
    actionPlan: plan,
    nodes: createRegistry({
      validate: async ({ action }) => {
        const nextCalls = (validateCallsByAction.get(action.id) ?? 0) + 1;
        validateCallsByAction.set(action.id, nextCalls);
        return nextCalls === 1
          ? { status: "needs_llm", reason: `draft_body_requested_${action.id}` }
          : { status: "success" };
      },
      llm_repair: async () => ({
        status: "success",
      }),
    }),
    allowLlmRepair: () => true,
  });

  assert.equal(result.outcome, "needs_user");
  assert.equal(result.actions[0]?.status, "success");
  assert.equal(result.actions[1]?.status, "success");
  assert.equal(result.actions[2]?.status, "needs_user");
  assert.equal(result.context.budget.llmRepairCallsUsedInRequest, 2);
}

function createPlanV3(): ActionPlanV3 {
  return {
    version: 3,
    intent: "search_then_summarize_then_search_crm",
    confidence: 0.92,
    missingFields: [],
    executionMode: "sync",
    entryActionIds: ["action-1"],
    actions: [
      {
        id: "action-1",
        type: "search_email",
        approvalMode: "auto",
        params: {
          query: { kind: "primitive", value: "acme renewal" },
        },
      },
      {
        id: "action-2",
        type: "summarize_thread",
        approvalMode: "auto",
        params: {},
      },
      {
        id: "action-3",
        type: "search_records",
        approvalMode: "auto",
        params: {
          objectType: { kind: "primitive", value: "accounts" },
        },
      },
    ],
    edges: [
      {
        fromActionId: "action-1",
        toActionId: "action-2",
        outputMapping: [
          {
            outputPath: "latestThreadId",
            toParamKey: "threadRef",
            valueType: "reference",
            refType: "thread",
          },
        ],
      },
      {
        fromActionId: "action-2",
        toActionId: "action-3",
        outputMapping: [
          {
            outputPath: "summaryText",
            toParamKey: "query",
            valueType: "primitive",
          },
        ],
      },
    ],
  };
}

async function runMultiStepDependencyMappingTest(): Promise<void> {
  const seenParams = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const result = await runExecutionGraph({
    ctx: {
      ...createContext(),
      budget: {
        ...createContext().budget,
        maxActionsPerPlan: 5,
      },
    },
    actionPlan: createPlanV3(),
    nodes: createRegistry({
      resolve: async ({ action }) => {
        seenParams.set(action.id, action.params as Record<string, unknown>);
        calls.push(`resolve:${action.id}`);
        return { status: "success" };
      },
      execute: async ({ action }) => {
        calls.push(`execute:${action.id}`);

        if (action.id === "action-1") {
          return {
            status: "success",
            output: {
              latestThreadId: "thread-123",
            },
          };
        }

        if (action.id === "action-2") {
          return {
            status: "success",
            output: {
              summaryText: "Acme renewal conversation",
            },
          };
        }

        return {
          status: "success",
          output: {
            records: [{ id: "acc-1" }],
          },
        };
      },
    }, calls),
  });

  assert.equal(result.outcome, "success");
  assert.deepEqual(calls, [
    "normalize",
    "enrich",
    "resolve:action-1",
    "validate",
    "policy_gate",
    "simulate",
    "execute:action-1",
    "postprocess",
    "normalize",
    "enrich",
    "resolve:action-2",
    "validate",
    "policy_gate",
    "simulate",
    "execute:action-2",
    "postprocess",
    "normalize",
    "enrich",
    "resolve:action-3",
    "validate",
    "policy_gate",
    "simulate",
    "execute:action-3",
    "postprocess",
  ]);
  assert.deepEqual(seenParams.get("action-2")?.threadRef, {
    kind: "reference",
    refType: "thread",
    value: "thread-123",
  });
  assert.deepEqual(seenParams.get("action-3")?.query, {
    kind: "primitive",
    value: "Acme renewal conversation",
  });
}

async function runMultiStepMissingDependencyOutputTest(): Promise<void> {
  const result = await runExecutionGraph({
    ctx: {
      ...createContext(),
      budget: {
        ...createContext().budget,
        maxActionsPerPlan: 5,
      },
    },
    actionPlan: createPlanV3(),
    nodes: createRegistry({
      execute: async ({ action }) => {
        if (action.id === "action-1") {
          return {
            status: "success",
            output: {},
          };
        }

        return { status: "success" };
      },
    }),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.actions[1]?.status, "blocked");
  assert.equal(result.actions[1]?.reason, "dependency_output_missing:action-1.latestThreadId");
}

async function runMultiStepResumeFromCheckpointTest(): Promise<void> {
  const initialCalls: string[] = [];
  const initialResult = await runExecutionGraph({
    ctx: {
      ...createContext(),
      budget: {
        ...createContext().budget,
        maxActionsPerPlan: 5,
      },
    },
    actionPlan: createPlanV3(),
    nodes: createRegistry({
      execute: async ({ action }) => {
        initialCalls.push(`execute:${action.id}`);
        return action.id === "action-1"
          ? {
              status: "success",
              output: {
                latestThreadId: "thread-123",
              },
            }
          : { status: "success" };
      },
      resolve: async ({ action }) => {
        initialCalls.push(`resolve:${action.id}`);
        return action.id === "action-2"
          ? { status: "needs_user", reason: "confirm_thread_summary_scope" }
          : { status: "success" };
      },
    }),
  });

  assert.equal(initialResult.outcome, "needs_user");
  assert.deepEqual(
    initialResult.trace.checkpoint?.executionStateSnapshot?.completedActionIds,
    ["action-1"]
  );
  assert.equal(
    initialResult.trace.checkpoint?.executionStateSnapshot?.actionOutputsByActionId["action-1"]?.latestThreadId,
    "thread-123"
  );

  const resumedCalls: string[] = [];
  const resumedParams = new Map<string, Record<string, unknown>>();
  const resumedResult = await runExecutionGraph({
    ctx: createContext(),
    actionPlan: createPlanV3(),
    resumeFromCheckpoint: initialResult.trace.checkpoint ?? null,
    nodes: createRegistry({
      resolve: async ({ action }) => {
        resumedCalls.push(`resolve:${action.id}`);
        resumedParams.set(action.id, action.params as Record<string, unknown>);
        return { status: "success" };
      },
      execute: async ({ action }) => {
        resumedCalls.push(`execute:${action.id}`);
        return action.id === "action-2"
          ? {
              status: "success",
              output: {
                summaryText: "Acme renewal conversation",
              },
            }
          : {
              status: "success",
              output: {
                records: [{ id: "acc-1" }],
              },
            };
      },
    }),
  });

  assert.equal(resumedResult.outcome, "success");
  assert.deepEqual(resumedCalls, [
    "resolve:action-2",
    "execute:action-2",
    "resolve:action-3",
    "execute:action-3",
  ]);
  assert.deepEqual(resumedParams.get("action-2")?.threadRef, {
    kind: "reference",
    refType: "thread",
    value: "thread-123",
  });
  assert.deepEqual(resumedParams.get("action-3")?.query, {
    kind: "primitive",
    value: "Acme renewal conversation",
  });
}

async function main(): Promise<void> {
  await runNodesInOrderTest();
  await runRetryLimitTest();
  await runNeedsUserCheckpointTest();
  await runLlmRepairPolicyTest();
  await runDisallowedLlmRepairTest();
  await runWaitingApprovalCheckpointTest();
  await runPlanActionLimitTest();
  await runResumeFromCheckpointTest();
  await runErrorHandlerDegradationTest();
  await runLlmRepairRequestLimitTest();
  await runMultiStepDependencyMappingTest();
  await runMultiStepMissingDependencyOutputTest();
  await runMultiStepResumeFromCheckpointTest();
  console.log("runtime runner checks passed");
}

void main();
