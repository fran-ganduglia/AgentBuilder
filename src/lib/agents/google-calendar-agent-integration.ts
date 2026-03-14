import "server-only";

import type { AgentSetupState, SetupResolutionContext } from "@/lib/agents/agent-setup";
import { listAgentTools } from "@/lib/db/agent-tools";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getIntegrationOperationalView,
  type IntegrationOperationalView,
} from "@/lib/integrations/metadata";
import {
  getGoogleCalendarAgentToolDiagnostics,
} from "@/lib/integrations/google-agent-tool-selection";
import { hasAllGoogleScopesForSurface } from "@/lib/integrations/google-scopes";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

export type GoogleCalendarAgentIntegrationStatus =
  | "not_required"
  | "linked"
  | "missing_integration"
  | "integration_unavailable"
  | "missing_scope"
  | "missing_tool"
  | "tool_disabled"
  | "invalid_tool_config";

export type GoogleCalendarAgentIntegrationState = {
  expectsGoogleCalendarIntegration: boolean;
  status: GoogleCalendarAgentIntegrationStatus;
  integration: Integration | null;
  integrationView: IntegrationOperationalView;
  tool: Tables<"agent_tools"> | null;
  hasUsableIntegration: boolean;
  hasEnabledTool: boolean;
  isLinked: boolean;
  message: string;
};

type DbResult<T> = { data: T | null; error: string | null };

function buildState(input: {
  expectsGoogleCalendarIntegration: boolean;
  status: GoogleCalendarAgentIntegrationStatus;
  integration?: Integration | null;
  tool?: Tables<"agent_tools"> | null;
  hasUsableIntegration?: boolean;
  hasEnabledTool?: boolean;
  message: string;
}): GoogleCalendarAgentIntegrationState {
  return {
    expectsGoogleCalendarIntegration: input.expectsGoogleCalendarIntegration,
    status: input.status,
    integration: input.integration ?? null,
    integrationView: getIntegrationOperationalView(input.integration ?? null),
    tool: input.tool ?? null,
    hasUsableIntegration: input.hasUsableIntegration ?? false,
    hasEnabledTool: input.hasEnabledTool ?? false,
    isLinked: input.status === "linked",
    message: input.message,
  };
}

export function setupStateExpectsGoogleCalendarIntegration(
  setupState: AgentSetupState | null | undefined
): boolean {
  return Boolean(
    setupState &&
      (setupState.template_id === "calendar_booking_assistant" ||
        setupState.template_id === "calendar_reschedule_assistant" ||
        setupState.integrations.includes("google_calendar"))
  );
}

export function buildGoogleCalendarSetupResolutionContext(
  state: GoogleCalendarAgentIntegrationState | null | undefined
): SetupResolutionContext["providerIntegrations"] {
  if (!state?.expectsGoogleCalendarIntegration) {
    return undefined;
  }

  return {
    google_calendar: {
      isUsable: state.hasUsableIntegration,
      hasEnabledTool: state.hasEnabledTool,
      checklistLabel: getGoogleCalendarChecklistLabel(state),
      checklistDescription: state.message,
    },
  };
}

function getGoogleCalendarChecklistLabel(
  state: GoogleCalendarAgentIntegrationState
): string {
  if (state.status === "missing_integration") {
    return "Conectar Google Calendar";
  }

  if (state.status === "integration_unavailable" || state.status === "missing_scope") {
    return "Reconectar Google Calendar";
  }

  if (
    state.status === "missing_tool" ||
    state.status === "tool_disabled" ||
    state.status === "invalid_tool_config"
  ) {
    return "Habilitar tool Google Calendar";
  }

  return "Conectar Google Calendar y habilitar tool";
}

export async function getGoogleCalendarAgentIntegrationState(input: {
  agentId: string;
  organizationId: string;
  setupState: AgentSetupState | null | undefined;
}): Promise<DbResult<GoogleCalendarAgentIntegrationState>> {
  const expectsGoogleCalendarIntegration =
    setupStateExpectsGoogleCalendarIntegration(input.setupState);
  if (!expectsGoogleCalendarIntegration) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: false,
        status: "not_required",
        message: "Este agente no requiere Google Calendar.",
      }),
      error: null,
    };
  }

  const [integrationResult, toolsResult] = await Promise.all([
    getPrimaryGoogleIntegration(input.organizationId),
    listAgentTools(input.agentId, input.organizationId),
  ]);

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error };
  }

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  const integration = integrationResult.data;
  const toolDiagnostics = getGoogleCalendarAgentToolDiagnostics(
    toolsResult.data ?? [],
    integration?.id ?? null
  );
  const integrationUsable = Boolean(integration && assertUsableIntegration(integration).ok);

  if (!integration) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "missing_integration",
        tool: toolDiagnostics.selectedTool,
        message: "Conecta Google Workspace desde Settings > Integraciones para habilitar Calendar en este agente.",
      }),
      error: null,
    };
  }

  if (!integrationUsable) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "integration_unavailable",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google existe, pero necesita reconexion o revision antes de dejar Calendar configurado para este agente.",
      }),
      error: null,
    };
  }

  const grantedScopes =
    integration.metadata && typeof integration.metadata === "object" && !Array.isArray(integration.metadata)
      ? Reflect.get(integration.metadata, "granted_scopes")
      : null;
  const hasRequiredScopes = hasAllGoogleScopesForSurface(
    Array.isArray(grantedScopes)
      ? grantedScopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    "google_calendar"
  );

  if (!hasRequiredScopes) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "missing_scope",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google esta activa, pero faltan scopes de Calendar. Reconecta la superficie para dejarla configurada en este agente.",
      }),
      error: null,
    };
  }

  if (!toolDiagnostics.selectedTool) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "missing_tool",
        integration,
        hasUsableIntegration: true,
        message: "Google Calendar ya esta disponible para la organizacion, pero este agente todavia no tiene su configuracion guardada.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.integration_id !== integration.id) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "invalid_tool_config",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Google Calendar quedo desalineada con la integracion Google activa. Vuelve a guardarla desde la configuracion del agente.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.is_enabled !== true) {
    return {
      data: buildState({
        expectsGoogleCalendarIntegration: true,
        status: "tool_disabled",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Google Calendar existe, pero esta deshabilitada para este agente.",
      }),
      error: null,
    };
  }

  return {
    data: buildState({
      expectsGoogleCalendarIntegration: true,
      status: "linked",
      integration,
      tool: toolDiagnostics.selectedTool,
      hasUsableIntegration: true,
      hasEnabledTool: true,
      message: "Google Calendar quedo configurado para lecturas reales en chat web. La API run y las escrituras siguen fuera de esta etapa.",
    }),
    error: null,
  };
}

export function getGoogleCalendarIntegrationCta(
  state: GoogleCalendarAgentIntegrationState
): {
  href: string;
  label: string;
} | null {
  if (!state.expectsGoogleCalendarIntegration || state.status === "linked") {
    return null;
  }

  if (
    state.status === "missing_integration" ||
    state.status === "integration_unavailable" ||
    state.status === "missing_scope"
  ) {
    return { href: "/settings/integrations", label: "Abrir integraciones" };
  }

  return { href: "#agent-tools-calendar", label: "Abrir tools del agente" };
}
