import "server-only";

import type { AgentScope } from "../agents/agent-scope";
import { readAgentSetupState } from "../agents/agent-setup-state";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";
import type { WizardIntegrationId } from "../agents/wizard-integrations";
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

type ChatQuickActionAction = SalesforceCrmAction | string;

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
};

const ASSISTANCE_QUICK_ACTIONS_BY_SCOPE: Record<
  AgentScope,
  readonly QuickActionCatalog<never>[]
> = {
  support: [
    {
      id: "summarize-case",
      label: "Resumir caso",
      prompt:
        "Resumi el caso actual, identifica el problema principal y destacame el dato mas importante para soporte.",
      priority: 10,
    },
    {
      id: "next-support-step",
      label: "Siguiente paso de soporte",
      prompt:
        "Sugerime el siguiente paso de soporte mas conveniente segun lo que ya sabemos en esta conversacion.",
      priority: 20,
    },
    {
      id: "handoff-note",
      label: "Preparar handoff",
      prompt:
        "Redactame un handoff breve y accionable para escalar este caso de soporte.",
      priority: 30,
    },
  ],
  sales: [
    {
      id: "summarize-opportunity",
      label: "Resumir oportunidad",
      prompt:
        "Resumi la oportunidad actual y destacame la mejor senal comercial de esta conversacion.",
      priority: 10,
    },
    {
      id: "next-sales-step",
      label: "Siguiente paso comercial",
      prompt:
        "Sugerime el siguiente paso comercial mas conveniente para avanzar esta oportunidad.",
      priority: 20,
    },
    {
      id: "draft-follow-up",
      label: "Redactar follow-up",
      prompt:
        "Redactame un follow-up comercial breve y accionable para avanzar con este prospecto.",
      priority: 30,
    },
  ],
  operations: [
    {
      id: "summarize-status",
      label: "Resumir estado",
      prompt:
        "Resumi el estado operativo actual de esta conversacion y destacame el dato mas importante.",
      priority: 10,
    },
    {
      id: "next-operational-step",
      label: "Siguiente paso operativo",
      prompt:
        "Sugerime el siguiente paso operativo mas conveniente segun el contexto actual.",
      priority: 20,
    },
    {
      id: "draft-update",
      label: "Redactar update",
      prompt:
        "Redactame un update operativo breve y accionable para compartir con el equipo.",
      priority: 30,
    },
  ],
};

const SALESFORCE_SHORTCUTS_BY_SCOPE: Record<
  AgentScope,
  readonly QuickActionCatalog<SalesforceCrmAction>[]
> = {
  support: [
    {
      id: "lookup_cases",
      action: "lookup_cases",
      label: "Ver cases abiertos",
      prompt: "Mostrame los cases abiertos en Salesforce y prioriza los urgentes.",
      priority: 10,
    },
    {
      id: "lookup_records",
      action: "lookup_records",
      label: "Buscar cliente",
      prompt: "Busca un cliente o contacto en Salesforce para revisar su contexto de soporte.",
      priority: 20,
    },
  ],
  sales: [
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
      id: "summarize_pipeline",
      action: "summarize_pipeline",
      label: "Resumir pipeline",
      prompt: "Resumi el pipeline actual de Salesforce.",
      priority: 40,
    },
    {
      id: "list_leads_recent",
      action: "list_leads_recent",
      label: "Ver leads recientes",
      prompt: "Mostrame los leads mas recientes en Salesforce.",
      priority: 50,
    },
  ],
  operations: [
    {
      id: "summarize_pipeline",
      action: "summarize_pipeline",
      label: "Resumen operativo CRM",
      prompt: "Resumi el estado operativo actual del CRM en Salesforce.",
      priority: 10,
    },
    {
      id: "lookup_accounts",
      action: "lookup_accounts",
      label: "Buscar cuenta",
      prompt: "Busca una cuenta en Salesforce y resumime el contexto operativo relevante.",
      priority: 20,
    },
    {
      id: "lookup_records",
      action: "lookup_records",
      label: "Buscar contacto",
      prompt: "Busca un contacto en Salesforce y resumime el contexto operativo relevante.",
      priority: 30,
    },
  ],
};

const GMAIL_SHORTCUTS_BY_SCOPE: Record<
  AgentScope,
  readonly QuickActionCatalog<string>[]
> = {
  support: [
    {
      id: "search_threads_support_backlog",
      action: "search_threads",
      label: "Casos sin responder",
      prompt: "Buscame los emails de soporte sin responder de los ultimos 7 dias en Gmail.",
      priority: 10,
    },
    {
      id: "search_threads_support_today",
      action: "search_threads",
      label: "Inbox de soporte",
      prompt: "Resumime los emails de clientes que requieren respuesta hoy en Gmail.",
      priority: 20,
    },
  ],
  sales: [
    {
      id: "search_threads_sales_backlog",
      action: "search_threads",
      label: "Prospectos sin responder",
      prompt: "Buscame los emails comerciales sin responder de los ultimos 7 dias en Gmail.",
      priority: 10,
    },
    {
      id: "search_threads_sales_today",
      action: "search_threads",
      label: "Follow-ups de hoy",
      prompt: "Resumime los follow-ups comerciales pendientes de hoy en Gmail.",
      priority: 20,
    },
  ],
  operations: [
    {
      id: "search_threads_ops_today",
      action: "search_threads",
      label: "Bandeja operativa",
      prompt: "Resumime los emails operativos importantes que llegaron hoy en Gmail.",
      priority: 10,
    },
    {
      id: "search_threads_ops_backlog",
      action: "search_threads",
      label: "Pendientes internos",
      prompt: "Buscame los emails internos pendientes de respuesta de los ultimos 7 dias en Gmail.",
      priority: 20,
    },
  ],
};

const GOOGLE_CALENDAR_SHORTCUTS_BY_SCOPE: Record<
  AgentScope,
  readonly QuickActionCatalog<string>[]
> = {
  support: [
    {
      id: "list_events_support_today",
      action: "list_events",
      label: "Agenda de soporte",
      prompt: "Mostrame las reuniones o handoffs de soporte de hoy en Google Calendar.",
      priority: 10,
    },
  ],
  sales: [
    {
      id: "list_events_sales_today",
      action: "list_events",
      label: "Agenda comercial",
      prompt: "Mostrame la agenda comercial de hoy en Google Calendar.",
      priority: 10,
    },
    {
      id: "check_availability_sales",
      action: "check_availability",
      label: "Huecos para demos",
      prompt: "Verifica mi disponibilidad para demos esta semana en Google Calendar.",
      priority: 20,
    },
  ],
  operations: [
    {
      id: "list_events_ops_today",
      action: "list_events",
      label: "Agenda de hoy",
      prompt: "Mostrame los eventos operativos de hoy en Google Calendar.",
      priority: 10,
    },
    {
      id: "check_availability_ops",
      action: "check_availability",
      label: "Verificar disponibilidad",
      prompt: "Verifica la disponibilidad operativa de esta semana en Google Calendar.",
      priority: 20,
    },
  ],
};

const defaultDeps: ResolveChatQuickActionsDeps = {
  async loadSalesforceRuntime(agentId, organizationId) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.getSalesforceAgentToolRuntime(agentId, organizationId);
  },
  async assertSalesforceRuntimeUsable(runtime) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.assertSalesforceRuntimeUsable(runtime as never);
  },
};

function buildAssistanceQuickActions(
  provider: ChatQuickActionProvider,
  agentScope: AgentScope
): ChatQuickAction[] {
  return ASSISTANCE_QUICK_ACTIONS_BY_SCOPE[agentScope].map((action) => ({
    id: `${provider}:assistant:${action.id}`,
    provider,
    section: "assistant" as ChatQuickActionSection,
    label: action.label,
    prompt: action.prompt,
    priority: action.priority,
  }));
}

function buildCrmQuickActions<TAction extends ChatQuickActionAction>(
  provider: ChatQuickActionProvider,
  catalog: readonly QuickActionCatalog<TAction>[],
  allowedActions?: ReadonlySet<string>
): ChatQuickAction[] {
  return catalog
    .filter(
      (action) =>
        !allowedActions || !action.action || allowedActions.has(action.action as string)
    )
    .map((action) => ({
      id: `${provider}:crm_shortcuts:${action.id}`,
      provider,
      section: "crm_shortcuts" as ChatQuickActionSection,
      label: action.label,
      prompt: action.prompt,
      priority: action.priority,
      action: action.action as string | undefined,
    }));
}

function mapStarterIntentsToQuickActions(
  intents: ChatStarterIntent[]
): ChatQuickAction[] {
  return intents.slice(0, 2).map((intent) => ({
    id: `${intent.provider}:template_playbook:${intent.id}`,
    provider: intent.provider,
    section: "template_playbook" as ChatQuickActionSection,
    label: intent.label,
    prompt: intent.prompt,
    priority: intent.priority,
    action: intent.action,
  }));
}

async function resolveSalesforceQuickActions(
  agent: Agent,
  agentScope: AgentScope,
  deps: ResolveChatQuickActionsDeps
): Promise<{
  provider: ChatQuickActionProvider;
  isRuntimeUsable: boolean;
  assistance: ChatQuickAction[];
  crmShortcuts: ChatQuickAction[];
}> {
  const assistance = buildAssistanceQuickActions("salesforce", agentScope);
  const runtimeResult = await deps.loadSalesforceRuntime(agent.id, agent.organization_id);

  if (runtimeResult.error || !runtimeResult.data) {
    return {
      provider: "salesforce",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
    };
  }

  const usableRuntime = await deps.assertSalesforceRuntimeUsable(runtimeResult.data);

  if (usableRuntime.error || !usableRuntime.data) {
    return {
      provider: "salesforce",
      isRuntimeUsable: false,
      assistance,
      crmShortcuts: [],
    };
  }

  const allowedSet = new Set<string>(usableRuntime.data.config.allowed_actions);
  return {
    provider: "salesforce",
    isRuntimeUsable: true,
    assistance,
    crmShortcuts: buildCrmQuickActions(
      "salesforce",
      SALESFORCE_SHORTCUTS_BY_SCOPE[agentScope],
      allowedSet
    ),
  };
}

function resolveGmailQuickActions(agentScope: AgentScope): {
  provider: ChatQuickActionProvider;
  isRuntimeUsable: boolean;
  assistance: ChatQuickAction[];
  crmShortcuts: ChatQuickAction[];
} {
  return {
    provider: "gmail",
    isRuntimeUsable: true,
    assistance: buildAssistanceQuickActions("gmail", agentScope),
    crmShortcuts: buildCrmQuickActions("gmail", GMAIL_SHORTCUTS_BY_SCOPE[agentScope]),
  };
}

function resolveGoogleCalendarQuickActions(agentScope: AgentScope): {
  provider: ChatQuickActionProvider;
  isRuntimeUsable: boolean;
  assistance: ChatQuickAction[];
  crmShortcuts: ChatQuickAction[];
} {
  return {
    provider: "google_calendar",
    isRuntimeUsable: true,
    assistance: buildAssistanceQuickActions("google_calendar", agentScope),
    crmShortcuts: buildCrmQuickActions(
      "google_calendar",
      GOOGLE_CALENDAR_SHORTCUTS_BY_SCOPE[agentScope]
    ),
  };
}

export async function resolveChatQuickActions(
  agent: Agent,
  deps: ResolveChatQuickActionsDeps = defaultDeps
): Promise<ResolvedChatQuickActions> {
  const setupState = readAgentSetupState(agent);

  if (!setupState || setupState.integrations.length === 0) {
    return createEmptyQuickActions();
  }

  const actionableIntegrations: WizardIntegrationId[] = setupState.integrations.filter(
    (id) => id === "salesforce" || id === "gmail" || id === "google_calendar"
  );

  if (actionableIntegrations.length === 0) {
    return createEmptyQuickActions();
  }

  const agentScope = setupState.agentScope;

  type IntegrationResult = {
    provider: ChatQuickActionProvider;
    isRuntimeUsable: boolean;
    assistance: ChatQuickAction[];
    crmShortcuts: ChatQuickAction[];
  };

  const integrationResults: IntegrationResult[] = await Promise.all(
    actionableIntegrations.map(async (integration) => {
      if (integration === "salesforce") {
        return resolveSalesforceQuickActions(agent, agentScope, deps);
      }
      if (integration === "gmail") {
        return resolveGmailQuickActions(agentScope);
      }
      return resolveGoogleCalendarQuickActions(agentScope);
    })
  );

  const providers = integrationResults.map((result) => result.provider);
  const isRuntimeUsable = integrationResults.some((result) => result.isRuntimeUsable);
  const assistance = integrationResults.flatMap((result) => result.assistance).slice(0, 3);
  const crmShortcuts = integrationResults.flatMap((result) => result.crmShortcuts);
  const starterIntents = await resolveInitialChatStarterIntents(agent, deps);
  const templatePlaybook = mapStarterIntentsToQuickActions(starterIntents);

  return {
    hasConnectedIntegrations: true,
    agentScope,
    providers,
    isRuntimeUsable,
    assistance,
    crmShortcuts,
    templatePlaybook,
  };
}
