import assert from "node:assert/strict";

import {
  createValidateNodeHandlerV1,
  evaluateRuntimeActionPolicyV1,
} from "./policy-engine";
import type {
  ExecutionContextV1,
  RuntimeActionV1,
  RuntimePolicyContextV1,
  RuntimeResolutionSummaryV1,
} from "./types";

function createContext(
  overrides: Partial<ExecutionContextV1> = {}
): ExecutionContextV1 {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    timezone: null,
    conversationMetadata: {},
    messageMetadata: {},
    budget: {
      plannerCallsMax: 1,
      plannerCallsUsed: 1,
      llmRepairCallsMaxPerAction: 2,
      llmRepairCallsMaxPerRequest: 2,
      syncRetriesMaxPerAction: 3,
      destructiveActionsMaxPerRequest: 1,
    },
    ...overrides,
  };
}

function createResolution(
  overrides: Partial<RuntimeResolutionSummaryV1> = {}
): RuntimeResolutionSummaryV1 {
  return {
    resolvedFields: [],
    missingFields: [],
    llmFields: [],
    blockedFields: [],
    ambiguousFields: [],
    ...overrides,
  };
}

function createAction(
  overrides: Partial<RuntimeActionV1> = {}
): RuntimeActionV1 {
  return {
    id: "action-1",
    type: "search_email",
    approvalMode: "auto",
    params: {
      query: {
        kind: "primitive",
        value: "factura",
      },
    },
    metadata: {},
    ...overrides,
  };
}

function createPolicyContext(
  overrides: Partial<RuntimePolicyContextV1> = {}
): RuntimePolicyContextV1 {
  return {
    hasAuth: true,
    organizationActive: true,
    agentActive: true,
    integrationActive: true,
    requiredScopesPresent: true,
    actionAllowedByPlan: true,
    actionAllowedByAgent: true,
    actionAllowedByOrganization: true,
    actionSupported: true,
    surfaceAllowed: true,
    channelAllowed: true,
    providerAllowed: true,
    integrationAllowed: true,
    ...overrides,
  };
}

async function runReadExecutesTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction(),
    resolution: createResolution({
      resolvedFields: ["query"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "success");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.decision, "execute");
}

async function runWriteRequiresApprovalTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "send_email",
      approvalMode: "required",
      params: {
        to: { kind: "primitive", value: ["ana@example.com"] },
        subject: { kind: "primitive", value: "Seguimiento" },
        body: { kind: "primitive", value: "Hola" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["to", "subject", "body"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "success");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.reason, "approval_required");
  assert.equal(result.decision, "enqueue_approval");
}

async function runMissingCriticalNeedsUserTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "create_event",
      approvalMode: "required",
      params: {
        title: { kind: "primitive", value: "Demo" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["title"],
      missingFields: ["start"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "missing_start");
  assert.equal(result.decision, "ask_user");
}

async function runAmbiguousNeedsUserTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "summarize_thread",
      params: {
        threadRef: {
          kind: "reference",
          refType: "thread",
          value: "ese hilo",
        },
      },
    }),
    resolution: createResolution({
      ambiguousFields: ["threadRef"],
      missingFields: ["threadRef"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "ambiguous_threadRef");
  assert.equal(result.decision, "ask_user");
}

async function runBlockedWhenAuthOrScopeMissingTest(): Promise<void> {
  const noAuth = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction(),
    resolution: createResolution({
      resolvedFields: ["query"],
    }),
    policyContext: createPolicyContext({
      hasAuth: false,
    }),
  });
  const noScope = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction(),
    resolution: createResolution({
      resolvedFields: ["query"],
    }),
    policyContext: createPolicyContext({
      requiredScopesPresent: false,
    }),
  });

  assert.equal(noAuth.status, "blocked");
  assert.equal(noAuth.reason, "missing_auth");
  assert.equal(noAuth.decision, "block");
  assert.equal(noScope.status, "blocked");
  assert.equal(noScope.reason, "scope_missing");
  assert.equal(noScope.decision, "block");
}

async function runNeedsLlmOnlyForNonCriticalFieldsTest(): Promise<void> {
  const allowed = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "create_event",
      approvalMode: "required",
      params: {
        title: { kind: "primitive", value: "Demo" },
        start: { kind: "time", value: "2026-03-18T15:00:00", granularity: "datetime" },
        end: { kind: "time", value: "2026-03-18T15:30:00", granularity: "datetime" },
        description: { kind: "unknown", reason: "draft_requested" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["title", "start", "end"],
      llmFields: ["description"],
    }),
    policyContext: createPolicyContext({
      estimatedLlmCost: 0.01,
      availableTurnBudget: 0.05,
    }),
  });

  const denied = evaluateRuntimeActionPolicyV1({
    ctx: createContext({
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 1,
        llmRepairCallsMaxPerAction: 0,
        syncRetriesMaxPerAction: 3,
      },
    }),
    action: createAction({
      type: "send_email",
      approvalMode: "required",
      params: {
        to: { kind: "unknown", reason: "missing_to" },
        subject: { kind: "primitive", value: "Seguimiento" },
        body: { kind: "unknown", reason: "draft_requested" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["subject"],
      llmFields: ["to"],
      missingFields: ["to"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(allowed.status, "needs_llm");
  assert.equal(allowed.output.canUseLlmRepair, true);
  assert.equal(allowed.decision, "use_llm");
  assert.equal(denied.status, "needs_user");
  assert.match(denied.reason ?? "", /missing_to|sensitive_field_requires_user/);
}

async function runSensitiveLlmFieldNeedsUserTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "create_task",
      approvalMode: "required",
      params: {
        subject: { kind: "primitive", value: "Follow up" },
        dueDate: { kind: "unknown", reason: "infer_due_date" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["subject"],
      llmFields: ["dueDate"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.decision, "ask_user");
  assert.equal(result.reason, "sensitive_field_requires_user:dueDate");
  assert.deepEqual(result.output.llmForbiddenFields, ["dueDate"]);
}

async function runTurnBudgetExceedBlocksTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "create_event",
      approvalMode: "required",
      params: {
        title: { kind: "primitive", value: "Demo" },
        start: { kind: "time", value: "2026-03-18T15:00:00", granularity: "datetime" },
        end: { kind: "time", value: "2026-03-18T15:30:00", granularity: "datetime" },
        description: { kind: "unknown", reason: "draft_requested" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["title", "start", "end"],
      llmFields: ["description"],
    }),
    policyContext: createPolicyContext({
      estimatedLlmCost: 0.2,
      availableTurnBudget: 0.05,
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "turn_budget_exceeded");
  assert.equal(result.decision, "block");
}

async function runConcurrencyLimitQueuesAsyncTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext({
      channel: "web",
      surface: "chat_web",
    }),
    action: createAction({
      type: "search_email",
    }),
    resolution: createResolution({
      resolvedFields: ["query"],
    }),
    policyContext: createPolicyContext({
      activeConcurrentRunsForOrganization: 3,
      maxConcurrentRunsForOrganization: 3,
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "organization_concurrency_limit_exceeded");
  assert.equal(result.decision, "queue_for_async");
}

async function runProviderThrottleRequestsRetryTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction(),
    resolution: createResolution({
      resolvedFields: ["query"],
    }),
    policyContext: createPolicyContext({
      providerBudgetDecision: "throttle",
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "provider_budget_throttled");
  assert.equal(result.decision, "retry");
}

async function runEstimatedPlanCostBlocksTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext(),
    action: createAction({
      type: "create_lead",
      approvalMode: "required",
      params: {
        lastName: { kind: "primitive", value: "Perez" },
        company: { kind: "primitive", value: "Acme" },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["lastName", "company"],
    }),
    policyContext: createPolicyContext({
      estimatedRunCostUsd: 2,
      maxEstimatedRunCostUsd: 1.5,
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "plan_cost_estimate_exceeds_budget");
  assert.equal(result.decision, "block");
}

async function runDestructiveActionLimitBlocksTest(): Promise<void> {
  const result = evaluateRuntimeActionPolicyV1({
    ctx: createContext({
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 1,
        llmRepairCallsMaxPerAction: 2,
        llmRepairCallsMaxPerRequest: 2,
        syncRetriesMaxPerAction: 3,
        destructiveActionsMaxPerRequest: 1,
        destructiveActionsUsedInRequest: 1,
      },
    }),
    action: createAction({
      type: "archive_thread",
      approvalMode: "required",
      params: {
        threadRef: {
          kind: "reference",
          refType: "thread",
          value: "thr_123",
        },
      },
    }),
    resolution: createResolution({
      resolvedFields: ["threadRef"],
    }),
    policyContext: createPolicyContext(),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.decision, "block");
  assert.equal(result.reason, "destructive_action_limit_exceeded");
}

async function runValidateNodeHandlerTest(): Promise<void> {
  const handler = createValidateNodeHandlerV1({
    getPolicyContext: () =>
      createPolicyContext({
        actionAllowedByPlan: false,
      }),
  });

  const result = await handler({
    ctx: createContext(),
    action: createAction({
      metadata: {
        resolution: createResolution({
          resolvedFields: ["query"],
        }),
      },
    }),
    node: "validate",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "plan_action_blocked");
  assert.deepEqual(result.policyDecision, {
    outcome: "block",
    reason: "plan_action_blocked",
  });
  assert.deepEqual(result.output, {
    resolvedFields: ["query"],
    missingFields: [],
    llmFields: [],
    blockedFields: [],
    ambiguousFields: [],
    requiresApproval: false,
    canUseLlmRepair: false,
    llmEligibleFields: [],
    llmForbiddenFields: [],
  });
}

async function main(): Promise<void> {
  await runReadExecutesTest();
  await runWriteRequiresApprovalTest();
  await runMissingCriticalNeedsUserTest();
  await runAmbiguousNeedsUserTest();
  await runBlockedWhenAuthOrScopeMissingTest();
  await runNeedsLlmOnlyForNonCriticalFieldsTest();
  await runSensitiveLlmFieldNeedsUserTest();
  await runTurnBudgetExceedBlocksTest();
  await runConcurrencyLimitQueuesAsyncTest();
  await runProviderThrottleRequestsRetryTest();
  await runEstimatedPlanCostBlocksTest();
  await runDestructiveActionLimitBlocksTest();
  await runValidateNodeHandlerTest();
  console.log("runtime policy-engine checks passed");
}

void main();
