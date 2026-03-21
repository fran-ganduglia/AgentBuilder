import assert from "node:assert/strict";

import {
  createExecuteNodeHandlerV1,
  createSimulateNodeHandlerV1,
  executeAction,
} from "./executor";
import type { AdapterRegistryV1 } from "./adapters/registry";
import type { ExecutionContextV1 } from "./types";

function createContext(): ExecutionContextV1 {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    userId: "user-1",
    conversationMetadata: {},
    messageMetadata: {},
    budget: {
      plannerCallsMax: 1,
      plannerCallsUsed: 0,
      llmRepairCallsMaxPerAction: 1,
      syncRetriesMaxPerAction: 2,
    },
  };
}

function createRegistry(calls: string[]): AdapterRegistryV1 {
  return {
    platform: {
      probeAdapter: (adapter) => ({
        adapterId: adapter.manifest.id,
        provider: adapter.provider,
        version: adapter.manifest.version,
        enabled: true,
        supportedActionTypes: [...adapter.manifest.supportedActionTypes],
      }),
      getHealth: () => ({
        status: "healthy",
        checkedAt: "2026-03-18T00:00:00.000Z",
        provider: "gmail",
        consecutiveFailures: 0,
      }),
      assertAvailable: () => undefined,
      recordSuccess: () => undefined,
      recordFailure: () => undefined,
    },
    adapters: {
      gmail: {
        manifest: {
          id: "runtime.gmail",
          version: "1.0.0",
          provider: "gmail",
          capability: "email",
          supportedActionTypes: ["search_email", "summarize_thread", "send_email"],
          requiredScopes: [],
          operationalLimits: {},
          supportsSimulation: true,
          supportsCompensation: false,
          featureFlagKey: "runtime_adapter_gmail",
        },
        provider: "gmail",
        capability: "email",
        actionTypes: ["search_email", "summarize_thread", "send_email"],
        supports: ({ action }) =>
          ["search_email", "summarize_thread", "send_email"].includes(action.type),
        compile: async ({ action }) => ({ action: action.type }),
        simulate: async ({ action }) => {
          calls.push(`simulate:${action.type}`);
          return {
            provider: "gmail",
            payload: { action: action.type },
            summary: "preview ready",
            preview: { ok: true },
          };
        },
        execute: async ({ action }) => {
          calls.push(`execute:${action.type}`);
          return {
            provider: "gmail",
            payload: { action: action.type },
            summary: "execution ready",
            approvalItemId: "approval-1",
            workflowRunId: "run-1",
            workflowStepId: "step-1",
            output: { ok: true },
          };
        },
        normalizeOutput: () => ({ ok: true }),
        normalizeError: ({ error }) => ({
          code: "provider_fatal",
          status: "failed",
          reason: error instanceof Error ? error.message : "unexpected",
          provider: "gmail",
        }),
        buildIdempotencyMaterial: ({ payload }) => payload,
      },
    },
  };
}

async function runSimulateNodeTest(): Promise<void> {
  const calls: string[] = [];
  const handler = createSimulateNodeHandlerV1({
    registry: createRegistry(calls),
  });
  const result = await handler({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {},
    },
    node: "simulate",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "success");
  assert.equal(result.provider, "gmail");
  assert.deepEqual(result.output, { ok: true });
  assert.deepEqual(calls, ["simulate:send_email"]);
}

async function runExecuteNodeTest(): Promise<void> {
  const calls: string[] = [];
  const handler = createExecuteNodeHandlerV1({
    registry: createRegistry(calls),
  });
  const result = await handler({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {},
    },
    node: "execute",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "success");
  assert.equal(result.provider, "gmail");
  assert.equal(result.approvalItemId, "approval-1");
  assert.equal(result.workflowRunId, "run-1");
  assert.deepEqual(calls, ["execute:send_email"]);
}

async function runExecuteActionTest(): Promise<void> {
  const calls: string[] = [];
  const ctx = createContext();
  const result = await executeAction({
    ctx,
    action: {
      id: "action-1",
      type: "search_email",
      approvalMode: "auto",
      params: {},
    },
    registry: createRegistry(calls),
  });

  assert.equal(result.provider, "gmail");
  assert.deepEqual(calls, ["execute:search_email"]);
}

async function main(): Promise<void> {
  await runSimulateNodeTest();
  await runExecuteNodeTest();
  await runExecuteActionTest();
  console.log("runtime executor checks passed");
}

void main();
