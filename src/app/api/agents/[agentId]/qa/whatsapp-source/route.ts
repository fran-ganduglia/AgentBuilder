import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  createAgentConnection,
  getAgentConnectionByProviderAgentId,
  getServiceRoleAgentConnectionByAgentId,
  updateAgentConnection,
} from "@/lib/db/agent-connections";
import { insertAuditLog } from "@/lib/db/audit";
import { getWhatsAppIntegrationConfig } from "@/lib/db/whatsapp-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  buildWhatsAppSourceMetadata,
  getWhatsAppSourceById,
} from "@/lib/whatsapp-cloud";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import type { Json } from "@/types/database";

const attachWhatsAppSourceSchema = z.object({
  integrationId: z.string().uuid("integrationId invalido"),
  phoneNumberId: z.string().min(1, "phoneNumberId es requerido").max(120, "phoneNumberId es demasiado largo"),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function withSyncedMetadata(metadata: Record<string, string | boolean>): Json {
  return {
    ...metadata,
    last_synced_at: new Date().toISOString(),
  } as Json;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "admin" && session.role !== "editor") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "edit",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const connectionSummary = access.connectionSummary;
  if (access.agent.status !== "active" && connectionSummary.classification !== "channel_connected") {
    return NextResponse.json(
      { error: "Primero activa el agente para conectar una fuente WhatsApp desde QA" },
      { status: 400 }
    );
  }

  const parsedBody = await parseJsonRequestBody(request, attachWhatsAppSourceSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    parsedBody.data.integrationId,
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

  let source;
  try {
    source = await getWhatsAppSourceById(
      {
        accessToken: integrationConfigResult.data.accessToken,
        wabaId: integrationConfigResult.data.wabaId,
      },
      parsedBody.data.phoneNumberId,
      {
        organizationId: session.organizationId,
        integrationId: parsedBody.data.integrationId,
        methodKey: "whatsapp.phone_numbers.list",
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudo validar la fuente WhatsApp") },
      { status: 502 }
    );
  }

  if (!source) {
    return NextResponse.json({ error: "La fuente WhatsApp no fue encontrada" }, { status: 404 });
  }

  const existingSourceResult = await getAgentConnectionByProviderAgentId(
    parsedBody.data.integrationId,
    session.organizationId,
    parsedBody.data.phoneNumberId
  );
  if (existingSourceResult.error) {
    return NextResponse.json({ error: "No se pudo validar la fuente seleccionada" }, { status: 500 });
  }

  if (existingSourceResult.data && existingSourceResult.data.agent_id !== agentId) {
    return NextResponse.json(
      { error: "Esa fuente WhatsApp ya esta conectada a otro agente" },
      { status: 409 }
    );
  }

  const currentConnectionResult = await getServiceRoleAgentConnectionByAgentId(
    agentId,
    session.organizationId
  );
  if (currentConnectionResult.error) {
    return NextResponse.json({ error: "No se pudo revisar la conexion actual del agente" }, { status: 500 });
  }

  const currentConnection = currentConnectionResult.data;
  const metadata = withSyncedMetadata(buildWhatsAppSourceMetadata(source));

  if (currentConnection && buildAgentConnectionSummary(currentConnection).classification !== "channel_connected") {
    return NextResponse.json(
      { error: "El agente ya tiene una conexion incompatible para esta operacion" },
      { status: 409 }
    );
  }

  const persistedConnection = currentConnection
    ? await updateAgentConnection(currentConnection.id, session.organizationId, {
        integration_id: parsedBody.data.integrationId,
        provider_type: "whatsapp",
        provider_agent_id: source.phoneNumberId,
        sync_status: "connected",
        last_sync_error: null,
        last_synced_at: new Date().toISOString(),
        metadata,
      })
    : await createAgentConnection({
        organization_id: session.organizationId,
        agent_id: agentId,
        integration_id: parsedBody.data.integrationId,
        provider_agent_id: source.phoneNumberId,
        provider_type: "whatsapp",
        sync_status: "connected",
        last_sync_error: null,
        last_synced_at: new Date().toISOString(),
        metadata,
      });

  if (persistedConnection.error || !persistedConnection.data) {
    return NextResponse.json(
      { error: persistedConnection.error ?? "No se pudo conectar la fuente WhatsApp" },
      { status: 500 }
    );
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: currentConnection ? "agent.whatsapp_source_updated" : "agent.whatsapp_source_connected",
    resourceType: "agent",
    resourceId: agentId,
    newValue: {
      provider_type: "whatsapp",
      provider_agent_id: source.phoneNumberId,
      display_phone_number: source.displayPhoneNumber,
      waba_id: source.wabaId,
    } as Json,
  });

  return NextResponse.json({
    data: {
      connection: persistedConnection.data,
      source,
    },
  });
}
