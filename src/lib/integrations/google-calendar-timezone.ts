import "server-only";

import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import { updateIntegrationMetadata } from "@/lib/db/integration-operations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { requestGoogleCalendar } from "@/lib/integrations/google";
import { hasAllGoogleScopesForSurface } from "@/lib/integrations/google-scopes";
import {
  getGoogleCalendarTimezoneMetadata,
  mergeIntegrationMetadata,
  type GoogleCalendarTimezoneMetadata,
} from "@/lib/integrations/metadata";
import type { AgentSetupState } from "@/lib/agents/agent-setup";
import { getScheduleTaskData } from "@/lib/agents/agent-setup";

type DbResult<T> = { data: T | null; error: string | null };

type GoogleCalendarPrimaryResponse = {
  timeZone?: string;
};

type GoogleCalendarSettingResponse = {
  value?: string;
};

function isValidTimezone(timezone: string | null | undefined): timezone is string {
  if (!timezone || timezone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveGoogleCalendarAgentTimezone(input: {
  setupState: AgentSetupState | null | undefined;
  detectedTimezone?: string | null;
}): string {
  if (input.setupState) {
    for (const item of input.setupState.checklist) {
      if (item.input_kind !== "schedule") {
        continue;
      }

      const schedule = getScheduleTaskData(input.setupState, item.id, "UTC");
      if (schedule.timezoneManualOverride && isValidTimezone(schedule.timezone)) {
        return schedule.timezone;
      }
    }

    if (isValidTimezone(input.detectedTimezone)) {
      return input.detectedTimezone;
    }

    for (const item of input.setupState.checklist) {
      if (item.input_kind !== "schedule") {
        continue;
      }

      const schedule = getScheduleTaskData(input.setupState, item.id, "UTC");
      if (isValidTimezone(schedule.timezone)) {
        return schedule.timezone;
      }
    }
  } else if (isValidTimezone(input.detectedTimezone)) {
    return input.detectedTimezone;
  }

  return "UTC";
}

async function fetchGoogleCalendarTimezoneMetadata(input: {
  accessToken: string;
  organizationId: string;
  integrationId: string;
}): Promise<GoogleCalendarTimezoneMetadata> {
  const providerContext = {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    methodKey: "google_workspace.calendar.timezone_detect",
  };

  let primaryTimezone: string | null = null;
  let userTimezone: string | null = null;

  try {
    const primaryResponse = await requestGoogleCalendar<GoogleCalendarPrimaryResponse>(
      input.accessToken,
      "/users/me/calendarList/primary",
      { method: "GET" },
      providerContext
    );

    primaryTimezone = isValidTimezone(primaryResponse.data.timeZone)
      ? primaryResponse.data.timeZone
      : null;
  } catch {
    primaryTimezone = null;
  }

  if (!primaryTimezone) {
    try {
      const userResponse = await requestGoogleCalendar<GoogleCalendarSettingResponse>(
        input.accessToken,
        "/users/me/settings/timezone",
        { method: "GET" },
        providerContext
      );

      userTimezone = isValidTimezone(userResponse.data.value)
        ? userResponse.data.value
        : null;
    } catch {
      userTimezone = null;
    }
  }

  return {
    primaryTimezone,
    userTimezone,
    detectedTimezone: primaryTimezone ?? userTimezone ?? null,
  };
}

export async function resolveGoogleCalendarIntegrationTimezone(input: {
  integrationId: string;
  organizationId: string;
}): Promise<DbResult<GoogleCalendarTimezoneMetadata>> {
  const configResult = await getGoogleIntegrationConfig(
    input.integrationId,
    input.organizationId
  );

  if (configResult.error || !configResult.data) {
    return {
      data: null,
      error: configResult.error ?? "No se pudo leer la integracion Google",
    };
  }

  const cachedTimezones = getGoogleCalendarTimezoneMetadata(
    configResult.data.integration.metadata
  );
  if (cachedTimezones.detectedTimezone) {
    return { data: cachedTimezones, error: null };
  }

  if (!assertUsableIntegration(configResult.data.integration).ok) {
    return { data: cachedTimezones, error: null };
  }

  if (!hasAllGoogleScopesForSurface(configResult.data.grantedScopes, "google_calendar")) {
    return { data: cachedTimezones, error: null };
  }

  try {
    const fetchedTimezones = await fetchGoogleCalendarTimezoneMetadata({
      accessToken: configResult.data.accessToken,
      organizationId: input.organizationId,
      integrationId: input.integrationId,
    });
    const mergedMetadata = mergeIntegrationMetadata(
      configResult.data.integration.metadata,
      {
        google_calendar_primary_timezone: fetchedTimezones.primaryTimezone,
        google_calendar_user_timezone: fetchedTimezones.userTimezone,
      }
    );

    await updateIntegrationMetadata(
      input.integrationId,
      input.organizationId,
      mergedMetadata
    );

    return { data: fetchedTimezones, error: null };
  } catch {
    return { data: cachedTimezones, error: null };
  }
}
