import { notFound, redirect } from "next/navigation";
import { AgentDetailWorkspace } from "@/components/agents/agent-detail-workspace";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import {
  buildGmailSetupResolutionContext,
  getGmailAgentIntegrationState,
  getGmailIntegrationCta,
} from "@/lib/agents/gmail-agent-integration";
import {
  buildGoogleCalendarSetupResolutionContext,
  getGoogleCalendarIntegrationCta,
  getGoogleCalendarAgentIntegrationState,
} from "@/lib/agents/google-calendar-agent-integration";
import {
  buildGoogleSheetsSetupResolutionContext,
  getGoogleSheetsAgentIntegrationState,
  getGoogleSheetsIntegrationCta,
} from "@/lib/agents/google-sheets-agent-integration";
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
import { resolveGoogleCalendarIntegrationTimezone } from "@/lib/integrations/google-calendar-timezone";

type AgentDetailSearchParams = {
  tab?: string | string[];
};

type AgentDetailPageProps = {
  params: Promise<{ agentId: string }>;
  searchParams?: Promise<AgentDetailSearchParams>;
};

function resolveInitialTab(rawTab: string | string[] | undefined) {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;

  if (candidate === "config" || candidate === "knowledge" || candidate === "setup" || candidate === "qa" || candidate === "automations") {
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

  const [
    salesforceIntegrationStateResult,
    gmailIntegrationStateResult,
    googleCalendarIntegrationStateResult,
    googleSheetsIntegrationStateResult,
  ] = await Promise.all([
    baseSetupState
      ? getSalesforceAgentIntegrationState({
          agentId,
          organizationId: session.organizationId,
          setupState: baseSetupState,
        })
      : Promise.resolve({ data: null, error: null }),
    baseSetupState
      ? getGmailAgentIntegrationState({
          agentId,
          organizationId: session.organizationId,
          setupState: baseSetupState,
        })
      : Promise.resolve({ data: null, error: null }),
    baseSetupState
      ? getGoogleCalendarAgentIntegrationState({
          agentId,
          organizationId: session.organizationId,
          setupState: baseSetupState,
        })
      : Promise.resolve({ data: null, error: null }),
    baseSetupState
      ? getGoogleSheetsAgentIntegrationState({
          agentId,
          organizationId: session.organizationId,
          setupState: baseSetupState,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const salesforceIntegrationState = salesforceIntegrationStateResult.error
    ? null
    : salesforceIntegrationStateResult.data;
  const gmailIntegrationState = gmailIntegrationStateResult.error
    ? null
    : gmailIntegrationStateResult.data;
  const googleCalendarIntegrationState = googleCalendarIntegrationStateResult.error
    ? null
    : googleCalendarIntegrationStateResult.data;
  const googleSheetsIntegrationState = googleSheetsIntegrationStateResult.error
    ? null
    : googleSheetsIntegrationStateResult.data;

  const providerIntegrations = {
    ...buildSalesforceSetupResolutionContext(salesforceIntegrationState),
    ...buildGmailSetupResolutionContext(gmailIntegrationState),
    ...buildGoogleCalendarSetupResolutionContext(googleCalendarIntegrationState),
    ...buildGoogleSheetsSetupResolutionContext(googleSheetsIntegrationState),
  };
  const googleCalendarTimezoneResult =
    googleCalendarIntegrationState?.integration &&
    googleCalendarIntegrationState.hasUsableIntegration
      ? await resolveGoogleCalendarIntegrationTimezone({
          integrationId: googleCalendarIntegrationState.integration.id,
          organizationId: session.organizationId,
        })
      : { data: null, error: null };

  const setupState = readAgentSetupState(agent, {
    hasReadyDocuments: hasReadyDocumentsResult,
    googleCalendarDetectedTimezone:
      googleCalendarTimezoneResult.data?.detectedTimezone ?? null,
    providerIntegrations: Object.keys(providerIntegrations).length > 0 ? providerIntegrations : undefined,
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

  const gmailIntegrationCta = gmailIntegrationState
    ? getGmailIntegrationCta(gmailIntegrationState)
    : null;
  const gmailIntegrationNotice =
    gmailIntegrationState?.expectsGmailIntegration && !gmailIntegrationState.isLinked
      ? {
          title: gmailIntegrationState.integration
            ? `Gmail: ${gmailIntegrationState.integrationView.label}`
            : "Gmail pendiente",
          message: gmailIntegrationState.message,
          tone: gmailIntegrationState.integrationView.tone,
          href: gmailIntegrationCta?.href ?? "/settings/integrations",
          label: gmailIntegrationCta?.label ?? "Abrir integraciones",
        }
      : null;
  const googleCalendarIntegrationCta = googleCalendarIntegrationState
    ? getGoogleCalendarIntegrationCta(googleCalendarIntegrationState)
    : null;
  const googleCalendarIntegrationNotice =
    googleCalendarIntegrationState?.expectsGoogleCalendarIntegration &&
    !googleCalendarIntegrationState.isLinked
      ? {
          title: googleCalendarIntegrationState.integration
            ? `Google Calendar: ${googleCalendarIntegrationState.integrationView.label}`
            : "Google Calendar pendiente",
          message: googleCalendarIntegrationState.message,
          tone: googleCalendarIntegrationState.integrationView.tone,
          href: googleCalendarIntegrationCta?.href ?? "/settings/integrations",
          label: googleCalendarIntegrationCta?.label ?? "Abrir integraciones",
        }
      : null;
  const googleSheetsIntegrationCta = googleSheetsIntegrationState
    ? getGoogleSheetsIntegrationCta(googleSheetsIntegrationState)
    : null;
  const googleSheetsIntegrationNotice =
    googleSheetsIntegrationState?.expectsGoogleSheetsIntegration &&
    !googleSheetsIntegrationState.isLinked
      ? {
          title: googleSheetsIntegrationState.integration
            ? `Google Sheets: ${googleSheetsIntegrationState.integrationView.label}`
            : "Google Sheets pendiente",
          message: googleSheetsIntegrationState.message,
          tone: googleSheetsIntegrationState.integrationView.tone,
          href: googleSheetsIntegrationCta?.href ?? "/settings/integrations",
          label: googleSheetsIntegrationCta?.label ?? "Abrir integraciones",
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
      gmailIntegrationNotice={gmailIntegrationNotice}
      googleCalendarIntegrationNotice={googleCalendarIntegrationNotice}
      googleSheetsIntegrationNotice={googleSheetsIntegrationNotice}
      promptEnvironment={{
        salesforceUsable: Boolean(
          salesforceIntegrationState?.hasUsableIntegration && salesforceIntegrationState?.hasEnabledTool
        ),
        gmailConfigured: Boolean(
          gmailIntegrationState?.hasUsableIntegration && gmailIntegrationState?.hasEnabledTool
        ),
        gmailRuntimeAvailable: false,
        googleCalendarConfigured: Boolean(
          googleCalendarIntegrationState?.hasUsableIntegration &&
          googleCalendarIntegrationState?.hasEnabledTool
        ),
        googleCalendarRuntimeAvailable: false,
      }}
    />
  );
}
