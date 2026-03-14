import assert from "node:assert/strict";

import { resolveSetupState } from "@/lib/agents/agent-setup";
import type { GoogleCalendarAgentToolConfig } from "@/lib/integrations/google-agent-tools";
import {
  planGoogleCalendarToolAction,
} from "./google-calendar-tool-planner";
import { resolveGoogleCalendarAgentTimezone } from "@/lib/integrations/google-calendar-timezone";

const calendarConfig: GoogleCalendarAgentToolConfig = {
  provider: "google",
  surface: "google_calendar",
  allowed_actions: ["check_availability", "list_events"],
};

const calendarWriteConfig: GoogleCalendarAgentToolConfig = {
  provider: "google",
  surface: "google_calendar",
  allowed_actions: [
    "check_availability",
    "list_events",
    "create_event",
    "reschedule_event",
    "cancel_event",
  ],
};

async function runValidWindowTests(): Promise<void> {
  const tomorrowDecision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Que eventos tengo manana?",
    recentMessages: [{ role: "user", content: "Que eventos tengo manana?" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(tomorrowDecision.kind, "action");
  if (tomorrowDecision.kind !== "action") {
    return;
  }

  assert.equal(tomorrowDecision.input.action, "list_events");
  assert.equal(tomorrowDecision.input.timezone, "America/Buenos_Aires");
  assert.ok(
    new Date(tomorrowDecision.input.endIso).getTime() >
      new Date(tomorrowDecision.input.startIso).getTime()
  );

  const weekDecision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Mostrame mi disponibilidad esta semana",
    recentMessages: [{ role: "user", content: "Mostrame mi disponibilidad esta semana" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(weekDecision.kind, "action");
  if (weekDecision.kind !== "action") {
    return;
  }

  assert.equal(weekDecision.input.action, "check_availability");
}

async function runProximosDiasTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Mostrame mis eventos de los proximos 3 dias",
    recentMessages: [{ role: "user", content: "Mostrame mis eventos de los proximos 3 dias" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action") {
    return;
  }

  assert.equal(decision.input.action, "list_events");
  // window should span 3 days: 2026-03-13, 2026-03-14, 2026-03-15
  const startMs = new Date(decision.input.startIso).getTime();
  const endMs = new Date(decision.input.endIso).getTime();
  const spanDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  assert.ok(spanDays >= 2 && spanDays <= 3, `Expected ~3 day span, got ${spanDays} days`);

  // also test with accent
  const accentDecision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Tengo algo en los próximos 5 días?",
    recentMessages: [{ role: "user", content: "Tengo algo en los próximos 5 días?" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(accentDecision.kind, "action");
}

async function runMissingWindowTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Que tengo en el calendario?",
    recentMessages: [{ role: "user", content: "Que tengo en el calendario?" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(decision.kind, "missing_data");
}

async function runActionNotAllowedTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: {
      ...calendarConfig,
      allowed_actions: ["list_events"],
    },
    latestUserMessage: "Tengo disponibilidad manana?",
    recentMessages: [{ role: "user", content: "Tengo disponibilidad manana?" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(decision.kind, "respond");
}

async function runMissingTimezoneTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarConfig,
    latestUserMessage: "Que eventos tengo manana?",
    recentMessages: [{ role: "user", content: "Que eventos tengo manana?" }],
    timezone: null,
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(decision.kind, "missing_data");
}

async function runTimezoneResolutionTest(): Promise<void> {
  const timezone = resolveGoogleCalendarAgentTimezone({
    setupState: {
      checklist: [
        {
          id: "define-hours",
          input_kind: "schedule",
        },
      ],
      task_data: {
        "define-hours": {
          timezone: "America/Bogota",
          timezoneManualOverride: true,
          days: [
            { day: "monday", enabled: true, start: "09:00", end: "18:00" },
            { day: "tuesday", enabled: false, start: "09:00", end: "18:00" },
            { day: "wednesday", enabled: false, start: "09:00", end: "18:00" },
            { day: "thursday", enabled: false, start: "09:00", end: "18:00" },
            { day: "friday", enabled: false, start: "09:00", end: "18:00" },
            { day: "saturday", enabled: false, start: "09:00", end: "18:00" },
            { day: "sunday", enabled: false, start: "09:00", end: "18:00" },
          ],
        },
      },
    } as never,
    detectedTimezone: "America/Los_Angeles",
  });

  assert.equal(timezone, "America/Bogota");
}

async function runDetectedTimezoneFallbackTest(): Promise<void> {
  const timezone = resolveGoogleCalendarAgentTimezone({
    setupState: {
      checklist: [
        {
          id: "define-hours",
          input_kind: "schedule",
        },
      ],
      task_data: {
        "define-hours": {
          timezone: "Europe/Madrid",
          timezoneManualOverride: false,
          days: [
            { day: "monday", enabled: true, start: "09:00", end: "18:00" },
            { day: "tuesday", enabled: false, start: "09:00", end: "18:00" },
            { day: "wednesday", enabled: false, start: "09:00", end: "18:00" },
            { day: "thursday", enabled: false, start: "09:00", end: "18:00" },
            { day: "friday", enabled: false, start: "09:00", end: "18:00" },
            { day: "saturday", enabled: false, start: "09:00", end: "18:00" },
            { day: "sunday", enabled: false, start: "09:00", end: "18:00" },
          ],
        },
      },
    } as never,
    detectedTimezone: "America/Mexico_City",
  });

  assert.equal(timezone, "America/Mexico_City");
}

async function runSetupAutofillTests(): Promise<void> {
  const autoFilled = resolveSetupState({
    version: 1,
    template_id: "calendar_reschedule_assistant",
    areas: [],
    integrations: ["google_calendar"],
    tool_scope_preset: "full",
    channel: "web",
    setup_status: "not_started",
    current_step: 3,
    builder_draft: {
      objective: "",
      role: "",
      audience: "",
      allowedTasks: "",
      tone: "professional",
      restrictions: "",
      humanHandoff: "",
      openingMessage: "",
      channel: "web",
    },
    task_data: {
      "define-hours": {
        timezone: "UTC",
        timezoneManualOverride: false,
        days: [
          { day: "monday", enabled: true, start: "09:00", end: "18:00" },
          { day: "tuesday", enabled: false, start: "09:00", end: "18:00" },
          { day: "wednesday", enabled: false, start: "09:00", end: "18:00" },
          { day: "thursday", enabled: false, start: "09:00", end: "18:00" },
          { day: "friday", enabled: false, start: "09:00", end: "18:00" },
          { day: "saturday", enabled: false, start: "09:00", end: "18:00" },
          { day: "sunday", enabled: false, start: "09:00", end: "18:00" },
        ],
      },
    },
    checklist: [
      {
        id: "define-hours",
        label: "Horario",
        description: "Horario operativo",
        status: "pending",
        required_for_activation: true,
        verification_mode: "structured",
        input_kind: "schedule",
      },
    ],
  } as never, {
    googleCalendarDetectedTimezone: "America/Santiago",
  });

  assert.equal(
    (autoFilled.task_data["define-hours"] as { timezone: string }).timezone,
    "America/Santiago"
  );

  const preservedManual = resolveSetupState({
    ...autoFilled,
    task_data: {
      "define-hours": {
        ...(autoFilled.task_data["define-hours"] as object),
        timezone: "Europe/Madrid",
        timezoneManualOverride: true,
      },
    },
  } as never, {
    googleCalendarDetectedTimezone: "America/Santiago",
  });

  assert.equal(
    (preservedManual.task_data["define-hours"] as { timezone: string }).timezone,
    "Europe/Madrid"
  );
}

async function runAmbiguousEventDisambiguationTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage: "Cancela la reunion de hoy",
    recentMessages: [{ role: "user", content: "Cancela la reunion de hoy" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_1",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_demo|Demo ACME|2026-03-13T13:00:00.000Z|2026-03-13T14:00:00.000Z",
      "event_2=evt_demo_2|Demo Beta|2026-03-13T16:00:00.000Z|2026-03-13T17:00:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "missing_data");
  if (decision.kind !== "missing_data") {
    return;
  }

  assert.match(decision.message, /varios eventos posibles/i);
  assert.match(decision.message, /Demo ACME/);
  assert.match(decision.message, /Demo Beta/);
}

async function runTimeBasedEventDisambiguationTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage: "Reprograma la reunion de las 10 a 12:30 a 13:30",
    recentMessages: [
      { role: "user", content: "Reprograma la reunion de las 10 a 12:30 a 13:30" },
    ],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_2",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_morning|Daily Sync|2026-03-13T13:00:00.000Z|2026-03-13T13:30:00.000Z",
      "event_2=evt_afternoon|Daily Sync|2026-03-13T16:00:00.000Z|2026-03-13T16:30:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "reschedule_event") {
    return;
  }

  assert.equal(decision.input.eventId, "evt_morning");
}

async function runOrdinalEventDisambiguationTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage: "Cancela el segundo evento",
    recentMessages: [{ role: "user", content: "Cancela el segundo evento" }],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_3",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_1|Prospecto Uno|2026-03-13T13:00:00.000Z|2026-03-13T13:30:00.000Z",
      "event_2=evt_2|Prospecto Dos|2026-03-13T16:00:00.000Z|2026-03-13T16:30:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "cancel_event") {
    return;
  }

  assert.equal(decision.input.eventId, "evt_2");
}

async function runCreateEventStructuredFieldsTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage:
      'Crea una reunion "Kickoff ACME" manana de 15 a 16 en sala Norte con juan@example.com y ana@example.com descripcion: revisar alcance y proximos pasos',
    recentMessages: [
      {
        role: "user",
        content:
          'Crea una reunion "Kickoff ACME" manana de 15 a 16 en sala Norte con juan@example.com y ana@example.com descripcion: revisar alcance y proximos pasos',
      },
    ],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "create_event") {
    return;
  }

  assert.equal(decision.input.title, "Kickoff ACME");
  assert.equal(decision.input.location, "sala Norte");
  assert.equal(decision.input.description, "revisar alcance y proximos pasos");
  assert.deepEqual(decision.input.attendeeEmails, [
    "juan@example.com",
    "ana@example.com",
  ]);
}

async function runRescheduleStructuredFieldsTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage:
      "Reprograma el segundo evento a 12:30 a 13:30 en Zoom con ops@example.com nota: mover por conflicto de agenda",
    recentMessages: [
      {
        role: "user",
        content:
          "Reprograma el segundo evento a 12:30 a 13:30 en Zoom con ops@example.com nota: mover por conflicto de agenda",
      },
    ],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_4",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_1|Prospecto Uno|2026-03-13T13:00:00.000Z|2026-03-13T13:30:00.000Z",
      "event_2=evt_2|Prospecto Dos|2026-03-13T16:00:00.000Z|2026-03-13T16:30:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "reschedule_event") {
    return;
  }

  assert.equal(decision.input.eventId, "evt_2");
  assert.equal(decision.input.location, "Zoom");
  assert.equal(decision.input.description, "mover por conflicto de agenda");
  assert.deepEqual(decision.input.attendeeEmails, ["ops@example.com"]);
}

async function runRescheduleFlexibleFieldsTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage:
      "Reprograma el segundo evento a 12:30 a 13:30 por Zoom suma una nota que diga mover por conflicto con ops@example.com",
    recentMessages: [
      {
        role: "user",
        content:
          "Reprograma el segundo evento a 12:30 a 13:30 por Zoom suma una nota que diga mover por conflicto con ops@example.com",
      },
    ],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_5",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_1|Prospecto Uno|2026-03-13T13:00:00.000Z|2026-03-13T13:30:00.000Z",
      "event_2=evt_2|Prospecto Dos|2026-03-13T16:00:00.000Z|2026-03-13T16:30:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "reschedule_event") {
    return;
  }

  assert.equal(decision.input.location, "Zoom");
  assert.equal(decision.input.description, "mover por conflicto con ops@example.com");
  assert.deepEqual(decision.input.attendeeEmails, ["ops@example.com"]);
}

async function runCancelEventContextFieldsTest(): Promise<void> {
  const decision = planGoogleCalendarToolAction({
    config: calendarWriteConfig,
    latestUserMessage:
      "Cancela el segundo evento por Zoom suma una nota que diga avisar al equipo con ops@example.com",
    recentMessages: [
      {
        role: "user",
        content:
          "Cancela el segundo evento por Zoom suma una nota que diga avisar al equipo con ops@example.com",
      },
    ],
    timezone: "America/Buenos_Aires",
    now: new Date("2026-03-13T12:00:00.000Z"),
    recentToolContext: [
      "GOOGLE_CALENDAR_TOOL_RESULT",
      "provider=google_calendar",
      "action=list_events",
      "request_id=req_6",
      "timezone=America/Buenos_Aires",
      "window_start=2026-03-13T00:00:00.000Z",
      "window_end=2026-03-13T23:59:59.999Z",
      "event_1=evt_1|Prospecto Uno|2026-03-13T13:00:00.000Z|2026-03-13T13:30:00.000Z",
      "event_2=evt_2|Prospecto Dos|2026-03-13T16:00:00.000Z|2026-03-13T16:30:00.000Z",
    ].join("\n"),
  });

  assert.equal(decision.kind, "action");
  if (decision.kind !== "action" || decision.input.action !== "cancel_event") {
    return;
  }

  assert.equal(decision.input.eventId, "evt_2");
  assert.equal(decision.input.location, "Zoom");
  assert.equal(decision.input.description, "avisar al equipo con ops@example.com");
  assert.deepEqual(decision.input.attendeeEmails, ["ops@example.com"]);
}

async function main(): Promise<void> {
  await runValidWindowTests();
  await runProximosDiasTest();
  await runMissingWindowTest();
  await runActionNotAllowedTest();
  await runMissingTimezoneTest();
  await runTimezoneResolutionTest();
  await runDetectedTimezoneFallbackTest();
  await runSetupAutofillTests();
  await runAmbiguousEventDisambiguationTest();
  await runTimeBasedEventDisambiguationTest();
  await runOrdinalEventDisambiguationTest();
  await runCreateEventStructuredFieldsTest();
  await runRescheduleStructuredFieldsTest();
  await runRescheduleFlexibleFieldsTest();
  await runCancelEventContextFieldsTest();
  console.log("google-calendar-tool-planner checks passed");
}

void main();
