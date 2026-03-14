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
  getGmailAgentToolDiagnostics,
} from "@/lib/integrations/google-agent-tool-selection";
import {
  hasAllGoogleScopesForSurface,
} from "@/lib/integrations/google-scopes";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

export type GmailAgentIntegrationStatus =
  | "not_required"
  | "linked"
  | "missing_integration"
  | "integration_unavailable"
  | "missing_scope"
  | "missing_tool"
  | "tool_disabled"
  | "invalid_tool_config";

export type GmailAgentIntegrationState = {
  expectsGmailIntegration: boolean;
  status: GmailAgentIntegrationStatus;
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
  expectsGmailIntegration: boolean;
  status: GmailAgentIntegrationStatus;
  integration?: Integration | null;
  tool?: Tables<"agent_tools"> | null;
  hasUsableIntegration?: boolean;
  hasEnabledTool?: boolean;
  message: string;
}): GmailAgentIntegrationState {
  return {
    expectsGmailIntegration: input.expectsGmailIntegration,
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

export function setupStateExpectsGmailIntegration(
  setupState: AgentSetupState | null | undefined
): boolean {
  return Boolean(
    setupState &&
      (setupState.template_id === "gmail_inbox_assistant" ||
        setupState.template_id === "gmail_follow_up_assistant" ||
        setupState.integrations.includes("gmail"))
  );
}

export function buildGmailSetupResolutionContext(
  state: GmailAgentIntegrationState | null | undefined
): SetupResolutionContext["providerIntegrations"] {
  if (!state?.expectsGmailIntegration) {
    return undefined;
  }

  return {
    gmail: {
      isUsable: state.hasUsableIntegration,
      hasEnabledTool: state.hasEnabledTool,
      checklistLabel: getGmailChecklistLabel(state),
      checklistDescription: state.message,
    },
  };
}

function getGmailChecklistLabel(state: GmailAgentIntegrationState): string {
  if (state.status === "missing_integration") {
    return "Conectar Gmail";
  }

  if (state.status === "integration_unavailable" || state.status === "missing_scope") {
    return "Reconectar Gmail";
  }

  if (
    state.status === "missing_tool" ||
    state.status === "tool_disabled" ||
    state.status === "invalid_tool_config"
  ) {
    return "Habilitar tool Gmail";
  }

  return "Conectar Gmail y habilitar tool";
}

export async function getGmailAgentIntegrationState(input: {
  agentId: string;
  organizationId: string;
  setupState: AgentSetupState | null | undefined;
}): Promise<DbResult<GmailAgentIntegrationState>> {
  const expectsGmailIntegration = setupStateExpectsGmailIntegration(input.setupState);
  if (!expectsGmailIntegration) {
    return {
      data: buildState({
        expectsGmailIntegration: false,
        status: "not_required",
        message: "Este agente no requiere Gmail.",
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
  const toolDiagnostics = getGmailAgentToolDiagnostics(
    toolsResult.data ?? [],
    integration?.id ?? null
  );
  const integrationUsable = Boolean(integration && assertUsableIntegration(integration).ok);

  if (!integration) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "missing_integration",
        tool: toolDiagnostics.selectedTool,
        message: "Conecta Google Workspace desde Settings > Integraciones para habilitar Gmail en este agente.",
      }),
      error: null,
    };
  }

  if (!integrationUsable) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "integration_unavailable",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google existe, pero necesita reconexion o revision antes de dejar Gmail configurado para este agente.",
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
    "gmail"
  );

  if (!hasRequiredScopes) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "missing_scope",
        integration,
        tool: toolDiagnostics.selectedTool,
        message: "La integracion Google esta activa, pero faltan scopes de Gmail. Reconecta la superficie para dejarla configurada en este agente.",
      }),
      error: null,
    };
  }

  if (!toolDiagnostics.selectedTool) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "missing_tool",
        integration,
        hasUsableIntegration: true,
        message: "Gmail ya esta disponible para la organizacion, pero este agente todavia no tiene su configuracion guardada.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.integration_id !== integration.id) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "invalid_tool_config",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Gmail quedo desalineada con la integracion Google activa. Vuelve a guardarla desde la configuracion del agente.",
      }),
      error: null,
    };
  }

  if (toolDiagnostics.selectedTool.is_enabled !== true) {
    return {
      data: buildState({
        expectsGmailIntegration: true,
        status: "tool_disabled",
        integration,
        tool: toolDiagnostics.selectedTool,
        hasUsableIntegration: true,
        message: "La tool Gmail existe, pero esta deshabilitada para este agente.",
      }),
      error: null,
    };
  }

  return {
    data: buildState({
      expectsGmailIntegration: true,
      status: "linked",
      integration,
      tool: toolDiagnostics.selectedTool,
      hasUsableIntegration: true,
      hasEnabledTool: true,
      message: "Gmail quedo configurado en este agente para lectura real y writes asistidas via approval inbox (`create_draft_reply`, `apply_label`, `archive_thread`).",
    }),
    error: null,
  };
}

export function getGmailIntegrationCta(state: GmailAgentIntegrationState): {
  href: string;
  label: string;
} | null {
  if (!state.expectsGmailIntegration || state.status === "linked") {
    return null;
  }

  if (
    state.status === "missing_integration" ||
    state.status === "integration_unavailable" ||
    state.status === "missing_scope"
  ) {
    return { href: "/settings/integrations", label: "Abrir integraciones" };
  }

  return { href: "#agent-tools-gmail", label: "Abrir tools del agente" };
}
