import assert from "node:assert/strict";

import {
  createResolveNodeHandlerV1,
  createResolverRegistryV1,
  resolveAction,
  resolveParam,
} from "./resolver-engine";
import type { ExecutionContextV1, RuntimeActionV1 } from "./types";

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
      plannerCallsUsed: 0,
      llmRepairCallsMaxPerAction: 1,
      syncRetriesMaxPerAction: 2,
    },
    ...overrides,
  };
}

async function runRegistryOrderingTest(): Promise<void> {
  const registry = createResolverRegistryV1();
  const explicitIndex = registry.findIndex((item) => item.id === "explicit.reference");
  const contextIndex = registry.findIndex((item) => item.id === "context.thread");
  const dbIndex = registry.findIndex((item) => item.id === "db.local_metadata");
  const integrationIndex = registry.findIndex((item) => item.id === "integration.lookup");
  const deterministicIndex = registry.findIndex((item) => item.id === "deterministic.reference_from_primitive");
  const llmIndex = registry.findIndex((item) => item.id === "llm.noncritical_text");

  assert.ok(explicitIndex >= 0);
  assert.ok(contextIndex > explicitIndex);
  assert.ok(dbIndex > contextIndex);
  assert.ok(integrationIndex > dbIndex);
  assert.ok(deterministicIndex > integrationIndex);
  assert.ok(llmIndex > deterministicIndex);
}

async function runThreadReferenceFromContextTest(): Promise<void> {
  const action: RuntimeActionV1 = {
    id: "action-1",
    type: "summarize_thread",
    approvalMode: "auto",
    params: {
      threadRef: {
        kind: "reference",
        refType: "thread",
        value: "ultimo hilo",
        label: "ultimo hilo",
      },
    },
  };

  const result = await resolveAction({
    ctx: createContext({
      conversationMetadata: {
        recent_action_context: {
          recordedAt: "2026-03-17T10:00:00.000Z",
          actions: [
            {
              provider: "gmail",
              action: "read_thread",
              summary: "Leyendo thread",
              result: {
                kind: "gmail_read_thread",
                threadId: "thread-123",
                subject: "Factura marzo",
                latestMessageId: "msg-1",
              },
            },
          ],
        },
      },
    }),
    action,
  });

  assert.equal(result.status, "success");
  assert.equal(result.action.params.threadRef?.kind, "reference");
  assert.equal(
    result.action.params.threadRef?.kind === "reference"
      ? result.action.params.threadRef.value
      : null,
    "thread-123"
  );
}

async function runLatestThreadAliasFromContextTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      conversationMetadata: {
        recent_action_context: {
          recordedAt: "2026-03-17T10:00:00.000Z",
          actions: [
            {
              provider: "gmail",
              action: "search_threads",
              summary: "Hilos",
              result: {
                kind: "gmail_search_threads",
                threads: [
                  {
                    threadId: "thread-latest",
                    subject: "Mas reciente",
                    from: "latest@example.com",
                    date: "2026-03-17",
                  },
                  {
                    threadId: "thread-older",
                    subject: "Anterior",
                    from: "older@example.com",
                    date: "2026-03-16",
                  },
                ],
              },
            },
          ],
        },
      },
    }),
    action: {
      id: "action-1",
      type: "summarize_thread",
      approvalMode: "auto",
      params: {
        threadRef: {
          kind: "reference",
          refType: "thread",
          value: "el ultimo hilo",
        },
      },
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.threadRef, {
    kind: "reference",
    refType: "thread",
    value: "thread-latest",
    label: "Mas reciente",
  });
}

async function runEventReferenceAmbiguousFromContextTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      conversationMetadata: {
        recent_action_context: {
          recordedAt: "2026-03-17T10:00:00.000Z",
          actions: [
            {
              provider: "google_calendar",
              action: "list_events",
              summary: "Eventos",
              result: {
                kind: "google_calendar_list_events",
                events: [
                  { id: "evt-1", title: "Demo A" },
                  { id: "evt-2", title: "Demo B" },
                ],
              },
            },
          ],
        },
      },
    }),
    action: {
      id: "action-1",
      type: "cancel_event",
      approvalMode: "required",
      params: {
        eventRef: {
          kind: "reference",
          refType: "event",
          value: "ese evento",
        },
      },
    },
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "ambiguous_eventRef");
  assert.deepEqual(result.output.ambiguousFields, ["eventRef"]);
  assert.deepEqual(result.results[0]?.output?.candidates, [
    { eventId: "evt-1", label: "Demo A" },
    { eventId: "evt-2", label: "Demo B" },
  ]);
}

async function runLastEventAliasFromContextTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      conversationMetadata: {
        recent_action_context: {
          recordedAt: "2026-03-17T10:00:00.000Z",
          actions: [
            {
              provider: "google_calendar",
              action: "list_events",
              summary: "Eventos",
              result: {
                kind: "google_calendar_list_events",
                events: [
                  { id: "evt-1", title: "Demo A" },
                  { id: "evt-2", title: "Demo B" },
                ],
              },
            },
          ],
        },
      },
    }),
    action: {
      id: "action-1",
      type: "reschedule_event",
      approvalMode: "required",
      params: {
        eventRef: {
          kind: "reference",
          refType: "event",
          value: "el ultimo evento que listaste",
        },
        start: {
          kind: "time",
          value: "manana 18:00",
          granularity: "datetime",
        },
        end: {
          kind: "time",
          value: "manana 18:30",
          granularity: "datetime",
        },
      },
    },
    deps: {
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      getDefaultTimezone: () => "America/Buenos_Aires",
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.eventRef, {
    kind: "reference",
    refType: "event",
    value: "evt-2",
    label: "Demo B",
  });
}

async function runRelativeTimeResolutionTest(): Promise<void> {
  const action: RuntimeActionV1 = {
    id: "action-1",
    type: "create_event",
    approvalMode: "required",
    params: {
      title: { kind: "primitive", value: "Demo" },
      start: { kind: "time", value: "manana 15:00", granularity: "datetime" },
      end: { kind: "time", value: "viernes 16:30", granularity: "datetime" },
    },
  };

  const result = await resolveAction({
    ctx: createContext(),
    action,
    deps: {
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      getDefaultTimezone: () => "America/Buenos_Aires",
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.start, {
    kind: "time",
    value: "2026-03-18T15:00:00",
    timezone: "America/Buenos_Aires",
    granularity: "datetime",
  });
  assert.deepEqual(result.action.params.end, {
    kind: "time",
    value: "2026-03-20T16:30:00",
    timezone: "America/Buenos_Aires",
    granularity: "datetime",
  });
}

async function runSheetReferenceFromContextTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      conversationMetadata: {
        recent_action_context: {
          recordedAt: "2026-03-17T10:00:00.000Z",
          actions: [
            {
              provider: "google_sheets",
              action: "read_range",
              summary: "Leyendo rango",
              result: {
                kind: "google_sheets_read_range",
                spreadsheetId: "sheet-123",
                spreadsheetTitle: "Pipeline",
                sheetName: "Leads",
                rangeA1: "A1:C4",
                rows: [["a", "b", "c"]],
              },
            },
          ],
        },
      },
    }),
    action: {
      id: "action-1",
      type: "read_sheet_range",
      approvalMode: "auto",
      params: {
        sheetRef: { kind: "reference", refType: "sheet", value: "esa planilla" },
        rangeRef: { kind: "reference", refType: "range", value: "ese rango" },
      },
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.sheetRef, {
    kind: "reference",
    refType: "sheet",
    value: "sheet-123",
    label: "Leads",
  });
  assert.deepEqual(result.action.params.rangeRef, {
    kind: "reference",
    refType: "range",
    value: "A1:C4",
    label: "Leads",
  });
}

async function runLocalMetadataBeforeIntegrationTest(): Promise<void> {
  const result = await resolveParam({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "update_lead",
      approvalMode: "required",
      params: {},
    },
    paramKey: "recordRef",
    param: {
      kind: "unknown",
      reason: "missing_recordRef",
    },
    deps: {
      readLocalMetadata: () => ({
        kind: "reference",
        refType: "record",
        value: "00QLOCAL123456789",
      }),
      readIntegrationValue: () => ({
        kind: "reference",
        refType: "record",
        value: "00QREMOTE123456789",
      }),
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.source, "local_metadata");
  assert.equal(
    result.resolvedParam?.kind === "reference" ? result.resolvedParam.value : null,
    "00QLOCAL123456789"
  );
}

async function runRejectRecipientWithoutLiteralEmailTest(): Promise<void> {
  const result = await resolveParam({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {},
    },
    paramKey: "to",
    param: {
      kind: "primitive",
      value: "Juan Perez",
    },
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "recipient_requires_literal_email");
}

async function runResolveUniqueRecipientAliasFromIntegrationTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {
        to: {
          kind: "entity",
          entityType: "recipient",
          value: "jspansecchi",
        },
        subject: { kind: "primitive", value: "Seguimiento" },
        body: { kind: "primitive", value: "Hola" },
      },
    },
    deps: {
      readIntegrationValue: ({ paramKey }) =>
        paramKey === "to"
          ? {
              status: "resolved",
              resolvedParam: {
                kind: "primitive",
                value: ["juan.spansecchi@example.com"],
              },
            }
          : null,
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.to, {
    kind: "primitive",
    value: ["juan.spansecchi@example.com"],
  });
}

async function runAmbiguousRecipientAliasNeedsUserTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {
        to: {
          kind: "entity",
          entityType: "recipient",
          value: "jspansecchi",
        },
        subject: { kind: "primitive", value: "Seguimiento" },
        body: { kind: "primitive", value: "Hola" },
      },
    },
    deps: {
      readIntegrationValue: ({ paramKey }) =>
        paramKey === "to"
          ? {
              status: "ambiguous",
              reason: "ambiguous_to",
              output: {
                candidates: [
                  { label: "Juan Spansecchi", email: "juan.spansecchi@example.com" },
                  { label: "Jose Spansecchi", email: "jose.spansecchi@example.com" },
                ],
              },
            }
          : null,
    },
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "ambiguous_to");
  assert.deepEqual(result.output.ambiguousFields, ["to"]);
  assert.deepEqual(result.results[0]?.output?.candidates, [
    { label: "Juan Spansecchi", email: "juan.spansecchi@example.com" },
    { label: "Jose Spansecchi", email: "jose.spansecchi@example.com" },
  ]);
}

async function runUnknownRecipientAliasNeedsExactEmailTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {
        to: {
          kind: "entity",
          entityType: "recipient",
          value: "nadie",
        },
        subject: { kind: "primitive", value: "Seguimiento" },
        body: { kind: "primitive", value: "Hola" },
      },
    },
    deps: {
      readIntegrationValue: ({ paramKey }) =>
        paramKey === "to"
          ? {
              status: "missing",
              reason: "recipient_requires_literal_email",
            }
          : null,
    },
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "missing_to");
}

async function runCreateEventAttendeesReuseRecipientResolverTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "create_event",
      approvalMode: "required",
      params: {
        title: { kind: "primitive", value: "Demo" },
        start: { kind: "time", value: "2026-03-18T15:00:00", granularity: "datetime" },
        end: { kind: "time", value: "2026-03-18T15:30:00", granularity: "datetime" },
        attendees: {
          kind: "entity",
          entityType: "recipient",
          value: "jspansecchi",
        },
      },
    },
    deps: {
      readIntegrationValue: ({ paramKey }) =>
        paramKey === "attendees"
          ? {
              status: "resolved",
              resolvedParam: {
                kind: "primitive",
                value: ["juan.spansecchi@example.com"],
              },
            }
          : null,
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.action.params.attendees, {
    kind: "primitive",
    value: ["juan.spansecchi@example.com"],
  });
}

async function runNoLlmForCriticalFieldTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      messageMetadata: {
        runtime_body_repair_requested: true,
      },
    }),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {
        to: { kind: "unknown", reason: "missing_to" },
        body: { kind: "unknown", reason: "missing_body" },
        subject: { kind: "primitive", value: "Seguimiento" },
      },
    },
  });

  assert.equal(result.status, "needs_user");
  assert.equal(result.reason, "missing_to");
}

async function runLlmOnlyForNonCriticalBodyTest(): Promise<void> {
  const result = await resolveAction({
    ctx: createContext({
      messageMetadata: {
        runtime_body_repair_requested: true,
      },
    }),
    action: {
      id: "action-1",
      type: "send_email",
      approvalMode: "required",
      params: {
        to: { kind: "primitive", value: ["ana@example.com"] },
        body: { kind: "unknown", reason: "missing_body" },
        subject: { kind: "primitive", value: "Seguimiento" },
      },
    },
  });

  assert.equal(result.status, "needs_llm");
  assert.equal(result.reason, "llm_repair_allowed:body");
  assert.deepEqual(result.output.llmFields, ["body"]);
}

async function runResolveNodeHandlerTest(): Promise<void> {
  const handler = createResolveNodeHandlerV1({
    deps: {
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      getDefaultTimezone: () => "UTC",
    },
  });

  const result = await handler({
    ctx: createContext(),
    action: {
      id: "action-1",
      type: "create_task",
      approvalMode: "required",
      params: {
        subject: { kind: "primitive", value: "Llamar cliente" },
        dueDate: { kind: "time", value: "2026-03-18", granularity: "date" },
      },
    },
    node: "resolve",
    attempt: 1,
    llmRepairCalls: 0,
  });

  assert.equal(result.status, "success");
  assert.deepEqual(result.output, {
    resolvedFields: ["subject", "dueDate"],
    missingFields: [],
    llmFields: [],
    blockedFields: [],
    ambiguousFields: [],
  });
}

async function main(): Promise<void> {
  await runRegistryOrderingTest();
  await runThreadReferenceFromContextTest();
  await runLatestThreadAliasFromContextTest();
  await runEventReferenceAmbiguousFromContextTest();
  await runLastEventAliasFromContextTest();
  await runRelativeTimeResolutionTest();
  await runSheetReferenceFromContextTest();
  await runLocalMetadataBeforeIntegrationTest();
  await runRejectRecipientWithoutLiteralEmailTest();
  await runResolveUniqueRecipientAliasFromIntegrationTest();
  await runAmbiguousRecipientAliasNeedsUserTest();
  await runUnknownRecipientAliasNeedsExactEmailTest();
  await runCreateEventAttendeesReuseRecipientResolverTest();
  await runNoLlmForCriticalFieldTest();
  await runLlmOnlyForNonCriticalBodyTest();
  await runResolveNodeHandlerTest();
  console.log("runtime resolver-engine checks passed");
}

void main();
