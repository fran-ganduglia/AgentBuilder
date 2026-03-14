import { isHubSpotTemplateId, isSalesforceTemplateId } from "../agents/agent-templates";
import { readAgentSetupState } from "../agents/agent-setup-state";
import type { HubSpotCrmAction } from "../integrations/hubspot-tools";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";

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

type ChatStarterIntentAction = SalesforceCrmAction | HubSpotCrmAction;

export type ChatStarterIntent = {
  id: string;
  provider: "salesforce" | "hubspot";
  action: ChatStarterIntentAction;
  label: string;
  prompt: string;
  priority: number;
};

type StarterCatalogIntent<TAction extends ChatStarterIntentAction> = Omit<
  ChatStarterIntent,
  "id"
> & {
  action: TAction;
};

type SalesforceStarterTemplateId =
  | "salesforce_lead_qualification"
  | "salesforce_case_triage"
  | "salesforce_opportunity_follow_up"
  | "salesforce_post_sale_handoff";

type HubSpotStarterTemplateId =
  | "hubspot_lead_capture"
  | "hubspot_pipeline_follow_up"
  | "hubspot_meeting_booking"
  | "hubspot_reactivation_follow_up";

type ResolveInitialChatStarterIntentsDeps = {
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

const SALESFORCE_STARTER_INTENT_CATALOG_BY_TEMPLATE = {
  salesforce_lead_qualification: [
    {
      provider: "salesforce",
      action: "list_leads_recent",
      label: "Leads recientes",
      prompt: "Dame los leads recientes",
      priority: 10,
    },
    {
      provider: "salesforce",
      action: "list_leads_by_status",
      label: "Leads Open",
      prompt: "Dame los leads Open",
      priority: 20,
    },
    {
      provider: "salesforce",
      action: "lookup_records",
      label: "Buscar lead/contacto",
      prompt: "Busc\u00e1 un lead o contacto por nombre",
      priority: 30,
    },
  ],
  salesforce_case_triage: [
    {
      provider: "salesforce",
      action: "lookup_cases",
      label: "Cases abiertos",
      prompt: "Mostrame los cases abiertos",
      priority: 10,
    },
    {
      provider: "salesforce",
      action: "lookup_accounts",
      label: "Buscar account",
      prompt: "Busc\u00e1 la account del cliente",
      priority: 20,
    },
    {
      provider: "salesforce",
      action: "lookup_records",
      label: "Buscar contacto",
      prompt: "Busc\u00e1 el lead o contacto asociado",
      priority: 30,
    },
  ],
  salesforce_opportunity_follow_up: [
    {
      provider: "salesforce",
      action: "lookup_opportunities",
      label: "Oportunidades abiertas",
      prompt: "Mostrame las oportunidades abiertas",
      priority: 10,
    },
    {
      provider: "salesforce",
      action: "summarize_pipeline",
      label: "Resumir pipeline",
      prompt: "Resum\u00ed el pipeline",
      priority: 20,
    },
    {
      provider: "salesforce",
      action: "lookup_accounts",
      label: "Buscar account",
      prompt: "Busc\u00e1 la account asociada",
      priority: 30,
    },
  ],
  salesforce_post_sale_handoff: [
    {
      provider: "salesforce",
      action: "lookup_opportunities",
      label: "Opportunity cerrada",
      prompt: "Busc\u00e1 la oportunidad cerrada a transferir",
      priority: 10,
    },
    {
      provider: "salesforce",
      action: "lookup_accounts",
      label: "Account del cliente",
      prompt: "Busc\u00e1 la account del cliente",
      priority: 20,
    },
    {
      provider: "salesforce",
      action: "lookup_cases",
      label: "Cases abiertos",
      prompt: "Mostrame los cases abiertos del cliente",
      priority: 30,
    },
  ],
} as const satisfies Record<
  SalesforceStarterTemplateId,
  readonly StarterCatalogIntent<SalesforceCrmAction>[]
>;

const HUBSPOT_STARTER_INTENT_CATALOG_BY_TEMPLATE = {
  hubspot_lead_capture: [
    {
      provider: "hubspot",
      action: "lookup_records",
      label: "Verificar contacto/empresa",
      prompt: "Busc\u00e1 si el contacto o la empresa ya existen en HubSpot",
      priority: 10,
    },
    {
      provider: "hubspot",
      action: "lookup_deals",
      label: "Revisar deals",
      prompt: "Mostrame si ya hay deals abiertos",
      priority: 20,
    },
  ],
  hubspot_pipeline_follow_up: [
    {
      provider: "hubspot",
      action: "lookup_deals",
      label: "Deals abiertos",
      prompt: "Mostrame los deals abiertos",
      priority: 10,
    },
    {
      provider: "hubspot",
      action: "lookup_records",
      label: "Buscar contacto/empresa",
      prompt: "Busc\u00e1 el contacto o la empresa asociada",
      priority: 20,
    },
  ],
  hubspot_meeting_booking: [
    {
      provider: "hubspot",
      action: "lookup_records",
      label: "Verificar contacto/empresa",
      prompt: "Busc\u00e1 el contacto o la empresa antes de coordinar la reuni\u00f3n",
      priority: 10,
    },
    {
      provider: "hubspot",
      action: "lookup_deals",
      label: "Deals relacionados",
      prompt: "Mostrame los deals abiertos relacionados",
      priority: 20,
    },
  ],
  hubspot_reactivation_follow_up: [
    {
      provider: "hubspot",
      action: "lookup_deals",
      label: "Deals recientes",
      prompt: "Mostrame los deals abiertos o m\u00e1s recientes",
      priority: 10,
    },
    {
      provider: "hubspot",
      action: "lookup_records",
      label: "Buscar contacto/empresa",
      prompt: "Busc\u00e1 el contacto o la empresa a reactivar",
      priority: 20,
    },
  ],
} as const satisfies Record<
  HubSpotStarterTemplateId,
  readonly StarterCatalogIntent<HubSpotCrmAction>[]
>;

const defaultDeps: ResolveInitialChatStarterIntentsDeps = {
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

function buildStarterIntents<TAction extends ChatStarterIntentAction>(
  templateId: string,
  catalog: readonly StarterCatalogIntent<TAction>[],
  allowedActions: readonly TAction[]
): ChatStarterIntent[] {
  const allowedActionSet = new Set(allowedActions);

  return catalog
    .filter((intent) => allowedActionSet.has(intent.action))
    .map((intent) => ({
      ...intent,
      id: `${templateId}:${intent.action}`,
    }));
}

export async function resolveInitialChatStarterIntents(
  agent: Agent,
  deps: ResolveInitialChatStarterIntentsDeps = defaultDeps
): Promise<ChatStarterIntent[]> {
  const setupState = readAgentSetupState(agent);

  if (!setupState) {
    return [];
  }

  const templateId = setupState.template_id;

  if (templateId && isSalesforceTemplateId(templateId)) {
    const catalog =
      SALESFORCE_STARTER_INTENT_CATALOG_BY_TEMPLATE[
        templateId as SalesforceStarterTemplateId
      ];
    if (!catalog) {
      return [];
    }

    const runtimeResult = await deps.loadSalesforceRuntime(
      agent.id,
      agent.organization_id
    );

    if (runtimeResult.error || !runtimeResult.data) {
      return [];
    }

    const usableRuntime = await deps.assertSalesforceRuntimeUsable(
      runtimeResult.data
    );
    if (usableRuntime.error || !usableRuntime.data) {
      return [];
    }

    return buildStarterIntents(
      templateId,
      catalog,
      usableRuntime.data.config.allowed_actions
    );
  }

  if (templateId && isHubSpotTemplateId(templateId)) {
    const catalog =
      HUBSPOT_STARTER_INTENT_CATALOG_BY_TEMPLATE[
        templateId as HubSpotStarterTemplateId
      ];
    if (!catalog) {
      return [];
    }

    const runtimeResult = await deps.loadHubSpotRuntime(
      agent.id,
      agent.organization_id
    );

    if (runtimeResult.error || !runtimeResult.data) {
      return [];
    }

    const usableRuntime = await deps.assertHubSpotRuntimeUsable(
      runtimeResult.data
    );
    if (usableRuntime.error || !usableRuntime.data) {
      return [];
    }

    return buildStarterIntents(
      templateId,
      catalog,
      usableRuntime.data.config.allowed_actions
    );
  }

  return [];
}


