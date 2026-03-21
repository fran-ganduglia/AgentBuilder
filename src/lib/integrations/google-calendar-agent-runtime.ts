import "server-only";

import {
  getGoogleIntegrationConfig,
  getGoogleRefreshState,
  rotateGoogleTokens,
} from "@/lib/db/google-integration-config";
import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { requestGoogleCalendar, refreshGoogleAccessToken } from "@/lib/integrations/google";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  executeGoogleCalendarReadToolSchema,
  executeGoogleCalendarWriteToolSchema,
  isGoogleCalendarActionAllowed,
  type GoogleCalendarAction,
  type ExecuteGoogleCalendarReadToolInput,
  type ExecuteGoogleCalendarWriteToolInput,
  type GoogleCalendarAgentToolConfig,
  type GoogleCalendarToolAction,
} from "@/lib/integrations/google-agent-tools";

import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { isProviderRequestError, type ProviderRequestError } from "@/lib/integrations/provider-errors";
import { coordinateIntegrationRefresh } from "@/lib/integrations/refresh-coordination";
import type {
  GoogleAgentRuntimeSafeError,
  GoogleAgentRuntimeSuccess,
} from "@/lib/integrations/google-agent-runtime";

type DbResult<T> = { data: T | null; error: string | null };

const GOOGLE_CALENDAR_DEFAULT_SLOT_MINUTES = 30;
const GOOGLE_CALENDAR_DEFAULT_MAX_RESULTS = 10;
const GOOGLE_CALENDAR_MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const GOOGLE_CALENDAR_METHOD_KEY = "google_workspace.calendar.read_requests";

type GoogleCalendarFreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
};

type GoogleCalendarEventsListResponse = {
  items?: Array<{
    id?: string;
    status?: string;
    summary?: string;
    htmlLink?: string;
    location?: string;
    start?: { date?: string; dateTime?: string; timeZone?: string };
    end?: { date?: string; dateTime?: string; timeZone?: string };
    organizer?: { email?: string; displayName?: string };
  }>;
};

type GoogleCalendarEventMutationResponse = {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

type GoogleCalendarEventGetResponse = {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  location?: string;
  description?: string;
  organizer?: { email?: string; displayName?: string };
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  recurrence?: string[];
};

export type GoogleCalendarBusySlot = {
  startIso: string;
  endIso: string;
};

export type GoogleCalendarFreeSlot = {
  startIso: string;
  endIso: string;
};

export type GoogleCalendarEventSummary = {
  id: string | null;
  status: string | null;
  title: string | null;
  startIso: string | null;
  endIso: string | null;
  htmlLink: string | null;
  location: string | null;
  organizer: string | null;
};

export type GoogleCalendarCheckAvailabilityResult = {
  action: "check_availability";
  requestId: string | null;
  data: {
    calendarId: "primary";
    timezone: string;
    startIso: string;
    endIso: string;
    slotMinutes: number;
    busy: GoogleCalendarBusySlot[];
    freeSlots: GoogleCalendarFreeSlot[];
  };
  summary: string;
};

export type GoogleCalendarListEventsResult = {
  action: "list_events";
  requestId: string | null;
  data: {
    calendarId: "primary";
    timezone: string;
    startIso: string;
    endIso: string;
    maxResults: number;
    events: GoogleCalendarEventSummary[];
  };
  summary: string;
};

export type GoogleCalendarGetEventDetailsResult = {
  action: "get_event_details";
  requestId: string | null;
  data: {
    id: string | null;
    status: string | null;
    title: string | null;
    startIso: string | null;
    endIso: string | null;
    timezone: string;
    htmlLink: string | null;
    location: string | null;
    description: string | null;
    organizer: string | null;
    attendees: Array<{ email: string; displayName: string | null; responseStatus: string | null }>;
    recurrence: string[];
  };
  summary: string;
};

export type GoogleCalendarReadToolExecutionResult =
  | GoogleCalendarCheckAvailabilityResult
  | GoogleCalendarListEventsResult
  | GoogleCalendarGetEventDetailsResult;

export type GoogleCalendarWriteToolExecutionResult =
  | {
      action: "create_event";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "event";
      data: {
        id: string | null;
        status: string | null;
        title: string | null;
        startIso: string;
        endIso: string;
        timezone: string;
        htmlLink: string | null;
        location: string | null;
      };
      summary: string;
    }
  | {
      action: "reschedule_event";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "event";
      data: {
        id: string | null;
        status: string | null;
        title: string | null;
        startIso: string;
        endIso: string;
        timezone: string;
        htmlLink: string | null;
        location: string | null;
      };
      summary: string;
    }
  | {
      action: "cancel_event";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "event";
      data: {
        id: string;
        status: "cancelled";
      };
      summary: string;
    }
  | {
      action: "update_event_details";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "event";
      data: {
        id: string | null;
        title: string | null;
        startIso: string | null;
        endIso: string | null;
        timezone: string | null;
        htmlLink: string | null;
        location: string | null;
        updatedFields: string[];
      };
      summary: string;
    };

export type GoogleCalendarCompensationAction = "cancel_created_event";

export type GoogleCalendarAgentRuntime = GoogleAgentRuntimeSuccess & {
  surface: "google_calendar";
  config: GoogleCalendarAgentToolConfig;
};

type GoogleCalendarReadToolExecutorDeps = {
  getGoogleIntegrationConfig: typeof getGoogleIntegrationConfig;
  markIntegrationReauthRequired: typeof markIntegrationReauthRequired;
  refreshGoogleCredentials: typeof refreshGoogleCredentials;
  runGoogleCalendarAction: typeof runGoogleCalendarAction;
};

function isAuthFailure(error: unknown): error is ProviderRequestError {
  if (!isProviderRequestError(error)) {
    return false;
  }

  if (isPermissionFailure(error)) {
    return false;
  }

  if (error.statusCode === 401) {
    return true;
  }

  if (error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid credentials") ||
    message.includes("access token") ||
    message.includes("token expired") ||
    message.includes("token has been expired") ||
    message.includes("token has been revoked") ||
    message.includes("expired or revoked") ||
    message.includes("invalid_grant") ||
    message.includes("login required") ||
    message.includes("auth") ||
    message.includes("unauthorized")
  );
}

function isPermissionFailure(error: unknown): boolean {
  if (!isProviderRequestError(error) || error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("insufficient authentication scopes") ||
    message.includes("insufficient permissions") ||
    message.includes("permission denied") ||
    message.includes("permission") ||
    message.includes("forbidden") ||
    message.includes("accessnotconfigured") ||
    message.includes("api has not been used in project") ||
    message.includes("it is disabled") ||
    message.includes("enable it by visiting")
  );
}

function getGoogleCalendarProviderErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (
    isProviderRequestError(error) &&
    error.statusCode === 403 &&
    (() => {
      const message = error.message.toLowerCase();
      return (
        message.includes("accessnotconfigured") ||
        message.includes("api has not been used in project") ||
        message.includes("it is disabled") ||
        message.includes("enable it by visiting")
      );
    })()
  ) {
    return "Google Calendar no puede operar porque la Google Calendar API no esta habilitada en el proyecto OAuth configurado. Habilitala en Google Cloud Console para ese proyecto y vuelve a intentar.";
  }

  if (isPermissionFailure(error)) {
    return "Google Calendar rechazo la consulta por permisos insuficientes para esta superficie. Reconecta Google Calendar y acepta los scopes solicitados antes de volver a intentar.";
  }

  return getSafeProviderErrorMessage(error, fallback);
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validateWindow(
  input: { startIso: string; endIso: string; timezone: string }
): string | null {
  if (!isValidTimezone(input.timezone)) {
    return "La timezone configurada para Google Calendar no es valida.";
  }

  const startMs = new Date(input.startIso).getTime();
  const endMs = new Date(input.endIso).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "La ventana temporal de Google Calendar no es valida.";
  }

  if (endMs <= startMs) {
    return "La ventana temporal de Google Calendar debe terminar despues de empezar.";
  }

  if (endMs - startMs > GOOGLE_CALENDAR_MAX_WINDOW_MS) {
    return "La ventana temporal de Google Calendar excede el maximo permitido para esta consulta.";
  }

  return null;
}

function mergeBusySlots(slots: GoogleCalendarBusySlot[]): GoogleCalendarBusySlot[] {
  const sorted = [...slots].sort((left, right) =>
    left.startIso.localeCompare(right.startIso)
  );
  const merged: GoogleCalendarBusySlot[] = [];

  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(slot);
      continue;
    }

    if (new Date(slot.startIso).getTime() <= new Date(last.endIso).getTime()) {
      if (new Date(slot.endIso).getTime() > new Date(last.endIso).getTime()) {
        last.endIso = slot.endIso;
      }
      continue;
    }

    merged.push(slot);
  }

  return merged;
}

function computeFreeSlots(input: {
  startIso: string;
  endIso: string;
  busy: GoogleCalendarBusySlot[];
  slotMinutes: number;
}): GoogleCalendarFreeSlot[] {
  const minDurationMs = input.slotMinutes * 60 * 1000;
  const windowStart = new Date(input.startIso).getTime();
  const windowEnd = new Date(input.endIso).getTime();
  const freeSlots: GoogleCalendarFreeSlot[] = [];
  let cursor = windowStart;

  for (const busySlot of mergeBusySlots(input.busy)) {
    const busyStart = new Date(busySlot.startIso).getTime();
    const busyEnd = new Date(busySlot.endIso).getTime();

    if (busyEnd <= cursor) {
      continue;
    }

    if (busyStart > cursor && busyStart - cursor >= minDurationMs) {
      freeSlots.push({
        startIso: new Date(cursor).toISOString(),
        endIso: new Date(Math.min(busyStart, windowEnd)).toISOString(),
      });
    }

    cursor = Math.max(cursor, busyEnd);
    if (cursor >= windowEnd) {
      break;
    }
  }

  if (windowEnd - cursor >= minDurationMs) {
    freeSlots.push({
      startIso: new Date(cursor).toISOString(),
      endIso: new Date(windowEnd).toISOString(),
    });
  }

  return freeSlots;
}

function getExecutionFallback(
  action: ExecuteGoogleCalendarReadToolInput["action"]
): string {
  if (action === "check_availability") {
    return "No se pudo consultar la disponibilidad en Google Calendar.";
  }

  if (action === "get_event_details") {
    return "No se pudo obtener el detalle del evento en Google Calendar.";
  }

  return "No se pudo listar los eventos en Google Calendar.";
}

function getWriteExecutionFallback(
  action: ExecuteGoogleCalendarWriteToolInput["action"]
): string {
  if (action === "create_event") {
    return "No se pudo crear el evento en Google Calendar.";
  }

  if (action === "reschedule_event") {
    return "No se pudo reprogramar el evento en Google Calendar.";
  }

  if (action === "update_event_details") {
    return "No se pudo actualizar los detalles del evento en Google Calendar.";
  }

  return "No se pudo cancelar el evento en Google Calendar.";
}

function buildBusySummary(busy: GoogleCalendarBusySlot[]): string {
  if (busy.length === 0) {
    return "Sin bloques ocupados.";
  }

  return busy
    .map((slot) => `${slot.startIso} -> ${slot.endIso}`)
    .join(" | ");
}

function buildEventsSummary(events: GoogleCalendarEventSummary[]): string {
  if (events.length === 0) {
    return "Sin eventos en la ventana.";
  }

  return events
    .map((event) =>
      [
        event.title ?? "Evento sin titulo",
        event.startIso ?? "sin inicio",
        event.endIso ?? "sin fin",
      ].join(" | ")
    )
    .join(" || ");
}

function formatEvent(
  event: NonNullable<GoogleCalendarEventsListResponse["items"]>[number]
): GoogleCalendarEventSummary {
  return {
    id: event.id ?? null,
    status: event.status ?? null,
    title: event.summary?.trim() || null,
    startIso: event.start?.dateTime ?? event.start?.date ?? null,
    endIso: event.end?.dateTime ?? event.end?.date ?? null,
    htmlLink: event.htmlLink ?? null,
    location: event.location?.trim() || null,
    organizer: event.organizer?.displayName ?? event.organizer?.email ?? null,
  };
}

function formatMutationEvent(
  event: GoogleCalendarEventMutationResponse,
  fallback: {
    startIso?: string;
    endIso?: string;
    timezone?: string;
  } = {}
): {
  id: string | null;
  status: string | null;
  title: string | null;
  startIso: string;
  endIso: string;
  timezone: string;
  htmlLink: string | null;
  location: string | null;
} {
  return {
    id: event.id ?? null,
    status: event.status ?? null,
    title: event.summary?.trim() || null,
    startIso:
      event.start?.dateTime ??
      event.start?.date ??
      fallback.startIso ??
      new Date().toISOString(),
    endIso:
      event.end?.dateTime ??
      event.end?.date ??
      fallback.endIso ??
      new Date().toISOString(),
    timezone:
      event.start?.timeZone ??
      event.end?.timeZone ??
      fallback.timezone ??
      "UTC",
    htmlLink: event.htmlLink ?? null,
    location: event.location?.trim() || null,
  };
}

export async function runGoogleCalendarAction(
  input: ExecuteGoogleCalendarReadToolInput,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<GoogleCalendarReadToolExecutionResult> {
  const providerContext = {
    organizationId,
    integrationId,
    methodKey: GOOGLE_CALENDAR_METHOD_KEY,
  };

  if (input.action === "check_availability") {
    const response = await requestGoogleCalendar<GoogleCalendarFreeBusyResponse>(
      accessToken,
      "/freeBusy",
      {
        method: "POST",
        body: JSON.stringify({
          timeMin: input.startIso,
          timeMax: input.endIso,
          timeZone: input.timezone,
          items: [{ id: "primary" }],
        }),
      },
      providerContext
    );

    const busy = (response.data.calendars?.primary?.busy ?? [])
      .filter(
        (slot): slot is { start: string; end: string } =>
          typeof slot.start === "string" && typeof slot.end === "string"
      )
      .map((slot) => ({ startIso: slot.start, endIso: slot.end }));
    const slotMinutes =
      input.slotMinutes ?? GOOGLE_CALENDAR_DEFAULT_SLOT_MINUTES;
    const freeSlots = computeFreeSlots({
      startIso: input.startIso,
      endIso: input.endIso,
      busy,
      slotMinutes,
    });

    return {
      action: "check_availability",
      requestId: response.requestId,
      data: {
        calendarId: "primary",
        timezone: input.timezone,
        startIso: input.startIso,
        endIso: input.endIso,
        slotMinutes,
        busy,
        freeSlots,
      },
      summary: [
        `Disponibilidad consultada entre ${input.startIso} y ${input.endIso} (${input.timezone}).`,
        `Bloques ocupados: ${busy.length}.`,
        `Huecos libres de al menos ${slotMinutes} minutos: ${freeSlots.length}.`,
        `Detalle ocupado: ${buildBusySummary(busy)}`,
      ].join(" "),
    };
  }

  if (input.action === "list_events") {
    const maxResults = input.maxResults ?? GOOGLE_CALENDAR_DEFAULT_MAX_RESULTS;
    const searchParams = new URLSearchParams({
      timeMin: input.startIso,
      timeMax: input.endIso,
      timeZone: input.timezone,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(maxResults),
    });
    const response = await requestGoogleCalendar<GoogleCalendarEventsListResponse>(
      accessToken,
      `/calendars/primary/events?${searchParams.toString()}`,
      { method: "GET" },
      providerContext
    );
    const events = (response.data.items ?? []).map(formatEvent);

    return {
      action: "list_events",
      requestId: response.requestId,
      data: {
        calendarId: "primary",
        timezone: input.timezone,
        startIso: input.startIso,
        endIso: input.endIso,
        maxResults,
        events,
      },
      summary: [
        `Eventos consultados entre ${input.startIso} y ${input.endIso} (${input.timezone}).`,
        `Eventos devueltos: ${events.length}.`,
        `Detalle: ${buildEventsSummary(events)}`,
      ].join(" "),
    };
  }

  // get_event_details
  const getResponse = await requestGoogleCalendar<GoogleCalendarEventGetResponse>(
    accessToken,
    `/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    { method: "GET" },
    providerContext
  );

  const getStart = getResponse.data.start?.dateTime ?? getResponse.data.start?.date ?? null;
  const getEnd = getResponse.data.end?.dateTime ?? getResponse.data.end?.date ?? null;
  const getTz = getResponse.data.start?.timeZone ?? input.timezone;

  return {
    action: "get_event_details",
    requestId: getResponse.requestId,
    data: {
      id: getResponse.data.id ?? null,
      status: getResponse.data.status ?? null,
      title: getResponse.data.summary?.trim() || null,
      startIso: getStart,
      endIso: getEnd,
      timezone: getTz,
      htmlLink: getResponse.data.htmlLink ?? null,
      location: getResponse.data.location?.trim() || null,
      description: getResponse.data.description?.trim() || null,
      organizer: getResponse.data.organizer?.displayName ?? getResponse.data.organizer?.email ?? null,
      attendees: (getResponse.data.attendees ?? []).map((a) => ({
        email: a.email ?? "",
        displayName: a.displayName ?? null,
        responseStatus: a.responseStatus ?? null,
      })),
      recurrence: getResponse.data.recurrence ?? [],
    },
    summary: `Evento "${getResponse.data.summary ?? input.eventId}" en ${getStart ?? "fecha desconocida"} (${getTz}).`,
  };
}

export async function runGoogleCalendarWriteAction(
  input: ExecuteGoogleCalendarWriteToolInput,
  accessToken: string,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<GoogleCalendarWriteToolExecutionResult> {
  const providerContext = {
    organizationId,
    integrationId,
    methodKey: "google_workspace.calendar.write_requests",
    workflowRunId: workflow?.workflowRunId,
    workflowStepId: workflow?.workflowStepId,
  };

  if (input.action === "create_event") {
    const response = await requestGoogleCalendar<GoogleCalendarEventMutationResponse>(
      accessToken,
      "/calendars/primary/events",
      {
        method: "POST",
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
          location: input.location,
          start: {
            dateTime: input.startIso,
            timeZone: input.timezone,
          },
          end: {
            dateTime: input.endIso,
            timeZone: input.timezone,
          },
          attendees: input.attendeeEmails?.map((email: string) => ({ email })),
        }),
      },
      providerContext
    );

    const event = formatMutationEvent(response.data, {
      startIso: input.startIso,
      endIso: input.endIso,
      timezone: input.timezone,
    });

    return {
      action: "create_event",
      requestId: response.requestId,
      providerObjectId: event.id,
      providerObjectType: "event",
      data: event,
      summary: `Evento creado entre ${event.startIso} y ${event.endIso} (${event.timezone}).`,
    };
  }

  if (input.action === "reschedule_event") {
    const response = await requestGoogleCalendar<GoogleCalendarEventMutationResponse>(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.title ? { summary: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          start: {
            dateTime: input.startIso,
            timeZone: input.timezone,
          },
          end: {
            dateTime: input.endIso,
            timeZone: input.timezone,
          },
          ...(input.attendeeEmails ? { attendees: input.attendeeEmails.map((email: string) => ({ email })) } : {}),
        }),
      },
      providerContext
    );

    const event = formatMutationEvent(response.data, {
      startIso: input.startIso,
      endIso: input.endIso,
      timezone: input.timezone,
    });

    return {
      action: "reschedule_event",
      requestId: response.requestId,
      providerObjectId: event.id ?? input.eventId,
      providerObjectType: "event",
      data: event,
      summary: `Evento reprogramado para ${event.startIso} -> ${event.endIso} (${event.timezone}).`,
    };
  }

  if (input.action === "cancel_event") {
    await requestGoogleCalendar<Record<string, never>>(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
      { method: "DELETE" },
      providerContext
    );

    return {
      action: "cancel_event",
      requestId: null,
      providerObjectId: input.eventId,
      providerObjectType: "event",
      data: {
        id: input.eventId,
        status: "cancelled",
      },
      summary: "Evento cancelado en Google Calendar.",
    };
  }

  // update_event_details
  const updatedFields: string[] = [];
  const updateBody: Record<string, unknown> = {};
  if (input.title !== undefined) { updateBody.summary = input.title; updatedFields.push("title"); }
  if (input.description !== undefined) { updateBody.description = input.description; updatedFields.push("description"); }
  if (input.location !== undefined) { updateBody.location = input.location; updatedFields.push("location"); }
  if (input.attendeeEmails !== undefined) {
    updateBody.attendees = input.attendeeEmails.map((email: string) => ({ email }));
    updatedFields.push("attendees");
  }

  const updateResponse = await requestGoogleCalendar<GoogleCalendarEventMutationResponse>(
    accessToken,
    `/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updateBody),
    },
    providerContext
  );

  const updStart = updateResponse.data.start?.dateTime ?? updateResponse.data.start?.date ?? null;
  const updEnd = updateResponse.data.end?.dateTime ?? updateResponse.data.end?.date ?? null;

  return {
    action: "update_event_details",
    requestId: updateResponse.requestId,
    providerObjectId: updateResponse.data.id ?? input.eventId,
    providerObjectType: "event",
    data: {
      id: updateResponse.data.id ?? null,
      title: updateResponse.data.summary?.trim() || null,
      startIso: updStart,
      endIso: updEnd,
      timezone: updateResponse.data.start?.timeZone ?? null,
      htmlLink: updateResponse.data.htmlLink ?? null,
      location: updateResponse.data.location?.trim() || null,
      updatedFields,
    },
    summary: `Evento actualizado: ${updatedFields.join(", ")}.`,
  };
}

async function refreshGoogleCredentials(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  refreshToken: string;
}): Promise<DbResult<{ accessToken: string }>> {
  try {
    const currentConfigResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );

    if (currentConfigResult.error || !currentConfigResult.data) {
      return {
        data: null,
        error:
          currentConfigResult.error ??
          "No se pudo leer la configuracion de Google Calendar",
      };
    }

    const currentConfig = currentConfigResult.data;
    const coordination = await coordinateIntegrationRefresh({
      provider: "google",
      integrationId: input.integrationId,
      loadState: async () => {
        const stateResult = await getGoogleRefreshState(
          input.integrationId,
          input.organizationId
        );
        return stateResult.data ?? { tokenGeneration: 0, authStatus: null };
      },
      refresh: async () => {
        const refreshResult = await refreshGoogleAccessToken(input.refreshToken);
        const rotatedResult = await rotateGoogleTokens({
          integrationId: input.integrationId,
          organizationId: input.organizationId,
          userId: input.userId,
          accessToken: refreshResult.accessToken,
          ...(refreshResult.refreshToken !== null
            ? { refreshToken: refreshResult.refreshToken }
            : {}),
          grantedScopes: refreshResult.grantedScopes,
          accessTokenExpiresAt: refreshResult.accessTokenExpiresAt,
          connectedEmail: refreshResult.connectedEmail,
          workspaceCustomerId: refreshResult.workspaceCustomerId,
          tokenType: refreshResult.tokenType,
          googleCalendarPrimaryTimezone:
            refreshResult.googleCalendarPrimaryTimezone ??
            currentConfig.googleCalendarPrimaryTimezone,
          googleCalendarUserTimezone:
            refreshResult.googleCalendarUserTimezone ??
            currentConfig.googleCalendarUserTimezone,
        });

        if (rotatedResult.error) {
          throw new Error(rotatedResult.error);
        }
      },
    });

    if (coordination.kind === "timeout") {
      return {
        data: null,
        error: "Google Calendar esta refrescando credenciales en otro request. Reintenta en unos segundos.",
      };
    }

    const configResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );
    if (configResult.error || !configResult.data) {
      return {
        data: null,
        error: configResult.error ?? "No se pudo recargar Google Calendar",
      };
    }

    if (
      coordination.kind === "follower" &&
      configResult.data.authStatus === "reauth_required"
    ) {
      return {
        data: null,
        error: "La integracion necesita reautenticacion antes de volver a operar.",
      };
    }

    return {
      data: {
        accessToken: configResult.data.accessToken,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo refrescar la sesion de Google Calendar",
    };
  }
}

export function assertGoogleCalendarRuntimeUsable(
  runtime: GoogleAgentRuntimeSuccess
): DbResult<GoogleCalendarAgentRuntime> {
  if (runtime.surface !== "google_calendar") {
    return { data: null, error: "La surface Google Calendar no esta disponible." };
  }

  const access = assertUsableIntegration(runtime.integration);
  return access.ok
    ? { data: runtime as GoogleCalendarAgentRuntime, error: null }
    : { data: null, error: access.message };
}

export function assertGoogleCalendarActionEnabled(
  runtime: GoogleCalendarAgentRuntime,
  action: GoogleCalendarToolAction
): DbResult<GoogleCalendarAgentRuntime> {
  if (!isGoogleCalendarActionAllowed(runtime.config, action)) {
    return {
      data: null,
      error: "La accion pedida no esta habilitada para este agente.",
    };
  }

  return { data: runtime, error: null };
}

export function formatGoogleCalendarReadResultForPrompt(
  result: GoogleCalendarReadToolExecutionResult
): string {
  const header = [
    "GOOGLE_CALENDAR_TOOL_RESULT",
    `provider=google_calendar`,
    `action=${result.action}`,
    `request_id=${result.requestId ?? "unknown"}`,
  ];

  if (result.action === "check_availability") {
    return [
      ...header,
      `timezone=${result.data.timezone}`,
      `window_start=${result.data.startIso}`,
      `window_end=${result.data.endIso}`,
      `slot_minutes=${result.data.slotMinutes}`,
      `busy_count=${result.data.busy.length}`,
      `free_slot_count=${result.data.freeSlots.length}`,
      `summary=${result.summary}`,
    ].join("\n");
  }

  if (result.action === "get_event_details") {
    return [
      ...header,
      `timezone=${result.data.timezone}`,
      `event_id=${result.data.id ?? "unknown"}`,
      `title=${result.data.title ?? ""}`,
      `start=${result.data.startIso ?? ""}`,
      `end=${result.data.endIso ?? ""}`,
      `location=${result.data.location ?? ""}`,
      `organizer=${result.data.organizer ?? ""}`,
      `attendee_count=${result.data.attendees.length}`,
      `recurrence_count=${result.data.recurrence.length}`,
      `summary=${result.summary}`,
    ].join("\n");
  }

  return [
    ...header,
    `timezone=${result.data.timezone}`,
    `window_start=${result.data.startIso}`,
    `window_end=${result.data.endIso}`,
    `max_results=${result.data.maxResults}`,
    `event_count=${result.data.events.length}`,
    `summary=${result.summary}`,
    ...result.data.events.map(
      (event, index) =>
        `event_${index + 1}=${event.id ?? "unknown"}|${event.title ?? ""}|${event.startIso ?? ""}|${event.endIso ?? ""}`
    ),
  ].join("\n");
}

export function createGoogleCalendarReadToolExecutor(
  deps: GoogleCalendarReadToolExecutorDeps = {
    getGoogleIntegrationConfig,
    markIntegrationReauthRequired,
    refreshGoogleCredentials,
    runGoogleCalendarAction,
  }
): (input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleCalendarAgentRuntime;
  actionInput: ExecuteGoogleCalendarReadToolInput;
}) => Promise<DbResult<GoogleCalendarReadToolExecutionResult>> {
  return async function executeGoogleCalendarReadToolWithDeps(input) {
    const parsedInput = executeGoogleCalendarReadToolSchema.safeParse(
      input.actionInput
    );
    if (!parsedInput.success) {
      return { data: null, error: "La consulta de Google Calendar no es valida." };
    }

    const actionEnabled = assertGoogleCalendarActionEnabled(
      input.runtime,
      parsedInput.data.action
    );
    if (actionEnabled.error || !actionEnabled.data) {
      return { data: null, error: actionEnabled.error };
    }

    if (parsedInput.data.action !== "get_event_details") {
      const windowError = validateWindow(parsedInput.data);
      if (windowError) {
        return { data: null, error: windowError };
      }
    }

    const configResult = await deps.getGoogleIntegrationConfig(
      actionEnabled.data.integration.id,
      input.organizationId
    );
    if (configResult.error || !configResult.data) {
      if (configResult.error) {
        await deps.markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          configResult.error
        );
      }

      return {
        data: null,
        error: "La integracion necesita reautenticacion antes de volver a operar.",
      };
    }

    let accessToken = configResult.data.accessToken;

    try {
      const result = await deps.runGoogleCalendarAction(
        parsedInput.data,
        accessToken,
        input.organizationId,
        actionEnabled.data.integration.id
      );
      return { data: result, error: null };
    } catch (error) {
      if (isAuthFailure(error) && configResult.data.refreshToken) {
        const refreshResult = await deps.refreshGoogleCredentials({
          organizationId: input.organizationId,
          userId: input.userId,
          integrationId: actionEnabled.data.integration.id,
          refreshToken: configResult.data.refreshToken,
        });

        if (!refreshResult.error && refreshResult.data) {
          accessToken = refreshResult.data.accessToken;

          try {
            const retried = await deps.runGoogleCalendarAction(
              parsedInput.data,
              accessToken,
              input.organizationId,
              actionEnabled.data.integration.id
            );
            return { data: retried, error: null };
          } catch (retryError) {
            if (isAuthFailure(retryError)) {
              await deps.markIntegrationReauthRequired(
                actionEnabled.data.integration.id,
                input.organizationId,
                retryError.message
              );
            }

            return {
              data: null,
              error: getGoogleCalendarProviderErrorMessage(
                retryError,
                getExecutionFallback(parsedInput.data.action)
              ),
            };
          }
        }

        if (
          refreshResult.error?.includes("reautenticacion") ||
          refreshResult.error?.includes("refresh")
        ) {
          await deps.markIntegrationReauthRequired(
            actionEnabled.data.integration.id,
            input.organizationId,
            refreshResult.error
          );
        }

        return {
          data: null,
          error:
            refreshResult.error ?? getExecutionFallback(parsedInput.data.action),
        };
      }

      if (isAuthFailure(error)) {
        await deps.markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          error.message
        );
      }

      return {
        data: null,
        error: getGoogleCalendarProviderErrorMessage(
          error,
          getExecutionFallback(parsedInput.data.action)
        ),
      };
    }
  };
}

export const executeGoogleCalendarReadTool =
  createGoogleCalendarReadToolExecutor();

export async function executeGoogleCalendarWriteToolAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleCalendarAgentRuntime;
  actionInput: ExecuteGoogleCalendarWriteToolInput;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<GoogleCalendarWriteToolExecutionResult>> {
  const parsedInput = executeGoogleCalendarWriteToolSchema.safeParse(
    input.actionInput
  );
  if (!parsedInput.success) {
    return {
      data: null,
      error: "La accion de Google Calendar no es valida.",
    };
  }

  if (
    parsedInput.data.action !== "cancel_event" &&
    parsedInput.data.action !== "update_event_details"
  ) {
    const windowError = validateWindow(parsedInput.data);
    if (windowError) {
      return { data: null, error: windowError };
    }
  }

  const actionEnabled = assertGoogleCalendarActionEnabled(
    input.runtime,
    parsedInput.data.action
  );
  if (actionEnabled.error || !actionEnabled.data) {
    return { data: null, error: actionEnabled.error };
  }

  const configResult = await getGoogleIntegrationConfig(
    actionEnabled.data.integration.id,
    input.organizationId
  );
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        configResult.error
      );
    }

    return {
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    };
  }

  let accessToken = configResult.data.accessToken;

  try {
    const result = await runGoogleCalendarWriteAction(
      parsedInput.data,
      accessToken,
      input.organizationId,
      actionEnabled.data.integration.id,
      input.workflow
    );
    return { data: result, error: null };
  } catch (error) {
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshGoogleCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: actionEnabled.data.integration.id,
        refreshToken: configResult.data.refreshToken,
      });

      if (!refreshResult.error && refreshResult.data) {
        accessToken = refreshResult.data.accessToken;

        try {
          const retried = await runGoogleCalendarWriteAction(
            parsedInput.data,
            accessToken,
            input.organizationId,
            actionEnabled.data.integration.id,
            input.workflow
          );
          return { data: retried, error: null };
        } catch (retryError) {
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(
              actionEnabled.data.integration.id,
              input.organizationId,
              retryError.message
            );
          }

          return {
            data: null,
            error: getGoogleCalendarProviderErrorMessage(
              retryError,
              getWriteExecutionFallback(parsedInput.data.action)
            ),
          };
        }
      }

      if (
        refreshResult.error?.includes("reautenticacion") ||
        refreshResult.error?.includes("refresh")
      ) {
        await markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          refreshResult.error
        );
      }

      return {
        data: null,
        error:
          refreshResult.error ??
          getWriteExecutionFallback(parsedInput.data.action),
      };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        error.message
      );
    }

    return {
      data: null,
      error: getGoogleCalendarProviderErrorMessage(
        error,
        getWriteExecutionFallback(parsedInput.data.action)
      ),
    };
  }
}

export async function executeGoogleCalendarCompensationAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleCalendarAgentRuntime;
  compensationAction: GoogleCalendarCompensationAction;
  providerObjectId: string;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<GoogleCalendarWriteToolExecutionResult>> {
  if (input.compensationAction !== "cancel_created_event") {
    return {
      data: null,
      error: "Compensacion de Google Calendar no soportada.",
    };
  }

  return executeGoogleCalendarWriteToolAction({
    organizationId: input.organizationId,
    userId: input.userId,
    agentId: input.agentId,
    runtime: input.runtime,
    actionInput: {
      action: "cancel_event",
      eventId: input.providerObjectId,
    },
    workflow: input.workflow,
  });
}

export function toGoogleCalendarRuntimeSafeError(
  error: string,
  action?: GoogleCalendarAction
): GoogleAgentRuntimeSafeError {
  if (error.includes("reautenticacion")) {
    return {
      ok: false,
      surface: "google_calendar",
      action,
      code: "integration_unavailable",
      message: "La integracion necesita reautenticacion antes de volver a operar.",
      retryable: false,
    };
  }

  if (error.includes("presupuesto") || error.includes("velocidad")) {
    return {
      ok: false,
      surface: "google_calendar",
      action,
      code: "rate_limited",
      message: "Google Calendar pidio bajar la velocidad. Reintenta en unos minutos.",
      retryable: true,
    };
  }

  if (error.includes("permisos insuficientes") || error.includes("scopes")) {
    return {
      ok: false,
      surface: "google_calendar",
      action,
      code: "integration_unavailable",
      message: error,
      retryable: false,
    };
  }

  if (error.includes("valida") || error.includes("ventana")) {
    return {
      ok: false,
      surface: "google_calendar",
      action,
      code: "validation_error",
      message: error,
      retryable: false,
    };
  }

  return {
    ok: false,
    surface: "google_calendar",
    action,
    code: "provider_error",
    message: error,
    retryable: true,
  };
}
