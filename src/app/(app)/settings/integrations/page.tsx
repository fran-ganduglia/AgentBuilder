import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createWhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import { getLatestIntegrationByType } from "@/lib/db/integration-operations";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { type GoogleSurface } from "@/lib/integrations/google-scopes";
import { getGoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";
import { getIntegrationOperationalView } from "@/lib/integrations/metadata";
import { RevokeAllIntegrationsButton } from "@/components/settings/integration-revoke-actions";
import { IntegrationsAccordion } from "@/components/settings/integrations-accordion";

type IntegrationsPageProps = {
  searchParams?: Promise<{
    salesforce_status?: string | string[];
    salesforce_message?: string | string[];
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
  const [
    whatsappIntegrationResult,
    salesforceIntegrationResult,
    googleIntegrationResult,
  ] = await Promise.all([
    getLatestIntegrationByType("whatsapp", user.organizationId),
    getPrimarySalesforceIntegration(user.organizationId),
    getPrimaryGoogleIntegration(user.organizationId),
  ]);

  const whatsappIntegration = whatsappIntegrationResult.data;
  const salesforceIntegration = salesforceIntegrationResult.data;
  const googleIntegration = googleIntegrationResult.data;

  const whatsappOperationalView = getIntegrationOperationalView(whatsappIntegration);
  const salesforceOperationalView = getIntegrationOperationalView(salesforceIntegration);
  const gmailView = getGoogleSurfaceOperationalView(googleIntegration, "gmail");
  const calendarView = getGoogleSurfaceOperationalView(googleIntegration, "google_calendar");
  const sheetsView = getGoogleSurfaceOperationalView(googleIntegration, "google_sheets");

  const whatsappConnection = createWhatsAppConnectionView(whatsappIntegration);
  const salesforceStatus = getSingleQueryValue(resolvedSearchParams?.salesforce_status);
  const salesforceMessage = getSingleQueryValue(resolvedSearchParams?.salesforce_message);
  const googleStatus = getSingleQueryValue(resolvedSearchParams?.google_status);
  const googleMessage = getSingleQueryValue(resolvedSearchParams?.google_message);
  const googleSurface = getSingleQueryValue(resolvedSearchParams?.google_surface);

  const resolvedSalesforceStatus =
    salesforceStatus === "connected" || salesforceStatus === "error" ? salesforceStatus : null;
  const resolvedGoogleStatus =
    googleStatus === "connected" || googleStatus === "error" ? googleStatus : null;
  const resolvedGoogleSurface =
    googleSurface === "gmail" ||
    googleSurface === "google_calendar" ||
    googleSurface === "google_sheets"
      ? (googleSurface as GoogleSurface)
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Integraciones
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Conecta canales y proveedores operativos compatibles con el runtime estructurado de AgentBuilder.
            </p>
          </div>
          <RevokeAllIntegrationsButton />
        </div>
      </div>

      <IntegrationsAccordion
        whatsappConnection={whatsappConnection}
        whatsappIntegration={whatsappIntegration ?? null}
        whatsappOperationalView={whatsappOperationalView}
        salesforceIntegration={salesforceIntegration ?? null}
        salesforceOperationalView={salesforceOperationalView}
        salesforceMessage={salesforceMessage}
        salesforceStatus={resolvedSalesforceStatus}
        googleIntegration={googleIntegration ?? null}
        gmailView={gmailView}
        calendarView={calendarView}
        sheetsView={sheetsView}
        googleMessage={googleMessage}
        googleStatus={resolvedGoogleStatus}
        googleSurface={resolvedGoogleSurface}
      />
    </div>
  );
}
