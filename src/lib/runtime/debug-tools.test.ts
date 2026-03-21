import assert from "node:assert/strict";

import {
  buildRuntimeRunDiff,
  buildRuntimeTraceViewer,
  replayRuntimeRun,
  type RuntimeReplaySourceV1,
} from "./debug-tools";
import type { RuntimeNodeRegistryV1 } from "./types";

function createTraceEvents(actionStatus = "completed") {
  return [
    {
      runtimeRunId: "run-1",
      createdAt: "2026-03-18T10:00:00.000Z",
      actionId: "action-1",
      actionType: "search_email",
      node: "resolve",
      status: "success",
      reason: null,
      provider: null,
      providerRequestId: null,
      approvalItemId: null,
      workflowRunId: null,
      workflowStepId: null,
      payload: {
        type: "runtime.node.completed",
        action_type: "search_email",
        runtime_surface: "chat_web",
        runtime_channel: "web",
      },
    },
    {
      runtimeRunId: "run-1",
      createdAt: "2026-03-18T10:00:01.000Z",
      actionId: "action-1",
      actionType: "search_email",
      node: "execute",
      status: actionStatus,
      reason: actionStatus === "blocked" ? "provider_blocked" : "ok",
      provider: "gmail",
      providerRequestId: "provider-1",
      approvalItemId: null,
      workflowRunId: null,
      workflowStepId: null,
      payload: {
        type: "runtime.action.completed",
        action_type: "search_email",
      },
    },
  ];
}

function createReplaySource(overrides?: Partial<RuntimeReplaySourceV1>): RuntimeReplaySourceV1 {
  return {
    runtimeRunId: "run-1",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    requestId: "req-1",
    traceId: "trace-1",
    status: "success",
    startedAt: "2026-03-18T10:00:00.000Z",
    finishedAt: "2026-03-18T10:00:02.000Z",
    currentActionIndex: 0,
    checkpointNode: null,
    actionPlan: {
      version: 1,
      intent: "runtime_debug_test",
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
              value: "invoice",
            },
          },
        },
      ],
    },
    trace: {
      runtimeRunId: "run-1",
      requestId: "req-1",
      traceId: "trace-1",
      status: "success",
      startedAt: "2026-03-18T10:00:00.000Z",
      finishedAt: "2026-03-18T10:00:02.000Z",
      events: createTraceEvents(),
      sideEffects: [],
    },
    surface: "chat_web",
    channel: "web",
    userId: "user-1",
    messageId: "message-1",
    ...overrides,
  };
}

function createRegistry(calls: string[] = []): RuntimeNodeRegistryV1 {
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
      return {
        status: "success",
        provider: "gmail",
        output: {
          previewResult: "safe",
        },
        actionPatch: {
          metadata: {
            simulation: {
              provider: "gmail",
              summary: "simulated",
              preview: {
                previewResult: "safe",
              },
            },
          },
        },
      };
    },
    execute: async () => {
      calls.push("execute");
      return {
        status: "success",
        output: {
          realExecution: true,
        },
      };
    },
    postprocess: async () => {
      calls.push("postprocess");
      return { status: "success" };
    },
    llm_repair: async () => ({ status: "needs_user", reason: "llm_disabled" }),
    user_clarification: async () => ({ status: "needs_user", reason: "clarify" }),
    error_handler: async ({ sourceStatus, sourceReason }) => ({
      status: sourceStatus === "retry" ? "retry" : "failed",
      reason: sourceReason,
    }),
  };
}

async function runTraceViewerTest(): Promise<void> {
  const viewer = buildRuntimeTraceViewer(createReplaySource().trace);

  assert.equal(viewer.timeline.length, 2);
  assert.equal(viewer.actions.length, 1);
  assert.equal(viewer.actions[0]?.latestStatus, "completed");
  assert.equal(viewer.actions[0]?.timeline[1]?.eventType, "runtime.action.completed");
}

async function runDiffTest(): Promise<void> {
  const baseline = createReplaySource();
  const candidate = createReplaySource({
    runtimeRunId: "run-2",
    trace: {
      ...createReplaySource().trace,
      runtimeRunId: "run-2",
      events: createTraceEvents("blocked"),
    },
    status: "blocked",
  });

  const diff = buildRuntimeRunDiff({
    baseline,
    candidate,
  });

  assert.equal(diff.changed, true);
  assert.equal(diff.statusChanged, true);
  assert.equal(diff.actions[0]?.candidateStatus, "blocked");
}

async function runReplayTest(): Promise<void> {
  const calls: string[] = [];
  const replay = await replayRuntimeRun({
    source: createReplaySource(),
    request: {
      runtimeRunId: "run-1",
      mode: "runtime_replay",
    },
    nodes: createRegistry(calls),
    allowLlmRepair: () => false,
  });

  assert.equal(replay.outcome, "success");
  assert.equal(calls.includes("execute"), false);
  assert.equal(calls.includes("simulate"), true);
  assert.equal(replay.actions[0]?.output?.sideEffectsPrevented, true);
  assert.equal(replay.actions[0]?.output?.replayMode, "runtime_replay");
}

async function main(): Promise<void> {
  await runTraceViewerTest();
  await runDiffTest();
  await runReplayTest();
  console.log("runtime debug tools checks passed");
}

void main();
