import assert from "node:assert/strict";
import { createSetupStateForTemplate } from "../agents/agent-templates";
import { resolveInitialChatStarterIntents } from "./starter-intents";
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
  const salesforceCases = [
    {
      templateId: "salesforce_lead_qualification",
      runtime: [
        "list_leads_recent",
        "list_leads_by_status",
        "lookup_records",
      ] as const satisfies readonly SalesforceCrmAction[],
      expected: [
        {
          id: "salesforce_lead_qualification:list_leads_recent",
          provider: "salesforce",
          action: "list_leads_recent",
          label: "Leads recientes",
          prompt: "Dame los leads recientes",
          priority: 10,
        },
        {
          id: "salesforce_lead_qualification:list_leads_by_status",
          provider: "salesforce",
          action: "list_leads_by_status",
          label: "Leads Open",
          prompt: "Dame los leads Open",
          priority: 20,
        },
        {
          id: "salesforce_lead_qualification:lookup_records",
          provider: "salesforce",
          action: "lookup_records",
          label: "Buscar lead/contacto",
          prompt: "Busc\u00e1 un lead o contacto por nombre",
          priority: 30,
        },
      ],
    },
    {
      templateId: "salesforce_case_triage",
      runtime: [
        "lookup_cases",
        "lookup_accounts",
        "lookup_records",
      ] as const satisfies readonly SalesforceCrmAction[],
      expected: [
        {
          id: "salesforce_case_triage:lookup_cases",
          provider: "salesforce",
          action: "lookup_cases",
          label: "Cases abiertos",
          prompt: "Mostrame los cases abiertos",
          priority: 10,
        },
        {
          id: "salesforce_case_triage:lookup_accounts",
          provider: "salesforce",
          action: "lookup_accounts",
          label: "Buscar account",
          prompt: "Busc\u00e1 la account del cliente",
          priority: 20,
        },
        {
          id: "salesforce_case_triage:lookup_records",
          provider: "salesforce",
          action: "lookup_records",
          label: "Buscar contacto",
          prompt: "Busc\u00e1 el lead o contacto asociado",
          priority: 30,
        },
      ],
    },
    {
      templateId: "salesforce_opportunity_follow_up",
      runtime: [
        "lookup_opportunities",
        "summarize_pipeline",
        "lookup_accounts",
      ] as const satisfies readonly SalesforceCrmAction[],
      expected: [
        {
          id: "salesforce_opportunity_follow_up:lookup_opportunities",
          provider: "salesforce",
          action: "lookup_opportunities",
          label: "Oportunidades abiertas",
          prompt: "Mostrame las oportunidades abiertas",
          priority: 10,
        },
        {
          id: "salesforce_opportunity_follow_up:summarize_pipeline",
          provider: "salesforce",
          action: "summarize_pipeline",
          label: "Resumir pipeline",
          prompt: "Resum\u00ed el pipeline",
          priority: 20,
        },
        {
          id: "salesforce_opportunity_follow_up:lookup_accounts",
          provider: "salesforce",
          action: "lookup_accounts",
          label: "Buscar account",
          prompt: "Busc\u00e1 la account asociada",
          priority: 30,
        },
      ],
    },
    {
      templateId: "salesforce_post_sale_handoff",
      runtime: [
        "lookup_opportunities",
        "lookup_accounts",
        "lookup_cases",
      ] as const satisfies readonly SalesforceCrmAction[],
      expected: [
        {
          id: "salesforce_post_sale_handoff:lookup_opportunities",
          provider: "salesforce",
          action: "lookup_opportunities",
          label: "Opportunity cerrada",
          prompt: "Busc\u00e1 la oportunidad cerrada a transferir",
          priority: 10,
        },
        {
          id: "salesforce_post_sale_handoff:lookup_accounts",
          provider: "salesforce",
          action: "lookup_accounts",
          label: "Account del cliente",
          prompt: "Busc\u00e1 la account del cliente",
          priority: 20,
        },
        {
          id: "salesforce_post_sale_handoff:lookup_cases",
          provider: "salesforce",
          action: "lookup_cases",
          label: "Cases abiertos",
          prompt: "Mostrame los cases abiertos del cliente",
          priority: 30,
        },
      ],
    },
  ] as const;

  for (const testCase of salesforceCases) {
    const intents = await resolveInitialChatStarterIntents(
      buildAgent(testCase.templateId),
      createDeps({
        salesforceRuntime: createSalesforceRuntime(testCase.runtime),
      })
    );

    assert.deepEqual(intents, testCase.expected);
  }

  const hubspotCases = [
    {
      templateId: "hubspot_lead_capture",
      runtime: [
        "lookup_records",
        "lookup_deals",
      ] as const satisfies readonly HubSpotCrmAction[],
      expected: [
        {
          id: "hubspot_lead_capture:lookup_records",
          provider: "hubspot",
          action: "lookup_records",
          label: "Verificar contacto/empresa",
          prompt: "Busc\u00e1 si el contacto o la empresa ya existen en HubSpot",
          priority: 10,
        },
        {
          id: "hubspot_lead_capture:lookup_deals",
          provider: "hubspot",
          action: "lookup_deals",
          label: "Revisar deals",
          prompt: "Mostrame si ya hay deals abiertos",
          priority: 20,
        },
      ],
    },
    {
      templateId: "hubspot_pipeline_follow_up",
      runtime: [
        "lookup_deals",
        "lookup_records",
      ] as const satisfies readonly HubSpotCrmAction[],
      expected: [
        {
          id: "hubspot_pipeline_follow_up:lookup_deals",
          provider: "hubspot",
          action: "lookup_deals",
          label: "Deals abiertos",
          prompt: "Mostrame los deals abiertos",
          priority: 10,
        },
        {
          id: "hubspot_pipeline_follow_up:lookup_records",
          provider: "hubspot",
          action: "lookup_records",
          label: "Buscar contacto/empresa",
          prompt: "Busc\u00e1 el contacto o la empresa asociada",
          priority: 20,
        },
      ],
    },
    {
      templateId: "hubspot_meeting_booking",
      runtime: [
        "lookup_records",
        "lookup_deals",
      ] as const satisfies readonly HubSpotCrmAction[],
      expected: [
        {
          id: "hubspot_meeting_booking:lookup_records",
          provider: "hubspot",
          action: "lookup_records",
          label: "Verificar contacto/empresa",
          prompt: "Busc\u00e1 el contacto o la empresa antes de coordinar la reuni\u00f3n",
          priority: 10,
        },
        {
          id: "hubspot_meeting_booking:lookup_deals",
          provider: "hubspot",
          action: "lookup_deals",
          label: "Deals relacionados",
          prompt: "Mostrame los deals abiertos relacionados",
          priority: 20,
        },
      ],
    },
    {
      templateId: "hubspot_reactivation_follow_up",
      runtime: [
        "lookup_deals",
        "lookup_records",
      ] as const satisfies readonly HubSpotCrmAction[],
      expected: [
        {
          id: "hubspot_reactivation_follow_up:lookup_deals",
          provider: "hubspot",
          action: "lookup_deals",
          label: "Deals recientes",
          prompt: "Mostrame los deals abiertos o m\u00e1s recientes",
          priority: 10,
        },
        {
          id: "hubspot_reactivation_follow_up:lookup_records",
          provider: "hubspot",
          action: "lookup_records",
          label: "Buscar contacto/empresa",
          prompt: "Busc\u00e1 el contacto o la empresa a reactivar",
          priority: 20,
        },
      ],
    },
  ] as const;

  for (const testCase of hubspotCases) {
    const intents = await resolveInitialChatStarterIntents(
      buildAgent(testCase.templateId),
      createDeps({
        hubspotRuntime: createHubSpotRuntime(testCase.runtime),
      })
    );

    assert.deepEqual(intents, testCase.expected);
  }

  const filteredSalesforceIntents = await resolveInitialChatStarterIntents(
    buildAgent("salesforce_lead_qualification"),
    createDeps({
      salesforceRuntime: createSalesforceRuntime([
        "list_leads_recent",
        "lookup_records",
      ]),
    })
  );
  assert.deepEqual(filteredSalesforceIntents, [
    {
      id: "salesforce_lead_qualification:list_leads_recent",
      provider: "salesforce",
      action: "list_leads_recent",
      label: "Leads recientes",
      prompt: "Dame los leads recientes",
      priority: 10,
    },
    {
      id: "salesforce_lead_qualification:lookup_records",
      provider: "salesforce",
      action: "lookup_records",
      label: "Buscar lead/contacto",
      prompt: "Busc\u00e1 un lead o contacto por nombre",
      priority: 30,
    },
  ]);

  const filteredHubSpotIntents = await resolveInitialChatStarterIntents(
    buildAgent("hubspot_pipeline_follow_up"),
    createDeps({
      hubspotRuntime: createHubSpotRuntime(["lookup_records"]),
    })
  );
  assert.deepEqual(filteredHubSpotIntents, [
    {
      id: "hubspot_pipeline_follow_up:lookup_records",
      provider: "hubspot",
      action: "lookup_records",
      label: "Buscar contacto/empresa",
      prompt: "Busc\u00e1 el contacto o la empresa asociada",
      priority: 20,
    },
  ]);

  const nonCrmIntents = await resolveInitialChatStarterIntents(
    buildAgent("web_faq"),
    createDeps({})
  );
  assert.deepEqual(nonCrmIntents, []);

  const unusableRuntimeIntents = await resolveInitialChatStarterIntents(
    buildAgent("hubspot_pipeline_follow_up"),
    createDeps({
      hubspotRuntime: createHubSpotRuntime(["lookup_deals"]),
      hubspotUsable: {
        data: null,
        error: "not usable",
      },
    })
  );
  assert.deepEqual(unusableRuntimeIntents, []);

  const hiddenCuratedIntents = await resolveInitialChatStarterIntents(
    buildAgent("salesforce_case_triage"),
    createDeps({
      salesforceRuntime: createSalesforceRuntime(["create_task"]),
    })
  );
  assert.deepEqual(hiddenCuratedIntents, []);
}

run()
  .then(() => {
    console.log("starter-intents checks passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
