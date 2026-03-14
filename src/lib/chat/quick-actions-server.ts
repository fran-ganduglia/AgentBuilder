import "server-only";

import { isHubSpotTemplateId, isSalesforceTemplateId } from "../agents/agent-templates";
import { readAgentSetupState } from "../agents/agent-setup-state";
import type { HubSpotCrmAction } from "../integrations/hubspot-tools";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";
import {
  createEmptyQuickActions,
  type ChatQuickAction,
  type ChatQuickActionProvider,
  type ChatQuickActionSection,
  type ResolvedChatQuickActions,
} from "./quick-actions";
import {
  resolveInitialChatStarterIntents,
  type ChatStarterIntent,
} from "./starter-intents";

type RuntimeResult<T> = {
  data: T | null;
  error: string | null;
};

type SalesforceRuntimeLike = {
  config: {
    allowed_actions: SalesforceCrmAction[];
  };
};

type HubSpotRuntimeLike = {
  config: {
    allowed_actions: HubSpotCrmAction[];
  };
};

type ChatQuickActionAction = SalesforceCrmAction | HubSpotCrmAction;

type QuickActionCatalog<TAction extends ChatQuickActionAction> = {
  action?: TAction;
  id: string;
  label: string;
  prompt: string;
  priority: number;
};

type ResolveChatQuickActionsDeps = {
  loadSalesforceRuntime: (
    agentId: string,
    organizationId: string
  ) => Promise<RuntimeResult<SalesforceRuntimeLike>>;
  assertSalesforceRuntimeUsable: (
    runtime: SalesforceRuntimeLike
  ) => Promise<RuntimeResult<SalesforceRuntimeLike>>;
  loadHubSpotRuntime: (
    agentId: string,
    organizationId: string
  ) => Promise<RuntimeResult<HubSpotRuntimeLike>>;
  assertHubSpotRuntimeUsable: (
    runtime: HubSpotRuntimeLike
  ) => Promise<RuntimeResult<HubSpotRuntimeLike>>;
};

const ASSISTANCE_QUICK_ACTIONS = [
  {
    id: "summarize-insight",
    label: "Resumir hallazgo",
    prompt:
      "Resumi el hallazgo principal de esta conversacion y destacame el dato mas importante.",
    priority: 10,
  },
  {
    id: "next-step",
    label: "Sugerir proximo paso",
    prompt:
      "Sugerime el proximo paso mas conveniente segun lo que ya sabemos en esta conversacion.",
    priority: 20,
  },
  {
    id: "follow-up",
    label: "Redactar follow-up",
    prompt:
      "Redactame un follow-up breve y accionable para avanzar con este caso.",
    priority: 30,
  },
] as const satisfies readonly QuickActionCatalog<never>[];

const SALESFORCE_CRM_SHORTCUTS = [
  {
    id: "lookup_records",
    action: "lookup_records",
    label: "Buscar lead/contacto",
    prompt: "Busca un lead o contacto por nombre en Salesforce.",
    priority: 10,
  },
  {
    id: "lookup_accounts",
    action: "lookup_accounts",
    label: "Buscar account",
    prompt: "Busca una account en Salesforce y resumime el contexto relevante.",
    priority: 20,
  },
  {
    id: "lookup_opportunities",
    action: "lookup_opportunities",
    label: "Ver oportunidades abiertas",
    prompt: "Mostrame las oportunidades abiertas en Salesforce.",
    priority: 30,
  },
  {
    id: "lookup_cases",
    action: "lookup_cases",
    label: "Ver cases abiertos",
    prompt: "Mostrame los cases abiertos en Salesforce.",
    priority: 40,
  },
  {
    id: "summarize_pipeline",
    action: "summarize_pipeline",
    label: "Resumir pipeline",
    prompt: "Resumi el pipeline actual de Salesforce.",
    priority: 50,
  },
  {
    id: "list_leads_recent",
    action: "list_leads_recent",
    label: "Ver leads recientes",
    prompt: "Mostrame los leads mas recientes en Salesforce.",
    priority: 60,
  },
] as const satisfies readonly QuickActionCatalog<SalesforceCrmAction>[];

const HUBSPOT_CRM_SHORTCUTS = [
  {
    id: "lookup_records",
    action: "lookup_records",
    label: "Buscar contacto/empresa",
    prompt: "Busca el contacto o la empresa en HubSpot y resumime lo importante.",
    priority: 10,
  },
  {
    id: "lookup_deals",
    action: "lookup_deals",
    label: "Ver deals abiertos",
    prompt: "Mostrame los deals abiertos en HubSpot.",
    priority: 20,
  },
] as const satisfies readonly QuickActionCatalog<HubSpotCrmAction>[];

const defaultDeps: ResolveChatQuickActionsDeps = {
  async loadSalesforceRuntime(agentId, organizationId) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.getSalesforceAgentToolRuntime(agentId, organizationId);
  },
  async assertSalesforceRuntimeUsable(runtime) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.assertSalesforceRuntimeUsable(runtime as never);
  },
  async loadHubSpotRuntime(agentId, organizationId) {
    const runtimeModule = await import("../integrations/hubspot-agent-runtime");
    return runtimeModule.getHubSpotAgentToolRuntime(agentId, organizationId);
  },
  async assertHubSpotRuntimeUsable(runtime) {
    const runtimeModule = await import("../integrations/hubspot-agent-runtime");
    return runtimeModule.assertHubSpotRuntimeUsable(runtime as never);
  },
};

function buildAssistanceQuickActions(
  provider: ChatQuickActionProvider
): ChatQuickAction[] {
  return ASSISTANCE_QUICK_ACTIONS.map((action) => ({
    id: `${provider}:assistant:${action.id}`,
    provider,
    section: "assistant",
    label: action.label,
    prompt: action.prompt,
    priority: action.priority,
  }));
}

function buildCrmQuickActions<TAction extends ChatQuickActionAction>(
  provider: ChatQuickActionProvider,
  section: Extract<ChatQuickActionSection, "crm_shortcuts">,
  catalog: readonly QuickActionCatalog<TAction>[],
  allowedActions: readonly TAction[]
): ChatQuickAction[] {
  const allowedActionSet = new Set(allowedActions);

  return catalog
    .filter((action) => action.action && allowedActionSet.has(action.action))
    .map((action) => ({
      id: `${provider}:${section}:${action.id}`,
      provider,
      section,
      label: action.label,
      prompt: action.prompt,
      priority: action.priority,
      action: action.action,
    }));
}

function mapStarterIntentsToQuickActions(
  intents: ChatStarterIntent[]
): ChatQuickAction[] {
  return intents.slice(0, 2).map((intent) => ({
    id: `${intent.provider}:template_playbook:${intent.id}`,
    provider: intent.provider,
    section: "template_playbook",
    label: intent.label,
    prompt: intent.prompt,
    priority: intent.priority,
    action: intent.action,
  }));
}

async function resolveSalesforceQuickActions(
  agent: Agent,
  deps: ResolveChatQuickActionsDeps
): Promise<ResolvedChatQuickActions> {
  const assistance = buildAssistanceQuickActions("salesforce");
  const runtimeResult = await deps.loadSalesforceRuntime(
    agent.id,
    agent.organization_id
  );

  if (runtimeResult.error || !runtimeResult.data) {
    return {
      isCrmChat: true,
      provider: "salesforce",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
      templatePlaybook: [],
    };
  }

  const usableRuntime = await deps.assertSalesforceRuntimeUsable(
    runtimeResult.data
  );

  if (usableRuntime.error || !usableRuntime.data) {
    return {
      isCrmChat: true,
      provider: "salesforce",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
      templatePlaybook: [],
    };
  }

  const templatePlaybook = mapStarterIntentsToQuickActions(
    await resolveInitialChatStarterIntents(agent, {
      loadSalesforceRuntime: async () => runtimeResult,
      assertSalesforceRuntimeUsable: async () => usableRuntime,
      loadHubSpotRuntime: async () => ({ data: null, error: "not_applicable" }),
      assertHubSpotRuntimeUsable: async () => ({
        data: null,
        error: "not_applicable",
      }),
    })
  );

  return {
    isCrmChat: true,
    provider: "salesforce",
    isRuntimeUsable: true,
    assistance,
    crmShortcuts: buildCrmQuickActions(
      "salesforce",
      "crm_shortcuts",
      SALESFORCE_CRM_SHORTCUTS,
      usableRuntime.data.config.allowed_actions
    ),
    templatePlaybook,
  };
}

async function resolveHubSpotQuickActions(
  agent: Agent,
  deps: ResolveChatQuickActionsDeps
): Promise<ResolvedChatQuickActions> {
  const assistance = buildAssistanceQuickActions("hubspot");
  const runtimeResult = await deps.loadHubSpotRuntime(
    agent.id,
    agent.organization_id
  );

  if (runtimeResult.error || !runtimeResult.data) {
    return {
      isCrmChat: true,
      provider: "hubspot",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
      templatePlaybook: [],
    };
  }

  const usableRuntime = await deps.assertHubSpotRuntimeUsable(runtimeResult.data);

  if (usableRuntime.error || !usableRuntime.data) {
    return {
      isCrmChat: true,
      provider: "hubspot",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
      templatePlaybook: [],
    };
  }

  const templatePlaybook = mapStarterIntentsToQuickActions(
    await resolveInitialChatStarterIntents(agent, {
      loadSalesforceRuntime: async () => ({
        data: null,
        error: "not_applicable",
      }),
      assertSalesforceRuntimeUsable: async () => ({
        data: null,
        error: "not_applicable",
      }),
      loadHubSpotRuntime: async () => runtimeResult,
      assertHubSpotRuntimeUsable: async () => usableRuntime,
    })
  );

  return {
    isCrmChat: true,
    provider: "hubspot",
    isRuntimeUsable: true,
    assistance,
    crmShortcuts: buildCrmQuickActions(
      "hubspot",
      "crm_shortcuts",
      HUBSPOT_CRM_SHORTCUTS,
      usableRuntime.data.config.allowed_actions
    ),
    templatePlaybook,
  };
}

export async function resolveChatQuickActions(
  agent: Agent,
  deps: ResolveChatQuickActionsDeps = defaultDeps
): Promise<ResolvedChatQuickActions> {
  const setupState = readAgentSetupState(agent);

  if (!setupState) {
    return createEmptyQuickActions();
  }

  if (isSalesforceTemplateId(setupState.template_id)) {
    return resolveSalesforceQuickActions(agent, deps);
  }

  if (isHubSpotTemplateId(setupState.template_id)) {
    return resolveHubSpotQuickActions(agent, deps);
  }

  return createEmptyQuickActions();
}
