import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createWhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import { getLatestIntegrationByType } from "@/lib/db/integration-operations";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { getPrimaryHubSpotIntegration } from "@/lib/db/hubspot-integrations";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { type GoogleSurface } from "@/lib/integrations/google-scopes";
import { getGoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";
import { getIntegrationOperationalView, getMetadataString } from "@/lib/integrations/metadata";
import { GoogleWorkspaceConnectionForm } from "@/components/settings/google-workspace-connection-form";
import { OpenAIAssistantsImportForm } from "@/components/settings/openai-assistants-import-form";
import { OpenAIConnectionForm } from "@/components/settings/openai-connection-form";
import { RevokeAllIntegrationsButton } from "@/components/settings/integration-revoke-actions";
import { HubSpotConnectionForm } from "@/components/settings/hubspot-connection-form";
import { SalesforceConnectionForm } from "@/components/settings/salesforce-connection-form";
import { WhatsAppConnectionForm } from "@/components/settings/whatsapp-connection-form";

type IntegrationsPageProps = {
  searchParams?: Promise<{
    salesforce_status?: string | string[];
    salesforce_message?: string | string[];
    hubspot_status?: string | string[];
    hubspot_message?: string | string[];
    google_status?: string | string[];
    google_message?: string | string[];
    google_surface?: string | string[];
  }>;
};

function getSingleQueryValue(value: string | string[] | undefined): string | null {
  const nextValue = Array.isArray(value) ? value[0] : value;
  return nextValue?.trim() ? nextValue.trim() : null;
}

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const user = await requireUser();

  if (user.role !== "admin") {
    redirect("/unauthorized");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [openAiIntegrationResult, whatsappIntegrationResult, salesforceIntegrationResult, hubspotIntegrationResult, googleIntegrationResult] = await Promise.all([
    getLatestIntegrationByType("openai", user.organizationId),
    getLatestIntegrationByType("whatsapp", user.organizationId),
    getPrimarySalesforceIntegration(user.organizationId),
    getPrimaryHubSpotIntegration(user.organizationId),
    getPrimaryGoogleIntegration(user.organizationId),
  ]);

  const openAiIntegration = openAiIntegrationResult.data;
  const whatsappIntegration = whatsappIntegrationResult.data;
  const salesforceIntegration = salesforceIntegrationResult.data;
  const hubspotIntegration = hubspotIntegrationResult.data;
  const googleIntegration = googleIntegrationResult.data;
  const openAiOperationalView = getIntegrationOperationalView(openAiIntegration);
  const whatsappOperationalView = getIntegrationOperationalView(whatsappIntegration);
  const salesforceOperationalView = getIntegrationOperationalView(salesforceIntegration);
  const hubspotOperationalView = getIntegrationOperationalView(hubspotIntegration);
  const gmailOperationalView = getGoogleSurfaceOperationalView(googleIntegration, "gmail");
  const googleCalendarOperationalView = getGoogleSurfaceOperationalView(
    googleIntegration,
    "google_calendar"
  );
  const whatsappConnection = createWhatsAppConnectionView(whatsappIntegration);
  const canImportOpenAI = openAiOperationalView.status === "connected" || openAiOperationalView.status === "expiring_soon";
  const salesforceStatus = getSingleQueryValue(resolvedSearchParams?.salesforce_status);
  const salesforceMessage = getSingleQueryValue(resolvedSearchParams?.salesforce_message);
  const hubspotStatus = getSingleQueryValue(resolvedSearchParams?.hubspot_status);
  const hubspotMessage = getSingleQueryValue(resolvedSearchParams?.hubspot_message);
  const googleStatus = getSingleQueryValue(resolvedSearchParams?.google_status);
  const googleMessage = getSingleQueryValue(resolvedSearchParams?.google_message);
  const googleSurface = getSingleQueryValue(resolvedSearchParams?.google_surface);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Integraciones
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Conecta proveedores externos para centralizar agentes remotos, canales reales y tools CRM observables desde AgentBuilder.
            </p>
          </div>
          <RevokeAllIntegrationsButton />
        </div>
      </div>

      <div className="space-y-6">
        <WhatsAppConnectionForm
          initialName={whatsappConnection.initialName}
          initialWabaId={whatsappConnection.initialWabaId}
          isConnected={Boolean(whatsappIntegration?.is_active)}
          accessTokenHint={whatsappConnection.accessTokenHint}
          integrationId={whatsappIntegration?.id ?? null}
          operationalView={whatsappOperationalView}
        />

        <OpenAIConnectionForm
          initialName={openAiIntegration?.name ?? "OpenAI Assistants"}
          isConnected={Boolean(openAiIntegration?.is_active)}
          apiKeyHint={getMetadataString(openAiIntegration?.metadata ?? null, "api_key_hint")}
          integrationId={openAiIntegration?.id ?? null}
          operationalView={openAiOperationalView}
        />

        <SalesforceConnectionForm
          initialName={salesforceIntegration?.name ?? "Salesforce CRM"}
          integrationId={salesforceIntegration?.id ?? null}
          isConnected={Boolean(salesforceIntegration?.is_active)}
          operationalView={salesforceOperationalView}
          instanceUrl={getMetadataString(salesforceIntegration?.metadata ?? null, "instance_url")}
          grantedScopes={salesforceOperationalView.grantedScopes}
          callbackMessage={salesforceMessage}
          callbackStatus={salesforceStatus === "connected" || salesforceStatus === "error" ? salesforceStatus : null}
        />

        <HubSpotConnectionForm
          initialName={hubspotIntegration?.name ?? "HubSpot CRM"}
          integrationId={hubspotIntegration?.id ?? null}
          isConnected={Boolean(hubspotIntegration?.is_active)}
          operationalView={hubspotOperationalView}
          hubId={getMetadataString(hubspotIntegration?.metadata ?? null, "hub_id")}
          grantedScopes={hubspotOperationalView.grantedScopes}
          callbackMessage={hubspotMessage}
          callbackStatus={hubspotStatus === "connected" || hubspotStatus === "error" ? hubspotStatus : null}
        />

        <GoogleWorkspaceConnectionForm
          integrationId={googleIntegration?.id ?? null}
          gmailView={gmailOperationalView}
          calendarView={googleCalendarOperationalView}
          callbackMessage={googleMessage}
          callbackStatus={googleStatus === "connected" || googleStatus === "error" ? googleStatus : null}
          callbackSurface={googleSurface === "gmail" || googleSurface === "google_calendar"
            ? (googleSurface as GoogleSurface)
            : null}
        />

        {openAiIntegration ? (
          <OpenAIAssistantsImportForm
            integrationId={openAiIntegration.id}
            disabledReason={canImportOpenAI ? null : openAiOperationalView.detail ?? openAiOperationalView.summary}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="mt-4 text-sm font-bold text-slate-900">Sin conexion OpenAI activa</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              Conecta OpenAI arriba para listar assistants remotos disponibles e importarlos en bloque a tu espacio de AgentBuilder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
