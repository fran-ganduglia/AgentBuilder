import assert from "node:assert/strict";

import {
  createGoogleCalendarReadToolExecutor,
  runGoogleCalendarAction,
  type GoogleCalendarAgentRuntime,
} from "./google-calendar-agent-runtime";
import { ProviderRequestError } from "./provider-errors";

function buildRuntime(): GoogleCalendarAgentRuntime {
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
  } as never;
}

async function runFreeBusySuccessTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        calendars: {
          primary: {
            busy: [
              {
                start: "2026-03-14T13:00:00.000Z",
                end: "2026-03-14T14:00:00.000Z",
              },
            ],
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-freebusy",
        },
      }
    );

  try {
    const result = await runGoogleCalendarAction(
      {
        action: "check_availability",
        startIso: "2026-03-14T12:00:00.000Z",
        endIso: "2026-03-14T16:00:00.000Z",
        timezone: "UTC",
        slotMinutes: 30,
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "check_availability");
    assert.equal(result.requestId, "req-freebusy");
    assert.equal(result.data.busy.length, 1);
    assert.equal(result.data.freeSlots.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
}

async function runEventsListSuccessTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        items: [
          {
            id: "evt-1",
            status: "confirmed",
            summary: "Demo",
            start: { dateTime: "2026-03-14T13:00:00.000Z" },
            end: { dateTime: "2026-03-14T13:30:00.000Z" },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-events",
        },
      }
    );

  try {
    const result = await runGoogleCalendarAction(
      {
        action: "list_events",
        startIso: "2026-03-14T00:00:00.000Z",
        endIso: "2026-03-15T00:00:00.000Z",
        timezone: "UTC",
        maxResults: 10,
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "list_events");
    assert.equal(result.requestId, "req-events");
    assert.equal(result.data.events.length, 1);
    assert.equal(result.data.events[0]?.title, "Demo");
  } finally {
    global.fetch = originalFetch;
  }
}

async function runRefreshSuccessTest(): Promise<void> {
  let attempts = 0;
  const executor = createGoogleCalendarReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "expired-token",
        refreshToken: "refresh-token",
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async () => undefined,
    refreshGoogleCredentials: async () => ({
      data: { accessToken: "new-token" },
      error: null,
    }),
    runGoogleCalendarAction: async (actionInput, accessToken) => {
      attempts += 1;
      if (attempts === 1) {
        throw new ProviderRequestError({
          provider: "google_workspace",
          message: "expired",
          statusCode: 401,
        });
      }

      assert.equal(accessToken, "new-token");
      return {
        action: actionInput.action,
        requestId: "req-refresh",
        data: {
          calendarId: "primary",
          timezone: "UTC",
          startIso: (actionInput as { startIso: string }).startIso,
          endIso: (actionInput as { endIso: string }).endIso,
          maxResults: 10,
          events: [],
        },
        summary: "ok",
      } as never;
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "list_events",
      startIso: "2026-03-14T00:00:00.000Z",
      endIso: "2026-03-15T00:00:00.000Z",
      timezone: "UTC",
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.requestId, "req-refresh");
  assert.equal(attempts, 2);
}

async function runRefreshFailureReauthTest(): Promise<void> {
  const reauthReasons: string[] = [];
  const executor = createGoogleCalendarReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "expired-token",
        refreshToken: "refresh-token",
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async (_integrationId, _organizationId, reason) => {
      reauthReasons.push(reason);
    },
    refreshGoogleCredentials: async () => ({
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    }),
    runGoogleCalendarAction: async () => {
      throw new ProviderRequestError({
        provider: "google_workspace",
        message: "expired",
        statusCode: 401,
      });
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "list_events",
      startIso: "2026-03-14T00:00:00.000Z",
      endIso: "2026-03-15T00:00:00.000Z",
      timezone: "UTC",
    },
  });

  assert.equal(
    result.error,
    "La integracion necesita reautenticacion antes de volver a operar."
  );
  assert.equal(reauthReasons.length, 1);
}

async function runRateLimitSafeMessageTest(): Promise<void> {
  const executor = createGoogleCalendarReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "token-1",
        refreshToken: null,
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async () => undefined,
    refreshGoogleCredentials: async () => ({
      data: null,
      error: "unused",
    }),
    runGoogleCalendarAction: async () => {
      throw new ProviderRequestError({
        provider: "google_workspace",
        message: "rate limited",
        statusCode: 429,
      });
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "check_availability",
      startIso: "2026-03-14T12:00:00.000Z",
      endIso: "2026-03-14T16:00:00.000Z",
      timezone: "UTC",
    },
  });

  assert.equal(
    result.error,
    "El proveedor pidio bajar la velocidad. Reintenta en unos minutos."
  );
}

async function runForbiddenScopesDoesNotMarkReauthTest(): Promise<void> {
  const reauthReasons: string[] = [];
  const executor = createGoogleCalendarReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "token-1",
        refreshToken: "refresh-token",
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async (_integrationId, _organizationId, reason) => {
      reauthReasons.push(reason);
    },
    refreshGoogleCredentials: async () => ({
      data: null,
      error: "unused",
    }),
    runGoogleCalendarAction: async () => {
      throw new ProviderRequestError({
        provider: "google_workspace",
        message: "Request had insufficient authentication scopes.",
        statusCode: 403,
      });
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "list_events",
      startIso: "2026-03-14T00:00:00.000Z",
      endIso: "2026-03-15T00:00:00.000Z",
      timezone: "UTC",
    },
  });

  assert.equal(
    result.error,
    "Google Calendar rechazo la consulta por permisos insuficientes para esta superficie. Reconecta Google Calendar y acepta los scopes solicitados antes de volver a intentar."
  );
  assert.equal(reauthReasons.length, 0);
}

async function runCalendarApiDisabledMessageTest(): Promise<void> {
  const reauthReasons: string[] = [];
  const executor = createGoogleCalendarReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "token-1",
        refreshToken: "refresh-token",
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async (_integrationId, _organizationId, reason) => {
      reauthReasons.push(reason);
    },
    refreshGoogleCredentials: async () => ({
      data: null,
      error: "unused",
    }),
    runGoogleCalendarAction: async () => {
      throw new ProviderRequestError({
        provider: "google_workspace",
        message:
          "Google Calendar API has not been used in project 864626144569 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=864626144569 then retry.",
        statusCode: 403,
      });
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "list_events",
      startIso: "2026-03-14T00:00:00.000Z",
      endIso: "2026-03-15T00:00:00.000Z",
      timezone: "UTC",
    },
  });

  assert.equal(
    result.error,
    "Google Calendar no puede operar porque la Google Calendar API no esta habilitada en el proyecto OAuth configurado. Habilitala en Google Cloud Console para ese proyecto y vuelve a intentar."
  );
  assert.equal(reauthReasons.length, 0);
}

async function main(): Promise<void> {
  await runFreeBusySuccessTest();
  await runEventsListSuccessTest();
  await runRefreshSuccessTest();
  await runRefreshFailureReauthTest();
  await runRateLimitSafeMessageTest();
  await runForbiddenScopesDoesNotMarkReauthTest();
  await runCalendarApiDisabledMessageTest();
  console.log("google-calendar-agent-runtime checks passed");
}

void main();
