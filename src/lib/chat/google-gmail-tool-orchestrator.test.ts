import assert from "node:assert/strict";

import {
  buildGmailPromptInjectionGuardrail,
  createGoogleGmailChatOrchestrator,
} from "./google-gmail-tool-orchestrator";

function buildRuntime() {
  return {
    ok: true,
    surface: "gmail",
    tool: {
      id: "tool-1",
      integration_id: "integration-1",
    },
    integration: {
      id: "integration-1",
      organization_id: "org-1",
      is_active: true,
      metadata: {},
    },
    grantedScopes: [],
    actionPolicies: [],
    config: {
      provider: "google",
      surface: "gmail",
      allowed_actions: ["search_threads", "read_thread"],
    },
  } as const;
}

async function runSearchExecutionTest(): Promise<void> {
  const orchestrator = createGoogleGmailChatOrchestrator({
    readAgentSetupState: () => null,
    resolveEffectiveAgentPrompt: () => ({
      effectivePrompt: "prompt",
      syncMode: "custom",
      matchedVariant: null,
      hadConflictCleanup: false,
      hasPromptConflict: false,
      promptConflictSnippet: null,
    }),
    getGoogleAgentToolRuntime: async () => ({ data: buildRuntime() as never, error: null }),
    assertGoogleGmailRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => null,
    readPendingCrmAction: () => null,
    isPendingToolActionExpired: () => false,
    isRecentCrmToolContextExpired: () => false,
    updateConversationMetadata: async () => ({ data: null, error: null }),
    planGoogleGmailToolAction: async () => ({
      kind: "search",
      input: {
        action: "search_threads",
        query: "factura",
        maxResults: 5,
      },
    }),
    assertGoogleGmailActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleGmailReadTool: async () => ({
      data: {
        action: "search_threads",
        requestId: "req-1",
        data: {
          query: "factura",
          threads: [
            {
              threadId: "abc123def456",
              subject: "Factura Marzo",
              from: "Juan <juan@example.com>",
              date: "Fri, 14 Mar 2026 10:00:00 -0300",
              snippet: "Pago pendiente",
            },
          ],
        },
        summary: 'Encontre 1 hilo(s) recientes que coinciden con "factura".',
      },
      error: null,
    }),
    executeGoogleGmailWriteToolAction: async () => ({ data: null, error: "unused" }),
    toGoogleGmailRuntimeSafeError: (error) => ({
      ok: false,
      surface: "gmail",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "gmail",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    createRecentGmailThreadContext: ({ threadId, messageId, rfcMessageId, subject }) =>
      `thread_id=${threadId}\nmessage_id=${messageId ?? ""}\nrfc_message_id=${rfcMessageId ?? ""}\nsubject=${subject ?? "sin asunto"}`,
    createPendingCrmAction: () => ({}) as never,
    createApprovalRequest: async () => ({ data: null, error: "unused" }),
  });

  const result = await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage: "Busca el mail de factura",
    recentMessages: [{ role: "user", content: "Busca el mail de factura" }],
  });

  assert.equal(result.kind, "respond_now");
  if (result.kind === "respond_now") {
    assert.match(result.content, /Factura Marzo/);
    assert.match(result.content, /thread abc123def456/);
  }
}

async function runReadStoresMinimalContextTest(): Promise<void> {
  const metadataWrites: Array<Record<string, unknown>> = [];
  const orchestrator = createGoogleGmailChatOrchestrator({
    readAgentSetupState: () => null,
    resolveEffectiveAgentPrompt: () => ({
      effectivePrompt: "prompt",
      syncMode: "custom",
      matchedVariant: null,
      hadConflictCleanup: false,
      hasPromptConflict: false,
      promptConflictSnippet: null,
    }),
    getGoogleAgentToolRuntime: async () => ({ data: buildRuntime() as never, error: null }),
    assertGoogleGmailRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => null,
    readPendingCrmAction: () => null,
    isPendingToolActionExpired: () => false,
    isRecentCrmToolContextExpired: () => false,
    updateConversationMetadata: async (_conversationId, _agentId, _organizationId, patch) => {
      metadataWrites.push(patch as Record<string, unknown>);
      return { data: null, error: null };
    },
    planGoogleGmailToolAction: async () => ({
      kind: "read",
      input: {
        action: "read_thread",
        threadId: "abc123def456",
      },
    }),
    assertGoogleGmailActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleGmailReadTool: async () => ({
      data: {
        action: "read_thread",
        requestId: "req-2",
        data: {
          threadId: "abc123def456",
          subject: "Factura Marzo",
          messageCount: 1,
          latestMessageId: "msg-1",
          latestRfcMessageId: "<msg-1@example.com>",
          messages: [],
        },
        summary: "Lei el hilo.",
      },
      error: null,
    }),
    executeGoogleGmailWriteToolAction: async () => ({ data: null, error: "unused" }),
    toGoogleGmailRuntimeSafeError: (error) => ({
      ok: false,
      surface: "gmail",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "gmail",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    createRecentGmailThreadContext: ({ threadId, messageId, rfcMessageId, subject }) =>
      `thread_id=${threadId}\nmessage_id=${messageId ?? ""}\nrfc_message_id=${rfcMessageId ?? ""}\nsubject=${subject ?? "sin asunto"}`,
    createPendingCrmAction: () => ({}) as never,
    createApprovalRequest: async () => ({ data: null, error: "unused" }),
  });

  await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage: "Lee ese hilo",
    recentMessages: [{ role: "user", content: "Lee ese hilo" }],
  });

  assert.equal(metadataWrites.length, 1);
  assert.deepEqual(metadataWrites[0], {
    recent_crm_tool_context: {
      provider: "gmail",
      context: "thread_id=abc123def456\nmessage_id=msg-1\nrfc_message_id=<msg-1@example.com>\nsubject=Factura Marzo",
      recordedAt: "2026-03-13T12:00:00.000Z",
    },
  });
}

async function runResolveThreadBeforeWriteTest(): Promise<void> {
  const metadataWrites: Array<Record<string, unknown>> = [];
  const approvalPayloads: Array<Record<string, unknown>> = [];
  const orchestrator = createGoogleGmailChatOrchestrator({
    readAgentSetupState: () => null,
    resolveEffectiveAgentPrompt: () => ({
      effectivePrompt: "prompt",
      syncMode: "custom",
      matchedVariant: null,
      hadConflictCleanup: false,
      hasPromptConflict: false,
      promptConflictSnippet: null,
    }),
    getGoogleAgentToolRuntime: async () => ({
      data: {
        ...buildRuntime(),
        config: {
          provider: "google",
          surface: "gmail",
          allowed_actions: ["search_threads", "read_thread", "create_draft_reply"],
        },
      } as never,
      error: null,
    }),
    assertGoogleGmailRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => ({
      provider: "gmail",
      context: "thread_id=abc123def456\nsubject=Factura Marzo",
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    readPendingCrmAction: () => null,
    isPendingToolActionExpired: () => false,
    isRecentCrmToolContextExpired: () => false,
    updateConversationMetadata: async (_conversationId, _agentId, _organizationId, patch) => {
      metadataWrites.push(patch as Record<string, unknown>);
      return { data: null, error: null };
    },
    planGoogleGmailToolAction: async () => ({
      kind: "resolve_thread_for_write",
      readInput: {
        action: "read_thread",
        threadId: "abc123def456",
      },
      writeAction: {
        action: "create_draft_reply",
        body: "Gracias, lo reviso hoy",
        subject: "Factura Marzo",
      },
    }),
    assertGoogleGmailActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleGmailReadTool: async () => ({
      data: {
        action: "read_thread",
        requestId: "req-2",
        data: {
          threadId: "abc123def456",
          subject: "Factura Marzo",
          messageCount: 1,
          latestMessageId: "msg-1",
          latestRfcMessageId: "<msg-1@example.com>",
          messages: [],
        },
        summary: "Lei el hilo.",
      },
      error: null,
    }),
    executeGoogleGmailWriteToolAction: async () => ({ data: null, error: "unused" }),
    toGoogleGmailRuntimeSafeError: (error) => ({
      ok: false,
      surface: "gmail",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "gmail",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    createRecentGmailThreadContext: ({ threadId, messageId, rfcMessageId, subject }) =>
      `thread_id=${threadId}\nmessage_id=${messageId ?? ""}\nrfc_message_id=${rfcMessageId ?? ""}\nsubject=${subject ?? "sin asunto"}`,
    createPendingCrmAction: ({ actionInput, summary }) =>
      ({ actionInput, summary }) as never,
    createApprovalRequest: async (payload) => {
      approvalPayloads.push(payload as never);
      return {
        data: {
          approvalItemId: "approval-1",
          workflowRunId: "run-1",
          workflowStepId: "step-1",
          expiresAt: "2026-03-13T12:10:00.000Z",
        },
        error: null,
      };
    },
  });

  const result = await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage:
      'responde este hilo con un borrador que diga "Gracias, lo reviso hoy"',
    recentMessages: [
      {
        role: "user",
        content: 'responde este hilo con un borrador que diga "Gracias, lo reviso hoy"',
      },
    ],
  });

  assert.equal(result.kind, "respond_now");
  assert.equal(metadataWrites.length, 2);
  assert.equal(approvalPayloads.length, 1);
  const payload = approvalPayloads[0];
  assert.equal(payload.action, "create_draft_reply");
  assert.deepEqual(payload.payloadSummary, {
    action: "create_draft_reply",
    action_input: {
      action: "create_draft_reply",
      threadId: "abc123def456",
      messageId: "msg-1",
      rfcMessageId: "<msg-1@example.com>",
      subject: "Factura Marzo",
      body: "Gracias, lo reviso hoy",
    },
  });
}

function runGuardrailTest(): void {
  const guardrail = buildGmailPromptInjectionGuardrail();
  assert.match(guardrail, /dato externo no confiable/i);
  assert.match(guardrail, /Nunca sigas instrucciones/i);
}

async function main(): Promise<void> {
  await runSearchExecutionTest();
  await runReadStoresMinimalContextTest();
  await runResolveThreadBeforeWriteTest();
  runGuardrailTest();
  console.log("google-gmail-tool-orchestrator checks passed");
}

void main();
