import "server-only";

import { listAgentTools } from "@/lib/db/agent-tools";
import { listAgentToolsWithServiceRole } from "@/lib/db/agent-tools-service";
import { getIntegrationById } from "@/lib/db/integration-operations";
import { getPrimaryGoogleIntegration, getPrimaryGoogleIntegrationWithServiceRole } from "@/lib/db/google-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getGmailAgentToolDiagnostics,
  getGoogleCalendarAgentToolDiagnostics,
  getGoogleDriveAgentToolDiagnostics,
  getGoogleSheetsAgentToolDiagnostics,
} from "@/lib/integrations/google-agent-tool-selection";
import {
  GMAIL_TOOL_ACTIONS,
  GOOGLE_CALENDAR_TOOL_ACTIONS,
  GOOGLE_DRIVE_TOOL_ACTIONS,
  GOOGLE_SHEETS_TOOL_ACTIONS,
  isGoogleDriveReadAction,
  isGoogleSheetsReadAction,
  parseGmailAgentToolConfig,
  parseGoogleCalendarAgentToolConfig,
  parseGoogleDriveAgentToolConfig,
  parseGoogleSheetsAgentToolConfig,
  type GmailAgentToolConfig,
  type GmailToolAction,
  type GoogleCalendarAgentToolConfig,
  type GoogleCalendarToolAction,
  type GoogleDriveAgentToolConfig,
  type GoogleDriveToolAction,
  type GoogleSheetsAgentToolConfig,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import {
  hasAllGoogleScopesForSurface,
  type GoogleSurface,
} from "@/lib/integrations/google-scopes";
import { getMetadataStringArray } from "@/lib/integrations/metadata";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;

export type GoogleAgentAction =
  | GmailToolAction
  | GoogleCalendarToolAction
  | GoogleDriveToolAction
  | GoogleSheetsToolAction;
export type GoogleActionAccess = "read" | "write";

export type GoogleAgentActionPolicy = {
  action: GoogleAgentAction;
  access: GoogleActionAccess;
  requiresConfirmation: boolean;
};

export type GoogleAgentRuntimeErrorCode =
  | "integration_missing"
  | "integration_unavailable"
  | "tool_missing"
  | "tool_invalid"
  | "tool_disabled"
  | "tool_misaligned"
  | "scope_missing";

export type GoogleAgentRuntimeError = {
  ok: false;
  code: GoogleAgentRuntimeErrorCode;
  message: string;
  surface: GoogleSurface;
};

export type GoogleAgentRuntimeSuccess = {
  ok: true;
  surface: GoogleSurface;
  tool: AgentTool;
  integration: Integration;
  grantedScopes: string[];
  actionPolicies: GoogleAgentActionPolicy[];
  config:
    | GmailAgentToolConfig
    | GoogleCalendarAgentToolConfig
    | GoogleDriveAgentToolConfig
    | GoogleSheetsAgentToolConfig;
};

export type GoogleAgentToolRuntime = GoogleAgentRuntimeSuccess | GoogleAgentRuntimeError;

export type GoogleAgentRuntimeResult = {
  ok: true;
  surface: GoogleSurface;
  action: GoogleAgentAction;
  access: GoogleActionAccess;
  requiresConfirmation: boolean;
  summary: string;
  requestId: string | null;
  data: Record<string, unknown> | null;
};

export type GoogleAgentRuntimeSafeError = {
  ok: false;
  surface: GoogleSurface;
  action?: GoogleAgentAction;
  code:
    | GoogleAgentRuntimeErrorCode
    | "provider_error"
    | "validation_error"
    | "rate_limited";
  message: string;
  retryable: boolean;
};

const GMAIL_ACTION_POLICIES: Record<GmailToolAction, GoogleAgentActionPolicy> = {
  search_threads: {
    action: "search_threads",
    access: "read",
    requiresConfirmation: false,
  },
  read_thread: {
    action: "read_thread",
    access: "read",
    requiresConfirmation: false,
  },
  create_draft_reply: {
    action: "create_draft_reply",
    access: "write",
    requiresConfirmation: true,
  },
  create_draft_email: {
    action: "create_draft_email",
    access: "write",
    requiresConfirmation: true,
  },
  send_reply: {
    action: "send_reply",
    access: "write",
    requiresConfirmation: true,
  },
  send_email: {
    action: "send_email",
    access: "write",
    requiresConfirmation: true,
  },
  archive_thread: {
    action: "archive_thread",
    access: "write",
    requiresConfirmation: true,
  },
  apply_label: {
    action: "apply_label",
    access: "write",
    requiresConfirmation: true,
  },
  mark_as_read: {
    action: "mark_as_read",
    access: "write",
    requiresConfirmation: false,
  },
  mark_as_unread: {
    action: "mark_as_unread",
    access: "write",
    requiresConfirmation: false,
  },
  star_thread: {
    action: "star_thread",
    access: "write",
    requiresConfirmation: false,
  },
  unstar_thread: {
    action: "unstar_thread",
    access: "write",
    requiresConfirmation: false,
  },
  remove_label: {
    action: "remove_label",
    access: "write",
    requiresConfirmation: true,
  },
  forward_thread: {
    action: "forward_thread",
    access: "write",
    requiresConfirmation: true,
  },
};

const GOOGLE_CALENDAR_ACTION_POLICIES: Record<
  GoogleCalendarToolAction,
  GoogleAgentActionPolicy
> = {
  check_availability: {
    action: "check_availability",
    access: "read",
    requiresConfirmation: false,
  },
  list_events: {
    action: "list_events",
    access: "read",
    requiresConfirmation: false,
  },
  get_event_details: {
    action: "get_event_details",
    access: "read",
    requiresConfirmation: false,
  },
  create_event: {
    action: "create_event",
    access: "write",
    requiresConfirmation: true,
  },
  reschedule_event: {
    action: "reschedule_event",
    access: "write",
    requiresConfirmation: true,
  },
  cancel_event: {
    action: "cancel_event",
    access: "write",
    requiresConfirmation: true,
  },
  update_event_details: {
    action: "update_event_details",
    access: "write",
    requiresConfirmation: true,
  },
};

const GOOGLE_SHEETS_ACTION_POLICIES = Object.fromEntries(
  GOOGLE_SHEETS_TOOL_ACTIONS.map((action) => [
    action,
    {
      action,
      access: isGoogleSheetsReadAction(action) ? "read" : "write",
      requiresConfirmation: !isGoogleSheetsReadAction(action),
    } satisfies GoogleAgentActionPolicy,
  ])
) as Record<GoogleSheetsToolAction, GoogleAgentActionPolicy>;

const GOOGLE_DRIVE_ACTION_POLICIES = Object.fromEntries(
  GOOGLE_DRIVE_TOOL_ACTIONS.map((action) => [
    action,
    {
      action,
      access: isGoogleDriveReadAction(action) ? "read" : "write",
      requiresConfirmation:
        action === "share_file" ||
        action === "trash_file" ||
        !isGoogleDriveReadAction(action),
    } satisfies GoogleAgentActionPolicy,
  ])
) as Record<GoogleDriveToolAction, GoogleAgentActionPolicy>;

function getGoogleSurfaceLabel(surface: GoogleSurface): string {
  if (surface === "gmail") {
    return "Gmail";
  }

  if (surface === "google_calendar") {
    return "Google Calendar";
  }

  if (surface === "google_sheets") {
    return "Google Sheets";
  }

  return "Google Drive";
}

function getGoogleSurfaceDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null,
  surface: GoogleSurface
) {
  if (surface === "gmail") {
    return getGmailAgentToolDiagnostics(tools, activeIntegrationId);
  }

  if (surface === "google_calendar") {
    return getGoogleCalendarAgentToolDiagnostics(tools, activeIntegrationId);
  }

  if (surface === "google_sheets") {
    return getGoogleSheetsAgentToolDiagnostics(tools, activeIntegrationId);
  }

  return getGoogleDriveAgentToolDiagnostics(tools, activeIntegrationId);
}

function parseGoogleSurfaceConfig(
  surface: GoogleSurface,
  value: AgentTool["config"]
):
  | GmailAgentToolConfig
  | GoogleCalendarAgentToolConfig
  | GoogleDriveAgentToolConfig
  | GoogleSheetsAgentToolConfig
  | null {
  if (surface === "gmail") {
    return parseGmailAgentToolConfig(value);
  }

  if (surface === "google_calendar") {
    return parseGoogleCalendarAgentToolConfig(value);
  }

  if (surface === "google_sheets") {
    return parseGoogleSheetsAgentToolConfig(value);
  }

  return parseGoogleDriveAgentToolConfig(value);
}

export function getGoogleActionPolicy(
  surface: "gmail",
  action: GmailToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: "google_calendar",
  action: GoogleCalendarToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: "google_sheets",
  action: GoogleSheetsToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: "google_drive",
  action: GoogleDriveToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: GoogleSurface,
  action: GoogleAgentAction
): GoogleAgentActionPolicy {
  if (surface === "gmail") {
    return GMAIL_ACTION_POLICIES[action as GmailToolAction];
  }

  if (surface === "google_sheets") {
    return GOOGLE_SHEETS_ACTION_POLICIES[action as GoogleSheetsToolAction];
  }

  if (surface === "google_drive") {
    return GOOGLE_DRIVE_ACTION_POLICIES[action as GoogleDriveToolAction];
  }

  return GOOGLE_CALENDAR_ACTION_POLICIES[action as GoogleCalendarToolAction];
}

function buildRuntimeError(
  surface: GoogleSurface,
  code: GoogleAgentRuntimeErrorCode,
  message: string
): GoogleAgentRuntimeError {
  return {
    ok: false,
    code,
    message,
    surface,
  };
}

function buildActionPolicies(
  surface: GoogleSurface,
  config:
    | GmailAgentToolConfig
    | GoogleCalendarAgentToolConfig
    | GoogleDriveAgentToolConfig
    | GoogleSheetsAgentToolConfig
): GoogleAgentActionPolicy[] {
  if (surface === "gmail") {
    return (config as GmailAgentToolConfig).allowed_actions.map(
      (action) => GMAIL_ACTION_POLICIES[action]
    );
  }

  if (surface === "google_sheets") {
    return (config as GoogleSheetsAgentToolConfig).allowed_actions.map(
      (action) => GOOGLE_SHEETS_ACTION_POLICIES[action]
    );
  }

  if (surface === "google_drive") {
    return (config as GoogleDriveAgentToolConfig).allowed_actions.map(
      (action) => GOOGLE_DRIVE_ACTION_POLICIES[action]
    );
  }

  return (config as GoogleCalendarAgentToolConfig).allowed_actions.map(
    (action) => GOOGLE_CALENDAR_ACTION_POLICIES[action]
  );
}

export async function getGoogleAgentToolRuntime(
  agentId: string,
  organizationId: string,
  surface: GoogleSurface
): Promise<DbResult<GoogleAgentToolRuntime>> {
  const [toolsResult, primaryIntegrationResult] = await Promise.all([
    listAgentTools(agentId, organizationId),
    getPrimaryGoogleIntegration(organizationId),
  ]);

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  if (primaryIntegrationResult.error) {
    return { data: null, error: primaryIntegrationResult.error };
  }

  const tools = toolsResult.data ?? [];
  const primaryIntegration = primaryIntegrationResult.data;

  if (!primaryIntegration) {
    return {
      data: buildRuntimeError(
        surface,
        "integration_missing",
        "La integracion Google todavia no esta configurada para esta organizacion."
      ),
      error: null,
    };
  }

  const integrationAccess = assertUsableIntegration(primaryIntegration);
  if (!integrationAccess.ok) {
    return {
      data: buildRuntimeError(
        surface,
        "integration_unavailable",
        "La integracion Google necesita reconexion o revision antes de volver a usarse."
      ),
      error: null,
    };
  }

  const diagnostics = getGoogleSurfaceDiagnostics(
    tools,
    primaryIntegration.id,
    surface
  );
  const tool = diagnostics.selectedTool;
  const surfaceLabel = getGoogleSurfaceLabel(surface);

  if (!tool || !tool.integration_id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_missing",
        `Este agente todavia no tiene la tool ${surfaceLabel} configurada.`
      ),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_disabled",
        `La tool ${surfaceLabel} existe, pero esta deshabilitada.`
      ),
      error: null,
    };
  }

  if (tool.integration_id !== primaryIntegration.id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_misaligned",
        `La tool ${surfaceLabel} quedo desalineada con la integracion Google activa.`
      ),
      error: null,
    };
  }

  const config = parseGoogleSurfaceConfig(surface, tool.config);

  if (!config) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_invalid",
        `La configuracion de ${surfaceLabel} es invalida.`
      ),
      error: null,
    };
  }

  const integrationResult = await getIntegrationById(tool.integration_id, organizationId);
  if (integrationResult.error || !integrationResult.data) {
    return {
      data: null,
      error:
        integrationResult.error ?? "No se pudo cargar la integracion Google configurada",
    };
  }

  const grantedScopes = getMetadataStringArray(
    integrationResult.data.metadata,
    "granted_scopes"
  );

  if (!hasAllGoogleScopesForSurface(grantedScopes, surface)) {
    return {
      data: buildRuntimeError(
        surface,
        "scope_missing",
        `La integracion Google esta conectada, pero faltan scopes de ${surfaceLabel}.`
      ),
      error: null,
    };
  }

  return {
    data: {
      ok: true,
      surface,
      tool,
      integration: integrationResult.data,
      grantedScopes,
      config,
      actionPolicies: buildActionPolicies(surface, config),
    },
    error: null,
  };
}

export async function getGoogleAgentToolRuntimeWithServiceRole(
  agentId: string,
  organizationId: string,
  surface: GoogleSurface
): Promise<DbResult<GoogleAgentToolRuntime>> {
  const [toolsResult, primaryIntegrationResult] = await Promise.all([
    listAgentToolsWithServiceRole(agentId, organizationId),
    getPrimaryGoogleIntegrationWithServiceRole(organizationId),
  ]);

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  if (primaryIntegrationResult.error) {
    return { data: null, error: primaryIntegrationResult.error };
  }

  const tools = toolsResult.data ?? [];
  const primaryIntegration = primaryIntegrationResult.data;

  if (!primaryIntegration) {
    return {
      data: buildRuntimeError(
        surface,
        "integration_missing",
        "La integracion Google todavia no esta configurada para esta organizacion."
      ),
      error: null,
    };
  }

  const integrationAccess = assertUsableIntegration(primaryIntegration);
  if (!integrationAccess.ok) {
    return {
      data: buildRuntimeError(
        surface,
        "integration_unavailable",
        "La integracion Google necesita reconexion o revision antes de volver a usarse."
      ),
      error: null,
    };
  }

  const diagnostics = getGoogleSurfaceDiagnostics(
    tools,
    primaryIntegration.id,
    surface
  );
  const tool = diagnostics.selectedTool;
  const surfaceLabel = getGoogleSurfaceLabel(surface);

  if (!tool || !tool.integration_id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_missing",
        `Este agente todavia no tiene la tool ${surfaceLabel} configurada.`
      ),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_disabled",
        `La tool ${surfaceLabel} existe, pero esta deshabilitada.`
      ),
      error: null,
    };
  }

  if (tool.integration_id !== primaryIntegration.id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_misaligned",
        `La tool ${surfaceLabel} quedo desalineada con la integracion Google activa.`
      ),
      error: null,
    };
  }

  const config = parseGoogleSurfaceConfig(surface, tool.config);

  if (!config) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_invalid",
        `La configuracion de ${surfaceLabel} es invalida.`
      ),
      error: null,
    };
  }

  const integrationResult = await getIntegrationById(tool.integration_id, organizationId);
  if (integrationResult.error || !integrationResult.data) {
    return {
      data: null,
      error:
        integrationResult.error ?? "No se pudo cargar la integracion Google configurada",
    };
  }

  const grantedScopes = getMetadataStringArray(
    integrationResult.data.metadata,
    "granted_scopes"
  );

  if (!hasAllGoogleScopesForSurface(grantedScopes, surface)) {
    return {
      data: buildRuntimeError(
        surface,
        "scope_missing",
        `La integracion Google esta conectada, pero faltan scopes de ${surfaceLabel}.`
      ),
      error: null,
    };
  }

  return {
    data: {
      ok: true,
      surface,
      tool,
      integration: integrationResult.data,
      grantedScopes,
      config,
      actionPolicies: buildActionPolicies(surface, config),
    },
    error: null,
  };
}

export function getAllGoogleActionPolicies(
  surface: GoogleSurface
): GoogleAgentActionPolicy[] {
  if (surface === "gmail") {
    return GMAIL_TOOL_ACTIONS.map((action) => GMAIL_ACTION_POLICIES[action]);
  }

  if (surface === "google_sheets") {
    return GOOGLE_SHEETS_TOOL_ACTIONS.map(
      (action) => GOOGLE_SHEETS_ACTION_POLICIES[action]
    );
  }

  if (surface === "google_drive") {
    return GOOGLE_DRIVE_TOOL_ACTIONS.map(
      (action) => GOOGLE_DRIVE_ACTION_POLICIES[action]
    );
  }

  return GOOGLE_CALENDAR_TOOL_ACTIONS.map(
    (action) => GOOGLE_CALENDAR_ACTION_POLICIES[action]
  );
}
