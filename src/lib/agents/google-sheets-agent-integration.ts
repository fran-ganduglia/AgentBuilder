import "server-only";

import type { AgentSetupState, SetupResolutionContext } from "@/lib/agents/agent-setup";
import { listAgentTools } from "@/lib/db/agent-tools";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getIntegrationOperationalView,
  type IntegrationOperationalView,
} from "@/lib/integrations/metadata";
import { getGoogleSheetsAgentToolDiagnostics } from "@/lib/integrations/google-agent-tool-selection";
import { hasAllGoogleScopesForSurface } from "@/lib/integrations/google-scopes";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

export type GoogleSheetsAgentIntegrationStatus =
  | "not_required"
  | "linked"
  | "missing_integration"
  | "integration_unavailable"
  | "missing_scope"
  | "missing_tool"
  | "tool_disabled"
  | "invalid_tool_config";

export type GoogleSheetsAgentIntegrationState = {
  expectsGoogleSheetsIntegration: boolean;
  status: GoogleSheetsAgentIntegrationStatus;
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
  expectsGoogleSheetsIntegration: boolean;
  status: GoogleSheetsAgentIntegrationStatus;
  integration?: Integration | null;
  tool?: Tables<"agent_tools"> | null;
  hasUsableIntegration?: boolean;
  hasEnabledTool?: boolean;
  message: string;
}): GoogleSheetsAgentIntegrationState {
  return {
    expectsGoogleSheetsIntegration: input.expectsGoogleSheetsIntegration,
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

export function setupStateExpectsGoogleSheetsIntegration(
  setupState: AgentSetupState | null | undefined
): boolean {
  return Boolean(setupState && setupState.integrations.includes("google_sheets"));
}

export function buildGoogleSheetsSetupResolutionContext(
  state: GoogleSheetsAgentIntegrationState | null | undefined
): SetupResolutionContext["providerIntegrations"] {
  if (!state?.expectsGoogleSheetsIntegration) {
    return undefined;
  }

  return {
    google_sheets: {
      isUsable: state.hasUsableIntegration,
      hasEnabledTool: state.hasEnabledTool,
      checklistLabel: getGoogleSheetsChecklistLabel(state),
      checklistDescription: state.message,
    },
  };
}

function getGoogleSheetsChecklistLabel(
  state: GoogleSheetsAgentIntegrationState
): string {
  if (state.status === "missing_integration") {
    return "Conectar Google Sheets";
  }

  if (state.status === "integration_unavailable" || state.status === "missing_scope") {
    return "Reconectar Google Sheets";
  }

  if (
    state.status === "missing_tool" ||
    state.status === "tool_disabled" ||
    state.status === "invalid_tool_config"
  ) {
    return "Habilitar tool Google Sheets";
  }

  return "Conectar Google Sheets y habilitar tool";
}

export async function getGoogleSheetsAgentIntegrationState(input: {
  agentId: string;
  organizationId: string;
  setupState: AgentSetupState | null | undefined;
}): Promise<DbResult<GoogleSheetsAgentIntegrationState>> {
  const expectsGoogleSheetsIntegration =
    setupStateExpectsGoogleSheetsIntegration(input.setupState);
  if (!expectsGoogleSheetsIntegration) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: false,
        status: "not_required",
        message: "Este agente no requiere Google Sheets.",
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
  const toolDiagnostics = getGoogleSheetsAgentToolDiagnostics(
    toolsResult.data ?? [],
    integration?.id ?? null
  );
  const integrationUsable = Boolean(integration && assertUsableIntegration(integration).ok);

  if (!integration) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "missing_integration",
        tool: toolDiagnostics.selectedTool,
        message: "Conecta Google Workspace desde Settings > Integraciones para habilitar Sheets en este agente.",
      }),
      error: null,
    };
  }

  if (!integrationUsable) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "integration_unavailable",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google existe, pero necesita reconexion o revision antes de dejar Google Sheets configurado para este agente.",
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
    "google_sheets"
  );

  if (!hasRequiredScopes) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "missing_scope",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google esta activa, pero faltan scopes de Sheets. Reconecta la superficie para dejarla configurada en este agente.",
      }),
      error: null,
    };
  }

  if (!toolDiagnostics.selectedTool) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "missing_tool",
        integration,
        hasUsableIntegration: true,
        message: "Google Sheets ya esta disponible para la organizacion, pero este agente todavia no tiene su configuracion guardada.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.integration_id !== integration.id) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "invalid_tool_config",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Google Sheets quedo desalineada con la integracion Google activa. Vuelve a guardarla desde la configuracion del agente.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.is_enabled !== true) {
    return {
      data: buildState({
        expectsGoogleSheetsIntegration: true,
        status: "tool_disabled",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Google Sheets existe, pero esta deshabilitada para este agente.",
      }),
      error: null,
    };
  }

  return {
    data: buildState({
      expectsGoogleSheetsIntegration: true,
      status: "linked",
      integration,
      tool: toolDiagnostics.selectedTool,
      hasUsableIntegration: true,
      hasEnabledTool: true,
      message: "Google Sheets quedo configurado para lecturas directas en chat y escrituras mediadas por approval inbox.",
    }),
    error: null,
  };
}

export function getGoogleSheetsIntegrationCta(
  state: GoogleSheetsAgentIntegrationState
): {
  href: string;
  label: string;
} | null {
  if (!state.expectsGoogleSheetsIntegration || state.status === "linked") {
    return null;
  }

  if (
    state.status === "missing_integration" ||
    state.status === "integration_unavailable" ||
    state.status === "missing_scope"
  ) {
    return { href: "/settings/integrations", label: "Abrir integraciones" };
  }

  return { href: "#agent-tools-sheets", label: "Abrir tools del agente" };
}
