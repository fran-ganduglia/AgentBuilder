import assert from "node:assert/strict";

import { runGoogleCalendarWriteAction } from "./google-calendar-agent-runtime";

async function runCreateEventTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "evt-created",
        status: "confirmed",
        summary: "Kickoff ACME",
        htmlLink: "https://calendar.google.com/event?eid=evt-created",
        location: "Zoom",
        start: {
          dateTime: "2026-03-14T18:00:00.000Z",
          timeZone: "America/Buenos_Aires",
        },
        end: {
          dateTime: "2026-03-14T19:00:00.000Z",
          timeZone: "America/Buenos_Aires",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-create",
        },
      }
    );

  try {
    const result = await runGoogleCalendarWriteAction(
      {
        action: "create_event",
        title: "Kickoff ACME",
        startIso: "2026-03-14T18:00:00.000Z",
        endIso: "2026-03-14T19:00:00.000Z",
        timezone: "America/Buenos_Aires",
        location: "Zoom",
        description: "Repasar alcance",
        attendeeEmails: ["ops@example.com"],
      },
      "token-1",
      "org-1",
      "integration-1",
      {
        workflowRunId: "run-1",
        workflowStepId: "step-1",
      }
    );

    assert.equal(result.action, "create_event");
    assert.equal(result.requestId, "req-create");
    assert.equal(result.providerObjectId, "evt-created");
    assert.equal(result.data.title, "Kickoff ACME");
    assert.equal(result.data.location, "Zoom");
  } finally {
    global.fetch = originalFetch;
  }
}

async function runRescheduleEventTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "evt-existing",
        status: "confirmed",
        summary: "Kickoff ACME",
        htmlLink: "https://calendar.google.com/event?eid=evt-existing",
        location: "Sala Norte",
        start: {
          dateTime: "2026-03-14T20:00:00.000Z",
          timeZone: "America/Buenos_Aires",
        },
        end: {
          dateTime: "2026-03-14T21:00:00.000Z",
          timeZone: "America/Buenos_Aires",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-reschedule",
        },
      }
    );

  try {
    const result = await runGoogleCalendarWriteAction(
      {
        action: "reschedule_event",
        eventId: "evt-existing",
        title: "Kickoff ACME",
        startIso: "2026-03-14T20:00:00.000Z",
        endIso: "2026-03-14T21:00:00.000Z",
        timezone: "America/Buenos_Aires",
        location: "Sala Norte",
        attendeeEmails: ["ops@example.com", "sales@example.com"],
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "reschedule_event");
    assert.equal(result.requestId, "req-reschedule");
    assert.equal(result.providerObjectId, "evt-existing");
    assert.equal(result.data.startIso, "2026-03-14T20:00:00.000Z");
    assert.equal(result.data.endIso, "2026-03-14T21:00:00.000Z");
  } finally {
    global.fetch = originalFetch;
  }
}

async function runCancelEventTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(null, {
      status: 204,
      headers: {
        "x-request-id": "req-cancel",
      },
    });

  try {
    const result = await runGoogleCalendarWriteAction(
      {
        action: "cancel_event",
        eventId: "evt-cancelled",
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "cancel_event");
    assert.equal(result.providerObjectId, "evt-cancelled");
    assert.equal(result.data.status, "cancelled");
  } finally {
    global.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  await runCreateEventTest();
  await runRescheduleEventTest();
  await runCancelEventTest();
  console.log("google-calendar-write-runtime checks passed");
}

void main();
