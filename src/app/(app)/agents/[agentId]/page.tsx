import { notFound, redirect } from "next/navigation";
import { AgentDetailWorkspace } from "@/components/agents/agent-detail-workspace";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import {
  buildSalesforceSetupResolutionContext,
  getSalesforceAgentIntegrationState,
  getSalesforceIntegrationCta,
} from "@/lib/agents/salesforce-agent-integration";
import {
  assertAgentAccess,
  canEditAgents,
  canManageAgentDocuments,
} from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { hasReadyDocuments, listDocuments } from "@/lib/db/agent-documents";
import {
  getAgentConnectionByAgentId,
  getAgentConnectionSummaryByAgentId,
} from "@/lib/db/agent-connections";
import { getPrimaryWhatsAppIntegration } from "@/lib/db/whatsapp-integrations";

type AgentDetailSearchParams = {
  tab?: string | string[];
};

type AgentDetailPageProps = {
  params: Promise<{ agentId: string }>;
  searchParams?: Promise<AgentDetailSearchParams>;
};

function resolveInitialTab(rawTab: string | string[] | undefined) {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;

  if (candidate === "config" || candidate === "knowledge" || candidate === "setup" || candidate === "qa") {
    return candidate;
  }

  return "setup" as const;
}

export default async function AgentDetailPage({ params, searchParams }: AgentDetailPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { agentId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "read",
  });

  if (!access.ok) {
    notFound();
  }

  const agent = access.agent;
  const canEditAgent = canEditAgents(session.role);
  const canManageDocuments = canManageAgentDocuments(session.role);
  const canViewConnectionDetails = canEditAgent;

  const [documentsResult, connectionResult, connectionSummaryResult, hasReadyDocumentsResult, whatsappIntegrationResult] = await Promise.all([
    canManageDocuments
      ? listDocuments(agentId, session.organizationId)
      : Promise.resolve({ data: [], error: null }),
    canViewConnectionDetails
      ? getAgentConnectionByAgentId(agentId, session.organizationId)
      : Promise.resolve({ data: null, error: null }),
    canViewConnectionDetails
      ? Promise.resolve({ data: null, error: null })
      : getAgentConnectionSummaryByAgentId(agentId, session.organizationId),
    hasReadyDocuments(agentId, session.organizationId),
    canEditAgent
      ? getPrimaryWhatsAppIntegration(session.organizationId)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const documents = documentsResult.data ?? [];
  const baseSetupState = readAgentSetupState(agent, {
    hasReadyDocuments: hasReadyDocumentsResult,
  });
  const salesforceIntegrationStateResult = baseSetupState
    ? await getSalesforceAgentIntegrationState({
      agentId,
      organizationId: session.organizationId,
      setupState: baseSetupState,
    })
    : { data: null, error: null };
  const salesforceIntegrationState = salesforceIntegrationStateResult.error
    ? null
    : salesforceIntegrationStateResult.data;
  const setupState = readAgentSetupState(agent, {
    hasReadyDocuments: hasReadyDocumentsResult,
    providerIntegrations: buildSalesforceSetupResolutionContext(salesforceIntegrationState),
  });
  const salesforceIntegrationCta = salesforceIntegrationState
    ? getSalesforceIntegrationCta(salesforceIntegrationState)
    : null;
  const salesforceIntegrationNotice =
    salesforceIntegrationState?.expectsSalesforceIntegration && !salesforceIntegrationState.isLinked
      ? {
        title: salesforceIntegrationState.integration
          ? `Salesforce: ${salesforceIntegrationState.integrationView.label}`
          : "Salesforce pendiente",
        message: salesforceIntegrationState.message,
        tone: salesforceIntegrationState.integrationView.tone,
        href: salesforceIntegrationCta?.href ?? "/settings/integrations",
        label: salesforceIntegrationCta?.label ?? "Abrir integraciones",
      }
      : null;
  const connection = canViewConnectionDetails ? connectionResult.data : null;
  const connectionSummary = buildAgentConnectionSummary(connection ?? connectionSummaryResult.data);
  const isWhatsAppChannelIntent = setupState?.channel === "whatsapp";
  const canChat =
    session.role !== "viewer" &&
    agent.status === "active" &&
    connectionSummary.classification === "local" &&
    !isWhatsAppChannelIntent;
  const initialTab = resolveInitialTab(resolvedSearchParams?.tab);

  return (
    <AgentDetailWorkspace
      agent={agent}
      connection={connection}
      connectionSummary={connectionSummary}
      documents={documents}
      setupState={setupState}
      userRole={session.role}
      canEditAgent={canEditAgent}
      canManageDocuments={canManageDocuments}
      canChat={canChat}
      initialTab={initialTab}
      whatsappIntegrationId={whatsappIntegrationResult.data?.id ?? null}
      salesforceIntegrationNotice={salesforceIntegrationNotice}
    />
  );
}


