import { readAgentSetupState } from "../agents/agent-setup-state";
import type { AgentScope } from "../agents/agent-scope";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";
import type { Agent } from "../../types/app";
import type { ChatQuickActionProvider } from "./quick-actions";

type RuntimeResult<T> = {
  data: T | null;
  error: string | null;
};

type SalesforceRuntimeLike = {
  config: {
    allowed_actions: SalesforceCrmAction[];
  };
};

export type ChatStarterIntent = {
  id: string;
  provider: ChatQuickActionProvider;
  action?: string;
  label: string;
  prompt: string;
  priority: number;
};

type StarterCatalogEntry = Omit<ChatStarterIntent, "id">;

type ResolveInitialChatStarterIntentsDeps = {
  loadSalesforceRuntime: (
    agentId: string,
    organizationId: string
  ) => Promise<RuntimeResult<SalesforceRuntimeLike>>;
  assertSalesforceRuntimeUsable: (
    runtime: SalesforceRuntimeLike
  ) => Promise<RuntimeResult<SalesforceRuntimeLike>>;
};

const STARTER_INTENTS_BY_SCOPE: Record<
  AgentScope,
  Partial<Record<ChatQuickActionProvider, StarterCatalogEntry[]>>
> = {
  support: {
    salesforce: [
      {
        provider: "salesforce",
        action: "lookup_cases",
        label: "Cases abiertos",
        prompt: "Mostrame los cases abiertos y priorizame los urgentes",
        priority: 10,
      },
      {
        provider: "salesforce",
        action: "lookup_records",
        label: "Buscar cliente",
        prompt: "Busca el cliente o contacto para revisar su contexto de soporte",
        priority: 20,
      },
    ],
    gmail: [
      {
        provider: "gmail",
        action: "search_threads",
        label: "Casos sin responder",
        prompt: "Buscame los emails de soporte sin responder de los ultimos 7 dias",
        priority: 10,
      },
      {
        provider: "gmail",
        action: "search_threads",
        label: "Inbox de soporte",
        prompt: "Resumime los emails de clientes que requieren respuesta hoy",
        priority: 20,
      },
    ],
    google_calendar: [
      {
        provider: "google_calendar",
        action: "list_events",
        label: "Agenda de soporte",
        prompt: "Mostrame las reuniones o handoffs de soporte de hoy",
        priority: 10,
      },
    ],
  },
  sales: {
    salesforce: [
      {
        provider: "salesforce",
        action: "list_leads_recent",
        label: "Leads recientes",
        prompt: "Dame los leads recientes",
        priority: 10,
      },
      {
        provider: "salesforce",
        action: "lookup_records",
        label: "Buscar lead/contacto",
        prompt: "Busca un lead o contacto por nombre",
        priority: 20,
      },
      {
        provider: "salesforce",
        action: "lookup_opportunities",
        label: "Oportunidades abiertas",
        prompt: "Mostrame las oportunidades abiertas",
        priority: 30,
      },
    ],
    gmail: [
      {
        provider: "gmail",
        action: "search_threads",
        label: "Prospectos sin responder",
        prompt: "Buscame los emails comerciales sin responder de los ultimos 7 dias",
        priority: 10,
      },
      {
        provider: "gmail",
        action: "search_threads",
        label: "Follow-ups de hoy",
        prompt: "Resumime los follow-ups comerciales pendientes de hoy en Gmail",
        priority: 20,
      },
    ],
    google_calendar: [
      {
        provider: "google_calendar",
        action: "list_events",
        label: "Agenda comercial",
        prompt: "Mostrame la agenda comercial de hoy en Google Calendar",
        priority: 10,
      },
      {
        provider: "google_calendar",
        action: "check_availability",
        label: "Huecos para demos",
        prompt: "Verifica mi disponibilidad para demos esta semana",
        priority: 20,
      },
    ],
  },
  operations: {
    salesforce: [
      {
        provider: "salesforce",
        action: "summarize_pipeline",
        label: "Resumen operativo CRM",
        prompt: "Resumi el estado operativo actual del CRM",
        priority: 10,
      },
      {
        provider: "salesforce",
        action: "lookup_accounts",
        label: "Buscar cuenta",
        prompt: "Busca una cuenta y resumime el contexto operativo relevante",
        priority: 20,
      },
    ],
    gmail: [
      {
        provider: "gmail",
        action: "search_threads",
        label: "Bandeja operativa",
        prompt: "Resumime los emails operativos importantes de hoy en Gmail",
        priority: 10,
      },
      {
        provider: "gmail",
        action: "search_threads",
        label: "Pendientes internos",
        prompt: "Buscame los emails internos pendientes de respuesta de los ultimos 7 dias",
        priority: 20,
      },
    ],
    google_calendar: [
      {
        provider: "google_calendar",
        action: "list_events",
        label: "Agenda de hoy",
        prompt: "Mostrame los eventos operativos de hoy en Google Calendar",
        priority: 10,
      },
      {
        provider: "google_calendar",
        action: "check_availability",
        label: "Verificar disponibilidad",
        prompt: "Verifica la disponibilidad operativa de esta semana",
        priority: 20,
      },
    ],
  },
};

const defaultDeps: ResolveInitialChatStarterIntentsDeps = {
  async loadSalesforceRuntime(agentId, organizationId) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.getSalesforceAgentToolRuntime(agentId, organizationId);
  },
  async assertSalesforceRuntimeUsable(runtime) {
    const runtimeModule = await import("../integrations/salesforce-agent-runtime");
    return runtimeModule.assertSalesforceRuntimeUsable(runtime as never);
  },
};

async function resolveSalesforceStarterIntents(
  agentId: string,
  organizationId: string,
  catalog: StarterCatalogEntry[],
  deps: ResolveInitialChatStarterIntentsDeps
): Promise<ChatStarterIntent[]> {
  const runtimeResult = await deps.loadSalesforceRuntime(agentId, organizationId);
  if (runtimeResult.error || !runtimeResult.data) return [];

  const usableRuntime = await deps.assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) return [];

  const allowedSet = new Set<string>(usableRuntime.data.config.allowed_actions);

  return catalog
    .filter((entry) => !entry.action || allowedSet.has(entry.action))
    .map((entry, index) => ({ ...entry, id: `salesforce:${entry.action ?? entry.label}:${index}` }));
}

export async function resolveInitialChatStarterIntents(
  agent: Agent,
  deps: ResolveInitialChatStarterIntentsDeps = defaultDeps
): Promise<ChatStarterIntent[]> {
  const setupState = readAgentSetupState(agent);

  if (!setupState || setupState.integrations.length === 0) {
    return [];
  }

  const starterCatalog = STARTER_INTENTS_BY_SCOPE[setupState.agentScope];

  const results: ChatStarterIntent[][] = await Promise.all(
    setupState.integrations.map(async (integration) => {
      const catalog = starterCatalog[integration as ChatQuickActionProvider];
      if (!catalog) return [];

      if (integration === "salesforce") {
        return resolveSalesforceStarterIntents(agent.id, agent.organization_id, catalog, deps);
      }

      return catalog.map((entry, index) => ({
        ...entry,
        id: `${integration}:${entry.action ?? entry.label}:${index}`,
      }));
    })
  );

  return results.flat();
}
