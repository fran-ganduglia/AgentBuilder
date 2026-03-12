import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { getWhatsAppIntegrationConfig } from "@/lib/db/whatsapp-integrations";
import { listWhatsAppSources } from "@/lib/whatsapp-cloud";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { integrationId } = await context.params;
  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    integrationId,
    session.organizationId
  );

  if (integrationConfigResult.error || !integrationConfigResult.data) {
    return NextResponse.json(
      { error: integrationConfigResult.error ?? "No se pudo cargar la integracion de WhatsApp" },
      { status: integrationConfigResult.error === "Integracion WhatsApp no encontrada" ? 404 : 500 }
    );
  }

  const integrationAccess = assertUsableIntegration(integrationConfigResult.data.integration);
  if (!integrationAccess.ok) {
    return NextResponse.json({ error: integrationAccess.message }, { status: integrationAccess.status });
  }

  try {
    const sources = await listWhatsAppSources({
      accessToken: integrationConfigResult.data.accessToken,
      wabaId: integrationConfigResult.data.wabaId,
    }, {
      organizationId: session.organizationId,
      integrationId,
      methodKey: "whatsapp.phone_numbers.list",
    });

    return NextResponse.json({ data: sources });
  } catch (error) {
    console.error("integrations.whatsapp_sources_error", {
      organizationId: session.organizationId,
      integrationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudieron listar las fuentes de WhatsApp") },
      { status: 502 }
    );
  }
}
