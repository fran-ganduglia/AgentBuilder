import assert from "node:assert/strict";
import { createDefaultAgentSetupState, toSetupStateJson } from "../agents/agent-setup";
import type { AgentScope } from "../agents/agent-scope";
import { resolveChatQuickActions } from "./quick-actions-server";
import {
  getChatEmptyStateQuickActions,
  resolveInlineFallbackQuickActions,
  type ResolvedChatQuickActions,
} from "./quick-actions";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";

type RuntimeResult<T> = {
  data: T | null;
  error: string | null;
};

type SalesforceRuntimeResult = RuntimeResult<{
  config: { allowed_actions: SalesforceCrmAction[] };
}>;

function buildAgentWithIntegrations(
  integrations: string[],
  agentScope: AgentScope = "operations"
): Agent {
  const setupState = createDefaultAgentSetupState({
    agentScope,
    integrations: integrations as never,
  });
  return {
    id: "agent-1",
    organization_id: "org-1",
    setup_state: toSetupStateJson(setupState),
  } as unknown as Agent;
}

function createDeps(input: {
  salesforceRuntime?: SalesforceRuntimeResult;
  salesforceUsable?: SalesforceRuntimeResult;
}) {
  return {
    loadSalesforceRuntime: async () =>
      input.salesforceRuntime ?? { data: null, error: "missing" },
    assertSalesforceRuntimeUsable: async () =>
      input.salesforceUsable ??
      input.salesforceRuntime ?? { data: null, error: "unusable" },
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

async function run(): Promise<void> {
  const salesforceQuickActions = await resolveChatQuickActions(
    buildAgentWithIntegrations(["salesforce"], "sales"),
    createDeps({
      salesforceRuntime: createSalesforceRuntime([
        "lookup_records",
        "lookup_accounts",
        "list_leads_recent",
        "list_leads_by_status",
      ]),
    })
  );

  assert.equal(salesforceQuickActions.hasConnectedIntegrations, true);
  assert.equal(salesforceQuickActions.agentScope, "sales");
  assert.deepEqual(salesforceQuickActions.providers, ["salesforce"]);
  assert.equal(salesforceQuickActions.isRuntimeUsable, true);
  assert.deepEqual(
    salesforceQuickActions.assistance.map((action) => action.label),
    [
      "Resumir oportunidad",
      "Siguiente paso comercial",
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
    ["Leads recientes", "Buscar lead/contacto"]
  );
  assert.deepEqual(
    getChatEmptyStateQuickActions(salesforceQuickActions).map(
      (action) => action.label
    ),
    ["Leads recientes", "Buscar lead/contacto"]
  );
  assert.deepEqual(
    resolveInlineFallbackQuickActions(salesforceQuickActions).map(
      (action) => action.label
    ),
    [
      "Siguiente paso comercial",
      "Leads recientes",
      "Buscar lead/contacto",
    ]
  );

  const dedupedFallback = resolveInlineFallbackQuickActions({
    hasConnectedIntegrations: true,
    providers: ["salesforce"],
    isRuntimeUsable: true,
    agentScope: "sales",
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
    buildAgentWithIntegrations([]),
    createDeps({})
  );
  assert.deepEqual(nonCrmQuickActions, {
    hasConnectedIntegrations: false,
    agentScope: null,
    providers: [],
    isRuntimeUsable: false,
    assistance: [],
    crmShortcuts: [],
    templatePlaybook: [],
  });

  // Gmail integration quick actions (no runtime check)
  const gmailQuickActions = await resolveChatQuickActions(
    buildAgentWithIntegrations(["gmail"], "support"),
    createDeps({})
  );
  assert.equal(gmailQuickActions.hasConnectedIntegrations, true);
  assert.equal(gmailQuickActions.agentScope, "support");
  assert.deepEqual(gmailQuickActions.providers, ["gmail"]);
  assert.equal(gmailQuickActions.isRuntimeUsable, true);
  assert.deepEqual(
    gmailQuickActions.crmShortcuts.map((action) => action.label),
    ["Casos sin responder", "Inbox de soporte"]
  );
  assert.deepEqual(
    gmailQuickActions.templatePlaybook.map((action) => action.label),
    ["Casos sin responder", "Inbox de soporte"]
  );

  console.log("quick-actions checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
