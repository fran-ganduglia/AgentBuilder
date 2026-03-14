import "server-only";

import { listAgentTools, listAgentToolsWithServiceRole } from "@/lib/db/agent-tools";
import { getIntegrationById } from "@/lib/db/integration-operations";
import { getPrimaryGoogleIntegration, getPrimaryGoogleIntegrationWithServiceRole } from "@/lib/db/google-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getGmailAgentToolDiagnostics,
  getGoogleCalendarAgentToolDiagnostics,
} from "@/lib/integrations/google-agent-tool-selection";
import {
  GMAIL_TOOL_ACTIONS,
  GOOGLE_CALENDAR_TOOL_ACTIONS,
  parseGmailAgentToolConfig,
  parseGoogleCalendarAgentToolConfig,
  type GmailAgentToolConfig,
  type GmailToolAction,
  type GoogleCalendarAgentToolConfig,
  type GoogleCalendarToolAction,
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

export type GoogleAgentAction = GmailToolAction | GoogleCalendarToolAction;
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
  config: GmailAgentToolConfig | GoogleCalendarAgentToolConfig;
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
  send_reply: {
    action: "send_reply",
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
};

export function getGoogleActionPolicy(
  surface: "gmail",
  action: GmailToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: "google_calendar",
  action: GoogleCalendarToolAction
): GoogleAgentActionPolicy;
export function getGoogleActionPolicy(
  surface: GoogleSurface,
  action: GoogleAgentAction
): GoogleAgentActionPolicy {
  if (surface === "gmail") {
    return GMAIL_ACTION_POLICIES[action as GmailToolAction];
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
  config: GmailAgentToolConfig | GoogleCalendarAgentToolConfig
): GoogleAgentActionPolicy[] {
  if (surface === "gmail") {
    return (config as GmailAgentToolConfig).allowed_actions.map(
      (action) => GMAIL_ACTION_POLICIES[action]
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

  const diagnostics = surface === "gmail"
    ? getGmailAgentToolDiagnostics(tools, primaryIntegration.id)
    : getGoogleCalendarAgentToolDiagnostics(tools, primaryIntegration.id);
  const tool = diagnostics.selectedTool;

  if (!tool || !tool.integration_id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_missing",
        surface === "gmail"
          ? "Este agente todavia no tiene la tool Gmail configurada."
          : "Este agente todavia no tiene la tool Google Calendar configurada."
      ),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_disabled",
        surface === "gmail"
          ? "La tool Gmail existe, pero esta deshabilitada."
          : "La tool Google Calendar existe, pero esta deshabilitada."
      ),
      error: null,
    };
  }

  if (tool.integration_id !== primaryIntegration.id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_misaligned",
        surface === "gmail"
          ? "La tool Gmail quedo desalineada con la integracion Google activa."
          : "La tool Google Calendar quedo desalineada con la integracion Google activa."
      ),
      error: null,
    };
  }

  const config = surface === "gmail"
    ? parseGmailAgentToolConfig(tool.config)
    : parseGoogleCalendarAgentToolConfig(tool.config);

  if (!config) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_invalid",
        surface === "gmail"
          ? "La configuracion de Gmail es invalida."
          : "La configuracion de Google Calendar es invalida."
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
        surface === "gmail"
          ? "La integracion Google esta conectada, pero faltan scopes de Gmail."
          : "La integracion Google esta conectada, pero faltan scopes de Calendar."
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

  const diagnostics = surface === "gmail"
    ? getGmailAgentToolDiagnostics(tools, primaryIntegration.id)
    : getGoogleCalendarAgentToolDiagnostics(tools, primaryIntegration.id);
  const tool = diagnostics.selectedTool;

  if (!tool || !tool.integration_id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_missing",
        surface === "gmail"
          ? "Este agente todavia no tiene la tool Gmail configurada."
          : "Este agente todavia no tiene la tool Google Calendar configurada."
      ),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_disabled",
        surface === "gmail"
          ? "La tool Gmail existe, pero esta deshabilitada."
          : "La tool Google Calendar existe, pero esta deshabilitada."
      ),
      error: null,
    };
  }

  if (tool.integration_id !== primaryIntegration.id) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_misaligned",
        surface === "gmail"
          ? "La tool Gmail quedo desalineada con la integracion Google activa."
          : "La tool Google Calendar quedo desalineada con la integracion Google activa."
      ),
      error: null,
    };
  }

  const config = surface === "gmail"
    ? parseGmailAgentToolConfig(tool.config)
    : parseGoogleCalendarAgentToolConfig(tool.config);

  if (!config) {
    return {
      data: buildRuntimeError(
        surface,
        "tool_invalid",
        surface === "gmail"
          ? "La configuracion de Gmail es invalida."
          : "La configuracion de Google Calendar es invalida."
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
        surface === "gmail"
          ? "La integracion Google esta conectada, pero faltan scopes de Gmail."
          : "La integracion Google esta conectada, pero faltan scopes de Calendar."
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

  return GOOGLE_CALENDAR_TOOL_ACTIONS.map(
    (action) => GOOGLE_CALENDAR_ACTION_POLICIES[action]
  );
}
