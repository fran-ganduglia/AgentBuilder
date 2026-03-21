import "server-only";

import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import {
  requestGoogleCalendar,
  requestGoogleGmail,
  requestGoogleSheets,
} from "@/lib/integrations/google";
import type { RuntimeClarificationOption } from "@/lib/chat/runtime-clarification";
import { getActionDefinitionV1 } from "@/lib/runtime/action-catalog";
import type { RuntimeActionType } from "@/lib/runtime/types";

const CANDIDATE_FETCH_TIMEOUT_MS = 2000;
const DEFAULT_MAX_CANDIDATES = 8;

type CandidateFetcherRuntimes = {
  gmail: { integration: { id: string } } | null;
  google_calendar: { integration: { id: string } } | null;
  google_sheets: { integration: { id: string } } | null;
  salesforce: unknown | null;
};

type GmailThreadsListResponse = {
  threads?: Array<{ id?: string }>;
};

type GmailThreadMetadataResponse = {
  messages?: Array<{
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
    };
  }>;
};

type GmailLabelsListResponse = {
  labels?: Array<{ id?: string; name?: string; type?: string }>;
};

type GoogleCalendarEventsListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
  }>;
};

type GoogleSheetsSpreadsheetResponse = {
  sheets?: Array<{
    properties?: { title?: string };
  }>;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
  return Promise.race([promise, timeout]);
}

function getSubjectHeader(
  headers: Array<{ name?: string; value?: string }> | undefined
): string | null {
  const header = headers?.find((h) => h.name?.toLowerCase() === "subject");
  const value = header?.value;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 120)
    : null;
}

async function fetchThreadCandidates(
  organizationId: string,
  runtimes: CandidateFetcherRuntimes,
  maxResults: number
): Promise<RuntimeClarificationOption[]> {
  const gmailRuntime = runtimes.gmail;
  if (!gmailRuntime) {
    return [];
  }

  try {
    const configResult = await withTimeout(
      getGoogleIntegrationConfig(gmailRuntime.integration.id, organizationId),
      CANDIDATE_FETCH_TIMEOUT_MS
    );
    if (configResult.error || !configResult.data) {
      return [];
    }

    const { accessToken } = configResult.data;

    const listResponse = await withTimeout(
      requestGoogleGmail<GmailThreadsListResponse>(
        accessToken,
        `/gmail/v1/users/me/threads?maxResults=${maxResults}&labelIds=INBOX`,
        { method: "GET" }
      ),
      CANDIDATE_FETCH_TIMEOUT_MS
    );

    const threads = listResponse.data.threads ?? [];
    if (threads.length === 0) {
      return [];
    }

    const candidates: RuntimeClarificationOption[] = [];

    for (const thread of threads) {
      const threadId = thread.id?.trim();
      if (!threadId) {
        continue;
      }

      try {
        const threadResponse = await withTimeout(
          requestGoogleGmail<GmailThreadMetadataResponse>(
            accessToken,
            `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Subject`,
            { method: "GET" }
          ),
          CANDIDATE_FETCH_TIMEOUT_MS
        );

        const subject = getSubjectHeader(
          threadResponse.data.messages?.[0]?.payload?.headers
        );

        candidates.push({
          value: threadId,
          label: subject ?? `Hilo ${threadId.slice(0, 8)}`,
        });
      } catch {
        candidates.push({
          value: threadId,
          label: `Hilo ${threadId.slice(0, 8)}`,
        });
      }
    }

    return candidates;
  } catch {
    return [];
  }
}

async function fetchEventCandidates(
  organizationId: string,
  runtimes: CandidateFetcherRuntimes,
  maxResults: number
): Promise<RuntimeClarificationOption[]> {
  const calendarRuntime = runtimes.google_calendar;
  if (!calendarRuntime) {
    return [];
  }

  try {
    const configResult = await withTimeout(
      getGoogleIntegrationConfig(calendarRuntime.integration.id, organizationId),
      CANDIDATE_FETCH_TIMEOUT_MS
    );
    if (configResult.error || !configResult.data) {
      return [];
    }

    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const timeMin = encodeURIComponent(now.toISOString());
    const timeMax = encodeURIComponent(oneWeekLater.toISOString());

    const response = await withTimeout(
      requestGoogleCalendar<GoogleCalendarEventsListResponse>(
        configResult.data.accessToken,
        `/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`,
        { method: "GET" }
      ),
      CANDIDATE_FETCH_TIMEOUT_MS
    );

    return (response.data.items ?? [])
      .filter((item) => Boolean(item.id) && Boolean(item.summary))
      .map((item) => {
        const start = item.start?.dateTime ?? item.start?.date ?? "";
        const dateStr = start
          ? new Date(start).toLocaleDateString("es-AR", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : "";
        const label = dateStr
          ? `${item.summary} (${dateStr})`
          : (item.summary ?? item.id!);

        return {
          value: item.id!,
          label: label.slice(0, 120),
        };
      });
  } catch {
    return [];
  }
}

async function fetchLabelCandidates(
  organizationId: string,
  runtimes: CandidateFetcherRuntimes
): Promise<RuntimeClarificationOption[]> {
  const gmailRuntime = runtimes.gmail;
  if (!gmailRuntime) {
    return [];
  }

  try {
    const configResult = await withTimeout(
      getGoogleIntegrationConfig(gmailRuntime.integration.id, organizationId),
      CANDIDATE_FETCH_TIMEOUT_MS
    );
    if (configResult.error || !configResult.data) {
      return [];
    }

    const response = await withTimeout(
      requestGoogleGmail<GmailLabelsListResponse>(
        configResult.data.accessToken,
        "/gmail/v1/users/me/labels",
        { method: "GET" }
      ),
      CANDIDATE_FETCH_TIMEOUT_MS
    );

    return (response.data.labels ?? [])
      .filter((label) => label.type === "user" && label.id && label.name)
      .map((label) => ({
        value: label.name!,
        label: label.name!,
      }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

async function fetchSheetTabCandidates(
  organizationId: string,
  runtimes: CandidateFetcherRuntimes,
  conversationMetadata: Record<string, unknown>
): Promise<RuntimeClarificationOption[]> {
  const sheetsRuntime = runtimes.google_sheets;
  if (!sheetsRuntime) {
    return [];
  }

  const spreadsheetId =
    typeof conversationMetadata.runtime_last_spreadsheet_id === "string"
      ? conversationMetadata.runtime_last_spreadsheet_id
      : null;

  if (!spreadsheetId) {
    return [];
  }

  try {
    const configResult = await withTimeout(
      getGoogleIntegrationConfig(sheetsRuntime.integration.id, organizationId),
      CANDIDATE_FETCH_TIMEOUT_MS
    );
    if (configResult.error || !configResult.data) {
      return [];
    }

    const response = await withTimeout(
      requestGoogleSheets<GoogleSheetsSpreadsheetResponse>(
        configResult.data.accessToken,
        `/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
        { method: "GET" }
      ),
      CANDIDATE_FETCH_TIMEOUT_MS
    );

    return (response.data.sheets ?? [])
      .filter((sheet) => Boolean(sheet.properties?.title))
      .map((sheet) => ({
        value: sheet.properties!.title!,
        label: sheet.properties!.title!,
      }));
  } catch {
    return [];
  }
}

export async function fetchCandidateOptionsForMissingFields(input: {
  organizationId: string;
  agentId: string;
  actionType: RuntimeActionType;
  missingFields: string[];
  runtimes: CandidateFetcherRuntimes;
  conversationMetadata: Record<string, unknown>;
  maxCandidatesPerField?: number;
}): Promise<Record<string, RuntimeClarificationOption[]>> {
  const maxCandidates = input.maxCandidatesPerField ?? DEFAULT_MAX_CANDIDATES;
  const definition = getActionDefinitionV1(input.actionType);
  const result: Record<string, RuntimeClarificationOption[]> = {};

  await Promise.all(
    input.missingFields.map(async (fieldKey) => {
      const contract = definition.input.params[fieldKey];
      const resourceFamily = contract?.resourceFamily;
      if (!resourceFamily) {
        return;
      }

      let candidates: RuntimeClarificationOption[] = [];

      if (resourceFamily === "thread") {
        candidates = await fetchThreadCandidates(
          input.organizationId,
          input.runtimes,
          maxCandidates
        );
      } else if (resourceFamily === "event") {
        candidates = await fetchEventCandidates(
          input.organizationId,
          input.runtimes,
          maxCandidates
        );
      } else if (resourceFamily === "label") {
        candidates = await fetchLabelCandidates(input.organizationId, input.runtimes);
      } else if (resourceFamily === "sheet" || resourceFamily === "spreadsheet") {
        candidates = await fetchSheetTabCandidates(
          input.organizationId,
          input.runtimes,
          input.conversationMetadata
        );
      }

      if (candidates.length > 0) {
        result[fieldKey] = candidates.slice(0, maxCandidates);
      }
    })
  );

  return result;
}
