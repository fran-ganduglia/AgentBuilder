import { redirect } from "next/navigation";
import { AgentCreationWizard } from "@/components/agents/wizard/agent-creation-wizard";
import { canEditAgents } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { getPrimaryWhatsAppIntegration } from "@/lib/db/whatsapp-integrations";
import { getIntegrationOperationalView } from "@/lib/integrations/metadata";
import { createWhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";

export default async function NewAgentPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!canEditAgents(session.role)) {
    redirect("/unauthorized");
  }

  const [whatsappIntegrationResult, salesforceIntegrationResult] = await Promise.all([
    getPrimaryWhatsAppIntegration(session.organizationId),
    getPrimarySalesforceIntegration(session.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Crear agente con wizard guiado
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Empieza por el ecosistema que quieres preparar, revisa un tutorial corto y elige un template listo para dejar guardado el onboarding del agente en borrador.
        </p>
      </div>

      <AgentCreationWizard
        role={session.role}
        whatsappConnection={createWhatsAppConnectionView(whatsappIntegrationResult.data)}
        salesforceOperationalView={getIntegrationOperationalView(salesforceIntegrationResult.data)}
      />
    </div>
  );
}
