import "server-only";

import { isHubSpotTemplateId } from "@/lib/agents/agent-templates";
import type { AgentSetupState, SetupResolutionContext } from "@/lib/agents/agent-setup";
import { listAgentTools } from "@/lib/db/agent-tools";
import { getPrimaryHubSpotIntegration } from "@/lib/db/hubspot-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getIntegrationOperationalView,
  type IntegrationOperationalView,
} from "@/lib/integrations/metadata";
import { selectPreferredHubSpotAgentTool } from "@/lib/integrations/hubspot-agent-tool-selection";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

export type HubSpotAgentIntegrationStatus =
  | "not_required"
  | "linked"
  | "missing_integration"
  | "integration_unavailable"
  | "missing_tool"
  | "tool_disabled"
  | "invalid_tool_config";

export type HubSpotAgentIntegrationState = {
  expectsHubSpotIntegration: boolean;
  status: HubSpotAgentIntegrationStatus;
  integration: Integration | null;
  integrationView: IntegrationOperationalView;
  tool: Tables<"agent_tools"> | null;
  hasUsableIntegration: boolean;
  hasEnabledTool: boolean;
  isLinked: boolean;
  message: string;
};

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;

function buildState(input: {
  expectsHubSpotIntegration: boolean;
  status: HubSpotAgentIntegrationStatus;
  integration?: Integration | null;
  tool?: AgentTool | null;
  hasUsableIntegration?: boolean;
  hasEnabledTool?: boolean;
  message: string;
}): HubSpotAgentIntegrationState {
  return {
    expectsHubSpotIntegration: input.expectsHubSpotIntegration,
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

export function setupStateExpectsHubSpotIntegration(
  setupState: AgentSetupState | null | undefined
): boolean {
  return Boolean(setupState && (isHubSpotTemplateId(setupState.template_id) || setupState.integrations.includes("hubspot")));
}

export function buildHubSpotSetupResolutionContext(
  state: HubSpotAgentIntegrationState | null | undefined
): SetupResolutionContext["providerIntegrations"] {
  if (!state?.expectsHubSpotIntegration) {
    return undefined;
  }

  return {
    hubspot: {
      isUsable: state.hasUsableIntegration,
      hasEnabledTool: state.hasEnabledTool,
      checklistLabel: getHubSpotChecklistLabel(state),
      checklistDescription: state.message,
    },
  };
}

function getHubSpotChecklistLabel(state: HubSpotAgentIntegrationState): string {
  if (state.status === "missing_integration") {
    return "Conectar HubSpot";
  }

  if (state.status === "integration_unavailable") {
    return "Reconectar HubSpot";
  }

  if (
    state.status === "missing_tool" ||
    state.status === "tool_disabled" ||
    state.status === "invalid_tool_config"
  ) {
    return "Habilitar tool CRM de HubSpot";
  }

  return "Conectar HubSpot y habilitar tool CRM";
}

export async function getHubSpotAgentIntegrationState(input: {
  agentId: string;
  organizationId: string;
  setupState: AgentSetupState | null | undefined;
}): Promise<DbResult<HubSpotAgentIntegrationState>> {
  const expectsHubSpotIntegration = setupStateExpectsHubSpotIntegration(input.setupState);
  if (!expectsHubSpotIntegration) {
    return {
      data: buildState({
        expectsHubSpotIntegration: false,
        status: "not_required",
        message: "Este agente no requiere una integracion HubSpot.",
      }),
      error: null,
    };
  }

  const [integrationResult, toolsResult] = await Promise.all([
    getPrimaryHubSpotIntegration(input.organizationId),
    listAgentTools(input.agentId, input.organizationId),
  ]);

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error };
  }

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  const integration = integrationResult.data;
  const tool = selectPreferredHubSpotAgentTool(toolsResult.data ?? [], integration?.id ?? null);
  const integrationUsable = Boolean(integration && assertUsableIntegration(integration).ok);

  if (!integration) {
    return {
      data: buildState({
        expectsHubSpotIntegration: true,
        status: "missing_integration",
        tool,
        message: "Conecta HubSpot desde Settings > Integraciones para terminar de vincular este agente.",
      }),
      error: null,
    };
  }

  if (!integrationUsable) {
    return {
      data: buildState({
        expectsHubSpotIntegration: true,
        status: "integration_unavailable",
        integration,
        tool,
        message: "La integracion de HubSpot existe, pero necesita reconexion o revision antes de que este agente pueda usarla.",
      }),
      error: null,
    };
  }

  if (!tool) {
    return {
      data: buildState({
        expectsHubSpotIntegration: true,
        status: "missing_tool",
        integration,
        hasUsableIntegration: true,
        message: "HubSpot ya esta conectado para la organizacion, pero este agente todavia no tiene guardada la tool CRM.",
      }),
      error: null,
    };
  }

  if (!tool.integration_id || tool.integration_id !== integration.id) {
    return {
      data: buildState({
        expectsHubSpotIntegration: true,
        status: "invalid_tool_config",
        integration,
        tool,
        hasUsableIntegration: true,
        message: "La tool CRM de HubSpot quedo desalineada con la integracion activa. Vuelve a guardarla desde la configuracion del agente.",
      }),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildState({
        expectsHubSpotIntegration: true,
        status: "tool_disabled",
        integration,
        tool,
        hasUsableIntegration: true,
        message: "La tool CRM de HubSpot existe, pero esta deshabilitada para este agente.",
      }),
      error: null,
    };
  }

  return {
    data: buildState({
      expectsHubSpotIntegration: true,
      status: "linked",
      integration,
      tool,
      hasUsableIntegration: true,
      hasEnabledTool: true,
      message: "HubSpot quedo vinculado a este agente y listo para operar.",
    }),
    error: null,
  };
}

export function getHubSpotIntegrationCta(state: HubSpotAgentIntegrationState): {
  href: string;
  label: string;
} | null {
  if (!state.expectsHubSpotIntegration || state.status === "linked") {
    return null;
  }

  if (state.status === "missing_integration" || state.status === "integration_unavailable") {
    return { href: "/settings/integrations", label: "Abrir integraciones" };
  }

  return { href: "#agent-tools", label: "Abrir tools del agente" };
}
