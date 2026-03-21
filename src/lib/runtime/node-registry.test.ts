import assert from "node:assert/strict";

import {
  createPolicyGateNodeHandlerV1,
  createUserClarificationNodeHandlerV1,
} from "./node-registry";
import type { ExecutionContextV1, RuntimeActionV1 } from "./types";

function createContext(policy: Record<string, unknown>): ExecutionContextV1 {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    conversationMetadata: {},
    messageMetadata: {
      runtime_policy: policy,
    },
    budget: {
      plannerCallsMax: 1,
      plannerCallsUsed: 1,
      llmRepairCallsMaxPerAction: 2,
      llmRepairCallsMaxPerRequest: 2,
      syncRetriesMaxPerAction: 3,
      destructiveActionsMaxPerRequest: 1,
    },
  };
}

function createAction(): RuntimeActionV1 {
  return {
    id: "action-1",
    type: "send_email",
    approvalMode: "required",
    params: {
      to: { kind: "primitive", value: ["ana@example.com"] },
      subject: { kind: "primitive", value: "Hola" },
      body: { kind: "primitive", value: "Seguimiento" },
    },
    metadata: {},
  };
}

async function runPolicyGateUsesDeclarativeDecisionTest(): Promise<void> {
  const handler = createPolicyGateNodeHandlerV1();
  const result = await handler({
    ctx: createContext({
      status: "success",
      decision: "enqueue_approval",
      reason: "approval_required",
      requiresApproval: true,
    }),
    action: createAction(),
    node: "policy_gate",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.policyDecision, {
    outcome: "enqueue_approval",
    reason: "approval_required",
  });
}

async function runPolicyGateDefaultsWhenDecisionMissingTest(): Promise<void> {
  const handler = createPolicyGateNodeHandlerV1();
  const result = await handler({
    ctx: createContext({
      status: "needs_user",
      reason: "missing_threadRef",
    }),
    action: {
      ...createAction(),
      type: "archive_thread",
      params: {
        threadRef: { kind: "unknown", reason: "missing" },
      },
    },
    node: "policy_gate",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "needs_user");
  assert.deepEqual(result.policyDecision, {
    outcome: "ask_user",
    reason: "missing_threadRef",
  });
}

async function runRecipientCandidatesQuestionTest(): Promise<void> {
  const handler = createUserClarificationNodeHandlerV1();
  const result = await handler({
    ctx: createContext({}),
    action: createAction(),
    node: "user_clarification",
    attempt: 1,
    llmRepairCalls: 0,
    sourceNode: "resolve",
    sourceStatus: "needs_user",
    sourceReason: "ambiguous_to",
    sourceOutput: {
      candidates: [
        { label: "Juan Spansecchi", email: "juan.spansecchi@example.com" },
        { label: "Jose Spansecchi", email: "jose.spansecchi@example.com" },
      ],
    },
  });

  assert.equal(result.status, "needs_user");
  assert.match(String(result.output?.question ?? ""), /Encontre 2 contactos/i);
}

async function runThreadCandidatesQuestionTest(): Promise<void> {
  const handler = createUserClarificationNodeHandlerV1();
  const result = await handler({
    ctx: createContext({}),
    action: {
      ...createAction(),
      type: "archive_thread",
      params: {
        threadRef: { kind: "reference", refType: "thread", value: "ese hilo" },
      },
    },
    node: "user_clarification",
    attempt: 1,
    llmRepairCalls: 0,
    sourceNode: "resolve",
    sourceStatus: "needs_user",
    sourceReason: "ambiguous_threadRef",
    sourceOutput: {
      candidates: [
        { threadId: "thr-1", label: "Factura marzo" },
        { threadId: "thr-2", label: "Seguimiento demo" },
      ],
    },
  });

  assert.equal(result.status, "needs_user");
  assert.match(String(result.output?.question ?? ""), /Encontre 2 hilos recientes/i);
}

async function runEventCandidatesQuestionTest(): Promise<void> {
  const handler = createUserClarificationNodeHandlerV1();
  const result = await handler({
    ctx: createContext({}),
    action: {
      ...createAction(),
      type: "cancel_event",
      params: {
        eventRef: { kind: "reference", refType: "event", value: "esa reunion" },
      },
    },
    node: "user_clarification",
    attempt: 1,
    llmRepairCalls: 0,
    sourceNode: "resolve",
    sourceStatus: "needs_user",
    sourceReason: "ambiguous_eventRef",
    sourceOutput: {
      candidates: [
        { eventId: "evt-1", label: "Demo A" },
        { eventId: "evt-2", label: "Demo B" },
      ],
    },
  });

  assert.equal(result.status, "needs_user");
  assert.match(String(result.output?.question ?? ""), /Encontre 2 eventos recientes/i);
}

async function main(): Promise<void> {
  await runPolicyGateUsesDeclarativeDecisionTest();
  await runPolicyGateDefaultsWhenDecisionMissingTest();
  await runRecipientCandidatesQuestionTest();
  await runThreadCandidatesQuestionTest();
  await runEventCandidatesQuestionTest();
  console.log("runtime node-registry checks passed");
}

void main();
