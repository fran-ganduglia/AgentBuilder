import "server-only";

import { isSalesforceTemplateId } from "@/lib/agents/agent-templates";
import type { AgentSetupState, SetupResolutionContext } from "@/lib/agents/agent-setup";
import { listAgentTools } from "@/lib/db/agent-tools";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getIntegrationOperationalView,
  type IntegrationOperationalView,
} from "@/lib/integrations/metadata";
import { selectPreferredSalesforceAgentTool } from "@/lib/integrations/salesforce-agent-tool-selection";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

export type SalesforceAgentIntegrationStatus =
  | "not_required"
  | "linked"
  | "missing_integration"
  | "integration_unavailable"
  | "missing_tool"
  | "tool_disabled"
  | "invalid_tool_config";

export type SalesforceAgentIntegrationState = {
  expectsSalesforceIntegration: boolean;
  status: SalesforceAgentIntegrationStatus;
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
  expectsSalesforceIntegration: boolean;
  status: SalesforceAgentIntegrationStatus;
  integration?: Integration | null;
  tool?: AgentTool | null;
  hasUsableIntegration?: boolean;
  hasEnabledTool?: boolean;
  message: string;
}): SalesforceAgentIntegrationState {
  return {
    expectsSalesforceIntegration: input.expectsSalesforceIntegration,
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

export function setupStateExpectsSalesforceIntegration(
  setupState: AgentSetupState | null | undefined
): boolean {
  return Boolean(setupState && isSalesforceTemplateId(setupState.template_id));
}

export function buildSalesforceSetupResolutionContext(
  state: SalesforceAgentIntegrationState | null | undefined
): SetupResolutionContext["providerIntegrations"] {
  if (!state?.expectsSalesforceIntegration) {
    return undefined;
  }

  return {
    salesforce: {
      isUsable: state.hasUsableIntegration,
      hasEnabledTool: state.hasEnabledTool,
      checklistLabel: getSalesforceChecklistLabel(state),
      checklistDescription: state.message,
    },
  };
}

function getSalesforceChecklistLabel(state: SalesforceAgentIntegrationState): string {
  if (state.status === "missing_integration") {
    return "Conectar Salesforce";
  }

  if (state.status === "integration_unavailable") {
    return "Reconectar Salesforce";
  }

  if (
    state.status === "missing_tool" ||
    state.status === "tool_disabled" ||
    state.status === "invalid_tool_config"
  ) {
    return "Habilitar tool CRM de Salesforce";
  }

  return "Conectar Salesforce y habilitar tool CRM";
}



export async function getSalesforceAgentIntegrationState(input: {
  agentId: string;
  organizationId: string;
  setupState: AgentSetupState | null | undefined;
}): Promise<DbResult<SalesforceAgentIntegrationState>> {
  const expectsSalesforceIntegration = setupStateExpectsSalesforceIntegration(input.setupState);
  if (!expectsSalesforceIntegration) {
    return {
      data: buildState({
        expectsSalesforceIntegration: false,
        status: "not_required",
        message: "Este agente no requiere una integracion Salesforce.",
      }),
      error: null,
    };
  }

  const [integrationResult, toolsResult] = await Promise.all([
    getPrimarySalesforceIntegration(input.organizationId),
    listAgentTools(input.agentId, input.organizationId),
  ]);

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error };
  }

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  const integration = integrationResult.data;
  const tool = selectPreferredSalesforceAgentTool(toolsResult.data ?? [], integration?.id ?? null);
  const integrationUsable = Boolean(integration && assertUsableIntegration(integration).ok);

  if (!integration) {
    return {
      data: buildState({
        expectsSalesforceIntegration: true,
        status: "missing_integration",
        tool,
        message: "Conecta Salesforce desde Settings > Integraciones para terminar de vincular este agente.",
      }),
      error: null,
    };
  }

  if (!integrationUsable) {
    return {
      data: buildState({
        expectsSalesforceIntegration: true,
        status: "integration_unavailable",
        integration,
        tool,
        hasUsableIntegration: false,
        message: "La integracion de Salesforce existe, pero necesita reconexion o revision antes de que este agente pueda usarla.",
      }),
      error: null,
    };
  }

  if (!tool) {
    return {
      data: buildState({
        expectsSalesforceIntegration: true,
        status: "missing_tool",
        integration,
        hasUsableIntegration: true,
        message: "Salesforce ya esta conectado para la organizacion, pero este agente todavia no tiene guardada la tool CRM.",
      }),
      error: null,
    };
  }

  if (!tool.integration_id || tool.integration_id !== integration.id) {
    return {
      data: buildState({
        expectsSalesforceIntegration: true,
        status: "invalid_tool_config",
        integration,
        tool,
        hasUsableIntegration: true,
        message: "La tool CRM de Salesforce quedo desalineada con la integracion activa. Vuelve a guardarla desde la configuracion del agente.",
      }),
      error: null,
    };
  }

  if (tool.is_enabled !== true) {
    return {
      data: buildState({
        expectsSalesforceIntegration: true,
        status: "tool_disabled",
        integration,
        tool,
        hasUsableIntegration: true,
        message: "La tool CRM de Salesforce existe, pero esta deshabilitada para este agente.",
      }),
      error: null,
    };
  }

  return {
    data: buildState({
      expectsSalesforceIntegration: true,
      status: "linked",
      integration,
      tool,
      hasUsableIntegration: true,
      hasEnabledTool: true,
      message: "Salesforce quedo vinculado a este agente y listo para operar.",
    }),
    error: null,
  };
}

export function getSalesforceIntegrationCta(state: SalesforceAgentIntegrationState): {
  href: string;
  label: string;
} | null {
  if (!state.expectsSalesforceIntegration || state.status === "linked") {
    return null;
  }

  if (state.status === "missing_integration" || state.status === "integration_unavailable") {
    return { href: "/settings/integrations", label: "Abrir integraciones" };
  }

  return { href: "#agent-tools", label: "Abrir tools del agente" };
}




