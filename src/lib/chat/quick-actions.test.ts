import assert from "node:assert/strict";
import { createSetupStateForTemplate } from "../agents/agent-templates";
import { resolveChatQuickActions } from "./quick-actions-server";
import {
  getChatEmptyStateQuickActions,
  resolveInlineFallbackQuickActions,
  type ResolvedChatQuickActions,
} from "./quick-actions";
import type { HubSpotCrmAction } from "../integrations/hubspot-tools";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";

type RuntimeResult<T> = {
  data: T | null;
  error: string | null;
};

type SalesforceRuntimeResult = RuntimeResult<{
  config: { allowed_actions: SalesforceCrmAction[] };
}>;

type HubSpotRuntimeResult = RuntimeResult<{
  config: { allowed_actions: HubSpotCrmAction[] };
}>;

function buildAgent(templateId: string): Agent {
  return {
    id: "agent-1",
    organization_id: "org-1",
    setup_state: createSetupStateForTemplate(templateId as never),
  } as unknown as Agent;
}

function createDeps(input: {
  salesforceRuntime?: SalesforceRuntimeResult;
  salesforceUsable?: SalesforceRuntimeResult;
  hubspotRuntime?: HubSpotRuntimeResult;
  hubspotUsable?: HubSpotRuntimeResult;
}) {
  return {
    loadSalesforceRuntime: async () =>
      input.salesforceRuntime ?? { data: null, error: "missing" },
    assertSalesforceRuntimeUsable: async () =>
      input.salesforceUsable ??
      input.salesforceRuntime ?? { data: null, error: "unusable" },
    loadHubSpotRuntime: async () =>
      input.hubspotRuntime ?? { data: null, error: "missing" },
    assertHubSpotRuntimeUsable: async () =>
      input.hubspotUsable ??
      input.hubspotRuntime ?? { data: null, error: "unusable" },
  };
}

function createSalesforceRuntime(
  allowedActions: readonly SalesforceCrmAction[]
): SalesforceRuntimeResult {
  return {
    data: {
      config: {
        allowed_actions: [...allowedActions],
      },
    },
    error: null,
  };
}

function createHubSpotRuntime(
  allowedActions: readonly HubSpotCrmAction[]
): HubSpotRuntimeResult {
  return {
    data: {
      config: {
        allowed_actions: [...allowedActions],
      },
    },
    error: null,
  };
}

async function run(): Promise<void> {
  const salesforceQuickActions = await resolveChatQuickActions(
    buildAgent("salesforce_lead_qualification"),
    createDeps({
      salesforceRuntime: createSalesforceRuntime([
        "lookup_records",
        "lookup_accounts",
        "list_leads_recent",
        "list_leads_by_status",
      ]),
    })
  );

  assert.equal(salesforceQuickActions.isCrmChat, true);
  assert.equal(salesforceQuickActions.provider, "salesforce");
  assert.equal(salesforceQuickActions.isRuntimeUsable, true);
  assert.deepEqual(
    salesforceQuickActions.assistance.map((action) => action.label),
    [
      "Resumir hallazgo",
      "Sugerir proximo paso",
      "Redactar follow-up",
    ]
  );
  assert.deepEqual(
    salesforceQuickActions.crmShortcuts.map((action) => action.label),
    [
      "Buscar lead/contacto",
      "Buscar account",
      "Ver leads recientes",
    ]
  );
  assert.deepEqual(
    salesforceQuickActions.templatePlaybook.map((action) => action.label),
    ["Leads recientes", "Leads Open"]
  );
  assert.deepEqual(
    getChatEmptyStateQuickActions(salesforceQuickActions).map(
      (action) => action.label
    ),
    ["Leads recientes", "Leads Open"]
  );
  assert.deepEqual(
    resolveInlineFallbackQuickActions(salesforceQuickActions).map(
      (action) => action.label
    ),
    [
      "Sugerir proximo paso",
      "Leads recientes",
      "Buscar lead/contacto",
    ]
  );

  const hubspotUnavailableQuickActions = await resolveChatQuickActions(
    buildAgent("hubspot_pipeline_follow_up"),
    createDeps({
      hubspotRuntime: createHubSpotRuntime(["lookup_deals"]),
      hubspotUsable: {
        data: null,
        error: "not usable",
      },
    })
  );

  assert.equal(hubspotUnavailableQuickActions.isCrmChat, true);
  assert.equal(hubspotUnavailableQuickActions.provider, "hubspot");
  assert.equal(hubspotUnavailableQuickActions.isRuntimeUsable, false);
  assert.deepEqual(
    hubspotUnavailableQuickActions.assistance.map((action) => action.label),
    [
      "Resumir hallazgo",
      "Sugerir proximo paso",
      "Redactar follow-up",
    ]
  );
  assert.deepEqual(hubspotUnavailableQuickActions.crmShortcuts, []);
  assert.deepEqual(hubspotUnavailableQuickActions.templatePlaybook, []);
  assert.deepEqual(
    getChatEmptyStateQuickActions(hubspotUnavailableQuickActions).map(
      (action) => action.label
    ),
    [
      "Resumir hallazgo",
      "Sugerir proximo paso",
      "Redactar follow-up",
    ]
  );
  assert.deepEqual(
    resolveInlineFallbackQuickActions(hubspotUnavailableQuickActions).map(
      (action) => action.label
    ),
    ["Sugerir proximo paso"]
  );

  const dedupedFallback = resolveInlineFallbackQuickActions({
    isCrmChat: true,
    provider: "salesforce",
    isRuntimeUsable: true,
    assistance: [
      {
        id: "salesforce:assistant:next-step",
        provider: "salesforce",
        section: "assistant",
        label: "Sugerir proximo paso",
        prompt: "Prompt compartido",
        priority: 20,
      },
    ],
    crmShortcuts: [
      {
        id: "salesforce:crm_shortcuts:lookup_records",
        provider: "salesforce",
        section: "crm_shortcuts",
        label: "Buscar lead/contacto",
        prompt: "Prompt alternativo",
        priority: 10,
      },
    ],
    templatePlaybook: [
      {
        id: "salesforce:template_playbook:item-1",
        provider: "salesforce",
        section: "template_playbook",
        label: "Playbook duplicado",
        prompt: "Prompt compartido",
        priority: 10,
      },
    ],
  } satisfies ResolvedChatQuickActions);
  assert.deepEqual(
    dedupedFallback.map((action) => action.label),
    ["Sugerir proximo paso", "Buscar lead/contacto"]
  );

  const nonCrmQuickActions = await resolveChatQuickActions(
    buildAgent("web_faq"),
    createDeps({})
  );
  assert.deepEqual(nonCrmQuickActions, {
    isCrmChat: false,
    provider: null,
    isRuntimeUsable: false,
    assistance: [],
    crmShortcuts: [],
    templatePlaybook: [],
  });

  console.log("quick-actions checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
