import { redirect } from "next/navigation";
import { AgentCreationWizard } from "@/components/agents/wizard/agent-creation-wizard";
import { createWhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import { canEditAgents } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { getOrganizationPlanName } from "@/lib/db/organization-plans";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { getPrimaryWhatsAppIntegration } from "@/lib/db/whatsapp-integrations";
import { getGoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";
import { getIntegrationOperationalView } from "@/lib/integrations/metadata";

export default async function NewAgentPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!canEditAgents(session.role)) {
    redirect("/unauthorized");
  }

  const [whatsappIntegrationResult, salesforceIntegrationResult, googleIntegrationResult, planResult] = await Promise.all([
    getPrimaryWhatsAppIntegration(session.organizationId),
    getPrimarySalesforceIntegration(session.organizationId),
    getPrimaryGoogleIntegration(session.organizationId),
    getOrganizationPlanName(session.organizationId),
  ]);
  const googleIntegration = googleIntegrationResult.data;
  const gmailView = getGoogleSurfaceOperationalView(googleIntegration, "gmail");

  const planName = planResult.data ?? "trial";

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Crear agente con wizard guiado
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Define el proposito del agente, combina areas de negocio e integraciones y crea un borrador con alcance claro desde el inicio, sin sobreprometer ejecucion que todavia no exista.
        </p>
      </div>

      <AgentCreationWizard
        whatsappConnection={createWhatsAppConnectionView(whatsappIntegrationResult.data)}
        salesforceOperationalView={getIntegrationOperationalView(salesforceIntegrationResult.data)}
        gmailOperationalView={gmailView}
        googleCalendarOperationalView={getGoogleSurfaceOperationalView(
          googleIntegration,
          "google_calendar"
        )}
        googleSheetsOperationalView={getGoogleSurfaceOperationalView(
          googleIntegration,
          "google_sheets"
        )}
        planName={planName}
      />
    </div>
  );
}
