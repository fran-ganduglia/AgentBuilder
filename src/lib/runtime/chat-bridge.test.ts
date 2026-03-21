import assert from "node:assert/strict";

import {
  buildRecentDeclarativeContextFromRuntime,
  buildRuntimeTraceSummary,
  renderRuntimeNonSuccessMessage,
  renderRuntimeSuccessMessage,
} from "./chat-bridge";
import type { ActionExecutionOutcomeV1, ActionPlanV1, ExecutionTraceV1 } from "./types";

function createAction(actionType: ActionExecutionOutcomeV1["actionType"]): ActionExecutionOutcomeV1 {
  return {
    actionId: "action-1",
    actionType,
    status: "success",
    action: {
      id: "action-1",
      type: actionType,
      approvalMode: actionType === "search_email" || actionType === "summarize_thread" ? "auto" : "required",
      params: {},
    },
    retries: 0,
    llmRepairCalls: 0,
    output: {},
  };
}

function createPlan(): ActionPlanV1 {
  return {
    version: 1,
    intent: "runtime_mvp",
    confidence: 0.92,
    missingFields: [],
    actions: [],
  };
}

function createTrace(actions: ExecutionTraceV1["actions"]): ExecutionTraceV1 {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    planVersion: 1,
    graph: ["normalize", "enrich", "resolve", "validate", "simulate", "execute", "postprocess"],
    actions,
    events: [],
  };
}

async function renderSearchThreadsTest(): Promise<void> {
  const message = renderRuntimeSuccessMessage({
    actionType: "search_email",
    output: {
      threads: [
        {
          threadId: "thread-1",
          subject: "Factura marzo",
          from: "ana@example.com",
          date: "2026-03-17",
          snippet: "Adjunto la factura",
        },
      ],
    },
  });

  assert.match(message, /Factura marzo/);
  assert.match(message, /ana@example.com/);
}

async function renderApprovalTest(): Promise<void> {
  const message = renderRuntimeSuccessMessage({
    actionType: "create_event",
    output: {
      preview: {
        title: "Demo",
        startIso: "2026-03-18T10:00:00-03:00",
        endIso: "2026-03-18T10:30:00-03:00",
      },
    },
  });

  assert.match(message, /solicitud de aprobaci/);
  assert.match(message, /Demo/);
}

async function runtimeTraceSummaryTest(): Promise<void> {
  const action = createAction("send_email");
  action.output = {
    approvalItemId: "11111111-1111-1111-1111-111111111111",
    workflowRunId: "22222222-2222-2222-2222-222222222222",
  };
  const summary = buildRuntimeTraceSummary({
    plan: createPlan(),
    trace: createTrace([{ ...action, nodeVisits: [] }]),
    outcome: "success",
    capturedAt: "2026-03-17T10:00:00.000Z",
  });

  assert.equal(summary.actions[0]?.approvalItemId, "11111111-1111-1111-1111-111111111111");
  assert.equal(summary.outcome, "success");
}

async function recentDeclarativeContextTest(): Promise<void> {
  const action = createAction("summarize_thread");
  action.output = {
    summary: "Hilo leÃ­do",
    evidence: {
      threadId: "thread-1",
      subject: "Seguimiento",
      latestMessageId: "msg-1",
    },
  };

  const recentContext = buildRecentDeclarativeContextFromRuntime({
    actions: [action],
  });

  assert.equal(recentContext?.actions[0]?.provider, "gmail");
  assert.equal(recentContext?.actions[0]?.result.kind, "gmail_read_thread");
}

async function recentCalendarListContextTest(): Promise<void> {
  const action = createAction("list_events");
  action.output = {
    summary: "Eventos leidos",
    evidence: {
      events: [
        {
          id: "evt-1",
          title: "Demo",
          startIso: "2026-03-18T10:00:00-03:00",
          endIso: "2026-03-18T10:30:00-03:00",
        },
      ],
    },
  };

  const recentContext = buildRecentDeclarativeContextFromRuntime({
    actions: [action],
  });

  assert.equal(recentContext?.actions[0]?.provider, "google_calendar");
  assert.equal(recentContext?.actions[0]?.result.kind, "google_calendar_list_events");
  assert.equal(
    recentContext?.actions[0]?.result.kind === "google_calendar_list_events"
      ? recentContext.actions[0].result.events[0]?.id
      : null,
    "evt-1"
  );
}

async function needsUserMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "send_email",
    status: "needs_user",
    reason: "missing_to",
  });

  assert.match(message, /email exacto del destinatario/);
}

async function ambiguousRecipientMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "send_email",
    status: "needs_user",
    reason: "ambiguous_to",
    output: {
      candidates: [
        { label: "Juan Spansecchi", email: "juan.spansecchi@example.com" },
        { label: "Jose Spansecchi", email: "jose.spansecchi@example.com" },
      ],
    },
  });

  assert.match(message, /Encontre 2 contactos/i);
  assert.match(message, /juan\.spansecchi@example\.com/i);
}

async function ambiguousEventMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "cancel_event",
    status: "needs_user",
    reason: "ambiguous_eventRef",
    output: {
      candidates: [
        { eventId: "evt-1", label: "Demo A" },
        { eventId: "evt-2", label: "Demo B" },
      ],
    },
  });

  assert.match(message, /Encontre 2 eventos recientes/i);
  assert.match(message, /Demo A/i);
  assert.match(message, /evt-1/i);
}

async function blockedPlanMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "send_email",
    status: "blocked",
    reason: "plan_action_blocked",
  });

  assert.match(message, /plan actual no la permite/i);
}

async function blockedProviderMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "send_email",
    status: "blocked",
    reason: "provider_blocked:gmail",
  });

  assert.match(message, /proveedor gmail/i);
}

async function blockedBudgetMessageTest(): Promise<void> {
  const message = renderRuntimeNonSuccessMessage({
    actionType: "send_email",
    status: "blocked",
    reason: "turn_budget_exceeded",
  });

  assert.match(message, /presupuesto disponible/i);
}

async function renderCalendarReadTest(): Promise<void> {
  const message = renderRuntimeSuccessMessage({
    actionType: "list_events",
    output: {
      evidence: {
        events: [
          {
            title: "Demo",
            startIso: "2026-03-18T10:00:00-03:00",
            endIso: "2026-03-18T10:30:00-03:00",
          },
        ],
      },
    },
  });

  assert.match(message, /Demo/);
  assert.match(message, /10:00:00/);
}

async function renderSalesforceApprovalTest(): Promise<void> {
  const message = renderRuntimeSuccessMessage({
    actionType: "create_lead",
    output: {
      preview: {
        lastName: "Perez",
        company: "Acme",
      },
    },
  });

  assert.match(message, /crear el lead Perez en Acme/i);
}

async function main(): Promise<void> {
  await renderSearchThreadsTest();
  await renderApprovalTest();
  await runtimeTraceSummaryTest();
  await recentDeclarativeContextTest();
  await recentCalendarListContextTest();
  await needsUserMessageTest();
  await ambiguousRecipientMessageTest();
  await ambiguousEventMessageTest();
  await blockedPlanMessageTest();
  await blockedProviderMessageTest();
  await blockedBudgetMessageTest();
  await renderCalendarReadTest();
  await renderSalesforceApprovalTest();
  console.log("runtime chat bridge checks passed");
}

void main();
