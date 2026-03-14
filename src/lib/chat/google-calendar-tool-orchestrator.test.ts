import assert from "node:assert/strict";

import { createGoogleCalendarChatOrchestrator } from "./google-calendar-tool-orchestrator";

function buildRuntime() {
  return {
    ok: true,
    surface: "google_calendar",
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
      surface: "google_calendar",
      allowed_actions: ["check_availability", "list_events"],
    },
  } as const;
}

async function runSimpleExecutionTest(): Promise<void> {
  const metadataWrites: Array<Record<string, unknown>> = [];
  const orchestrator = createGoogleCalendarChatOrchestrator({
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
    assertGoogleCalendarRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => null,
    isPendingToolActionExpired: () => false,
    updateConversationMetadata: async (_conversationId, _agentId, _organizationId, patch) => {
      metadataWrites.push(patch as Record<string, unknown>);
      return { data: null, error: null };
    },
    planGoogleCalendarToolAction: () => ({
      kind: "action",
      requiresConfirmation: false,
      input: {
        action: "list_events",
        startIso: "2026-03-14T00:00:00.000Z",
        endIso: "2026-03-15T00:00:00.000Z",
        timezone: "UTC",
      },
    }),
    resolveGoogleCalendarAgentTimezone: () => "UTC",
    resolveGoogleCalendarIntegrationTimezone: async () => ({
      data: { primaryTimezone: "UTC", userTimezone: "UTC", detectedTimezone: "UTC" },
      error: null,
    }),
    assertGoogleCalendarActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleCalendarReadTool: async () => ({
      data: {
        action: "list_events",
        requestId: "req-1",
        data: {
          calendarId: "primary",
          timezone: "UTC",
          startIso: "2026-03-14T00:00:00.000Z",
          endIso: "2026-03-15T00:00:00.000Z",
          maxResults: 10,
          events: [],
        },
        summary: "found 0 events",
      },
      error: null,
    }),
    toGoogleCalendarRuntimeSafeError: (error) => ({
      ok: false,
      surface: "google_calendar",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    formatGoogleCalendarReadResultForPrompt: () =>
      "GOOGLE_CALENDAR_TOOL_RESULT\naction=list_events",
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "google_calendar",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    readPendingCrmAction: () => null,
    createPendingCrmAction: (input) => ({
      provider: input.provider,
      tool: input.toolName,
      integrationId: input.integrationId,
      initiatedBy: input.initiatedBy,
      summary: input.summary,
      actionInput: input.actionInput,
      createdAt: "2026-03-13T12:00:00.000Z",
      expiresAt: "2026-03-13T12:10:00.000Z",
    }),
    createApprovalRequest: async () => ({ data: null, error: "unused" }),
  });

  const result = await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage: "Que tengo manana?",
    recentMessages: [{ role: "user", content: "Que tengo manana?" }],
  });

  assert.equal(result.kind, "respond_now");
  if (result.kind !== "respond_now") {
    return;
  }

  assert.match(result.content, /No encontre eventos|Encontre 0 evento/);
  assert.equal(metadataWrites.length, 1);
}

async function runAmbiguousQueryTest(): Promise<void> {
  const orchestrator = createGoogleCalendarChatOrchestrator({
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
    assertGoogleCalendarRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => null,
    isPendingToolActionExpired: () => false,
    updateConversationMetadata: async () => ({ data: null, error: null }),
    planGoogleCalendarToolAction: () => ({
      kind: "missing_data",
      message: "Necesito una fecha mas precisa.",
    }),
    resolveGoogleCalendarAgentTimezone: () => "UTC",
    resolveGoogleCalendarIntegrationTimezone: async () => ({
      data: { primaryTimezone: null, userTimezone: null, detectedTimezone: null },
      error: null,
    }),
    assertGoogleCalendarActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleCalendarReadTool: async () => ({ data: null, error: "unused" }),
    toGoogleCalendarRuntimeSafeError: (error) => ({
      ok: false,
      surface: "google_calendar",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    formatGoogleCalendarReadResultForPrompt: () => "unused",
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "google_calendar",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    readPendingCrmAction: () => null,
    createPendingCrmAction: (input) => ({
      provider: input.provider,
      tool: input.toolName,
      integrationId: input.integrationId,
      initiatedBy: input.initiatedBy,
      summary: input.summary,
      actionInput: input.actionInput,
      createdAt: "2026-03-13T12:00:00.000Z",
      expiresAt: "2026-03-13T12:10:00.000Z",
    }),
    createApprovalRequest: async () => ({ data: null, error: "unused" }),
  });

  const result = await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage: "Mirame el calendario",
    recentMessages: [{ role: "user", content: "Mirame el calendario" }],
  });

  assert.deepEqual(result, {
    kind: "respond_now",
    content: "Necesito una fecha mas precisa.",
  });
}

async function runReauthGuidanceTest(): Promise<void> {
  const orchestrator = createGoogleCalendarChatOrchestrator({
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
        ok: false,
        surface: "google_calendar",
        code: "integration_unavailable",
        message: "La integracion necesita reautenticacion antes de volver a operar.",
      } as never,
      error: null,
    }),
    assertGoogleCalendarRuntimeUsable: () => ({ data: null, error: "unused" }),
    readRecentCrmToolContext: () => null,
    isPendingToolActionExpired: () => false,
    updateConversationMetadata: async () => ({ data: null, error: null }),
    planGoogleCalendarToolAction: () => ({
      kind: "respond",
    }),
    resolveGoogleCalendarAgentTimezone: () => "UTC",
    resolveGoogleCalendarIntegrationTimezone: async () => ({
      data: { primaryTimezone: null, userTimezone: null, detectedTimezone: null },
      error: null,
    }),
    assertGoogleCalendarActionEnabled: () => ({ data: null, error: "unused" }),
    executeGoogleCalendarReadTool: async () => ({ data: null, error: "unused" }),
    toGoogleCalendarRuntimeSafeError: (error) => ({
      ok: false,
      surface: "google_calendar",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    formatGoogleCalendarReadResultForPrompt: () => "unused",
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "google_calendar",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    readPendingCrmAction: () => null,
    createPendingCrmAction: (input) => ({
      provider: input.provider,
      tool: input.toolName,
      integrationId: input.integrationId,
      initiatedBy: input.initiatedBy,
      summary: input.summary,
      actionInput: input.actionInput,
      createdAt: "2026-03-13T12:00:00.000Z",
      expiresAt: "2026-03-13T12:10:00.000Z",
    }),
    createApprovalRequest: async () => ({ data: null, error: "unused" }),
  });

  const result = await orchestrator({
    agent: { id: "agent-1", system_prompt: "prompt" } as never,
    conversation: { id: "conversation-1", metadata: {} } as never,
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    latestUserMessage: "Que tengo manana?",
    recentMessages: [{ role: "user", content: "Que tengo manana?" }],
  });

  assert.deepEqual(result, {
    kind: "respond_now",
    content:
      "Google Calendar necesita que Google Workspace se reconecte antes de volver a operar. Ve a Configuracion > Integraciones y reconecta la superficie de Calendar.",
  });
}

async function runApprovalSummaryIncludesResolvedEventTest(): Promise<void> {
  let capturedPayloadSummary: unknown = null;
  const pendingSummaries: string[] = [];

  const orchestrator = createGoogleCalendarChatOrchestrator({
    readAgentSetupState: () => ({
      workflowTemplateId: "calendar_assistant",
      automationPreset: "assisted",
    }) as never,
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
          surface: "google_calendar",
          allowed_actions: ["cancel_event", "reschedule_event", "list_events"],
        },
      } as never,
      error: null,
    }),
    assertGoogleCalendarRuntimeUsable: (runtime) => ({ data: runtime as never, error: null }),
    readRecentCrmToolContext: () => null,
    isPendingToolActionExpired: () => false,
    updateConversationMetadata: async () => ({ data: null, error: null }),
    planGoogleCalendarToolAction: () => ({
      kind: "action",
      requiresConfirmation: true,
      input: {
        action: "cancel_event",
        eventId: "evt-42",
        eventTitle: "Demo ACME",
        eventStartIso: "2026-03-14T13:00:00.000Z",
        eventEndIso: "2026-03-14T14:00:00.000Z",
        eventTimezone: "America/Buenos_Aires",
        location: "Zoom",
        description: "avisar al equipo",
        attendeeEmails: ["ops@example.com"],
      },
    }),
    resolveGoogleCalendarAgentTimezone: () => "America/Buenos_Aires",
    resolveGoogleCalendarIntegrationTimezone: async () => ({
      data: {
        primaryTimezone: "America/Buenos_Aires",
        userTimezone: "America/Buenos_Aires",
        detectedTimezone: "America/Buenos_Aires",
      },
      error: null,
    }),
    assertGoogleCalendarActionEnabled: (runtime) => ({ data: runtime as never, error: null }),
    executeGoogleCalendarReadTool: async () => ({ data: null, error: "unused" }),
    toGoogleCalendarRuntimeSafeError: (error) => ({
      ok: false,
      surface: "google_calendar",
      code: "provider_error",
      message: error,
      retryable: true,
    }),
    formatGoogleCalendarReadResultForPrompt: () => "unused",
    createRecentCrmToolContext: (_provider, context) => ({
      provider: "google_calendar",
      context,
      recordedAt: "2026-03-13T12:00:00.000Z",
    }),
    readPendingCrmAction: () => null,
    createPendingCrmAction: (input) => {
      pendingSummaries.push(input.summary);
      return {
        provider: input.provider,
        tool: input.toolName,
        integrationId: input.integrationId,
        initiatedBy: input.initiatedBy,
        summary: input.summary,
        actionInput: input.actionInput,
        createdAt: "2026-03-13T12:00:00.000Z",
        expiresAt: "2026-03-13T12:10:00.000Z",
      };
    },
    createApprovalRequest: async (approvalInput) => {
      capturedPayloadSummary = (
        approvalInput as unknown as { payloadSummary?: unknown }
      ).payloadSummary ?? null;
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
    latestUserMessage: "Cancela la demo de ACME",
    recentMessages: [{ role: "user", content: "Cancela la demo de ACME" }],
  });

  assert.equal(result.kind, "respond_now");
  assert.equal(pendingSummaries.length, 1);
  assert.match(pendingSummaries[0], /Demo ACME/);
  assert.match(pendingSummaries[0], /evt-42/);
  assert.ok(capturedPayloadSummary);

  const payloadSummary = capturedPayloadSummary as {
    action_input?: {
      location?: string;
      description?: string;
      attendeeEmails?: string[];
    };
    resolved_event?: { id?: string; title?: string };
  };
  assert.equal(payloadSummary.resolved_event?.id, "evt-42");
  assert.equal(payloadSummary.resolved_event?.title, "Demo ACME");
  assert.equal(payloadSummary.action_input?.location, "Zoom");
  assert.equal(payloadSummary.action_input?.description, "avisar al equipo");
  assert.deepEqual(payloadSummary.action_input?.attendeeEmails, ["ops@example.com"]);
}

async function main(): Promise<void> {
  await runSimpleExecutionTest();
  await runAmbiguousQueryTest();
  await runReauthGuidanceTest();
  await runApprovalSummaryIncludesResolvedEventTest();
  console.log("google-calendar-tool-orchestrator checks passed");
}

void main();
