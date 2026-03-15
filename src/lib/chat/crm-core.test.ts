import assert from "node:assert/strict";

import { orchestrateCrmForChat } from "./crm-core";

type TestAction = {
  action: "lookup" | "update";
  recordId?: string;
};

type TestRuntime = {
  integration: { id: string };
};

type TestResult = {
  action: string;
  message: string;
};

async function runConfirmationFlowTest(): Promise<void> {
  const metadata: Record<string, unknown> = {};
  let executedAction: TestAction | null = null;

  const adapter = {
    provider: "salesforce",
    toolName: "salesforce_crm",
    loadRuntime: async () => ({ data: { integration: { id: "integration-1" } }, error: null }),
    isRuntimeUsable: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    planNextAction: async () => ({
      kind: "action" as const,
      requiresConfirmation: false,
      input: { action: "update", recordId: "deal-42" } satisfies TestAction,
    }),
    isActionAllowed: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    executeAction: async ({ actionInput }: { actionInput: TestAction }) => {
      executedAction = actionInput;
      return { data: { action: actionInput.action, message: `updated ${actionInput.recordId}` }, error: null };
    },
    formatResultForPrompt: (result: TestResult) => result.message,
    buildConfirmationSummary: (actionInput: TestAction) => `actualizar ${actionInput.recordId}`,
    isWriteAction: (action: TestAction["action"]) => action === "update",
    readConversationState: () => {
      const pendingAction = (metadata.pendingAction ?? null) as {
        provider: string;
        tool: string;
        integrationId: string;
        actionInput: TestAction;
        summary: string;
        initiatedBy: string;
        createdAt: string;
        expiresAt: string;
      } | null;

      return {
        pendingAction,
        recentToolContext: (metadata.recentToolContext as string | undefined) ?? undefined,
        hasExpiredPendingAction: false,
        hasExpiredRecentToolContext: false,
      };
    },
    writeConversationState: async (input: {
      pendingAction?: unknown;
      recentToolContext?: string | null;
    }) => {
      if (input.pendingAction !== undefined) {
        metadata.pendingAction = input.pendingAction;
      }

      if (input.recentToolContext !== undefined) {
        metadata.recentToolContext = input.recentToolContext;
      }
    },
  };

  const firstPass = await orchestrateCrmForChat({
    adapter,
    conversation: { id: "conversation-1", metadata: {} } as never,
    agentId: "agent-1",
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    systemPrompt: "prompt",
    latestUserMessage: "Actualiza el deal",
    recentMessages: [{ role: "user", content: "Actualiza el deal" }],
  });

  assert.equal(firstPass.kind, "respond_now");
  assert.match(firstPass.content, /confirmo/i);
  assert.equal((metadata.pendingAction as { actionInput?: TestAction } | undefined)?.actionInput?.action, "update");
  assert.equal(executedAction, null);

  const secondPass = await orchestrateCrmForChat({
    adapter,
    conversation: { id: "conversation-1", metadata: {} } as never,
    agentId: "agent-1",
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    systemPrompt: "prompt",
    latestUserMessage: "confirmo",
    recentMessages: [{ role: "user", content: "confirmo" }],
  });

  assert.equal(secondPass.kind, "continue");
  assert.equal(secondPass.hasUsableRuntime, true);
  assert.equal(secondPass.toolContext, "updated deal-42");
  assert.deepEqual(executedAction, { action: "update", recordId: "deal-42" });
  assert.equal(metadata.pendingAction, null);
  assert.equal(metadata.recentToolContext, "updated deal-42");
}

async function runReadOnlyFlowTest(): Promise<void> {
  let executed = 0;

  const adapter = {
    provider: "salesforce",
    toolName: "salesforce_crm",
    loadRuntime: async () => ({ data: { integration: { id: "integration-1" } }, error: null }),
    isRuntimeUsable: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    planNextAction: async () => ({
      kind: "action" as const,
      requiresConfirmation: false,
      input: { action: "lookup" } satisfies TestAction,
    }),
    isActionAllowed: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    executeAction: async () => {
      executed += 1;
      return { data: { action: "lookup", message: "lookup result" }, error: null };
    },
    formatResultForPrompt: (result: TestResult) => result.message,
    buildConfirmationSummary: () => "unused",
    isWriteAction: () => false,
    readConversationState: () => ({
      pendingAction: null,
      recentToolContext: undefined,
      hasExpiredPendingAction: false,
      hasExpiredRecentToolContext: false,
    }),
    writeConversationState: async () => undefined,
    maxRecursionDepth: 1,
  };

  const result = await orchestrateCrmForChat({
    adapter,
    conversation: { id: "conversation-2", metadata: {} } as never,
    agentId: "agent-1",
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    systemPrompt: "prompt",
    latestUserMessage: "Busca el deal",
    recentMessages: [{ role: "user", content: "Busca el deal" }],
  });

  assert.equal(result.kind, "continue");
  assert.equal(result.toolContext, "lookup result");
  assert.equal(executed, 1);
}

async function runApprovalInboxFlowTest(): Promise<void> {
  const metadata: Record<string, unknown> = {};
  let createApprovalCalls = 0;
  let executedAction: TestAction | null = null;

  const adapter = {
    provider: "salesforce",
    toolName: "salesforce_crm",
    loadRuntime: async () => ({ data: { integration: { id: "integration-1" } }, error: null }),
    isRuntimeUsable: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    planNextAction: async () => ({
      kind: "action" as const,
      requiresConfirmation: false,
      input: { action: "update", recordId: "opportunity-7" } satisfies TestAction,
    }),
    isActionAllowed: (runtime: TestRuntime) => ({ data: runtime, error: null }),
    executeAction: async ({ actionInput }: { actionInput: TestAction }) => {
      executedAction = actionInput;
      return { data: { action: actionInput.action, message: `updated ${actionInput.recordId}` }, error: null };
    },
    formatResultForPrompt: (result: TestResult) => result.message,
    buildConfirmationSummary: (actionInput: TestAction) => `actualizar ${actionInput.recordId}`,
    isWriteAction: (action: TestAction["action"]) => action === "update",
    readConversationState: () => ({
      pendingAction: (metadata.pendingAction as never) ?? null,
      recentToolContext: undefined,
      hasExpiredPendingAction: false,
      hasExpiredRecentToolContext: false,
    }),
    writeConversationState: async (input: {
      pendingAction?: unknown;
      recentToolContext?: string | null;
    }) => {
      if (input.pendingAction !== undefined) {
        metadata.pendingAction = input.pendingAction;
      }

      if (input.recentToolContext !== undefined) {
        metadata.recentToolContext = input.recentToolContext;
      }
    },
    createApprovalRequest: async () => {
      createApprovalCalls += 1;
      return {
        data: {
          approvalItemId: "approval-1",
          workflowRunId: "workflow-run-1",
          workflowStepId: "workflow-step-1",
          expiresAt: "2026-03-13T22:00:00.000Z",
        },
        error: null,
      };
    },
  };

  const firstPass = await orchestrateCrmForChat({
    adapter,
    conversation: { id: "conversation-3", metadata: {} } as never,
    agentId: "agent-1",
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    systemPrompt: "prompt",
    latestUserMessage: "Actualiza la oportunidad",
    recentMessages: [{ role: "user", content: "Actualiza la oportunidad" }],
  });

  assert.equal(firstPass.kind, "respond_now");
  assert.match(firstPass.content, /\/approvals/i);
  assert.equal(createApprovalCalls, 1);
  assert.equal(executedAction, null);
  assert.equal((metadata.pendingAction as { actionInput?: TestAction } | undefined)?.actionInput?.recordId, "opportunity-7");

  const secondPass = await orchestrateCrmForChat({
    adapter,
    conversation: { id: "conversation-3", metadata: {} } as never,
    agentId: "agent-1",
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    systemPrompt: "prompt",
    latestUserMessage: "confirmo",
    recentMessages: [{ role: "user", content: "confirmo" }],
  });

  assert.equal(secondPass.kind, "respond_now");
  assert.match(secondPass.content, /approval inbox/i);
  assert.equal(createApprovalCalls, 1);
  assert.equal(executedAction, null);
}

async function main(): Promise<void> {
  await runConfirmationFlowTest();
  await runReadOnlyFlowTest();
  await runApprovalInboxFlowTest();
  console.log("crm-core checks passed");
}

void main();
