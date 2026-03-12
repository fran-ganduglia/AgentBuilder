import { NextResponse } from "next/server";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  getServiceRoleAgentConnectionByAgentId,
  markAgentConnectionError,
  markAgentConnectionSynced,
} from "@/lib/db/agent-connections";
import { insertAuditLog } from "@/lib/db/audit";
import { listConversations, updateConversationMetadata } from "@/lib/db/conversations";
import { getWhatsAppIntegrationConfig } from "@/lib/db/whatsapp-integrations";
import { resolveConversationChatMode } from "@/lib/chat/conversation-metadata";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  buildWhatsAppSourceMetadata,
  getWhatsAppSourceById,
} from "@/lib/whatsapp-cloud";
import { validateJsonMutationRequest } from "@/lib/utils/request-security";
import type { Json } from "@/types/database";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function mergeLastSyncedAt(metadata: Json | null, syncedAt: string): Json {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};

  return {
    ...record,
    last_synced_at: syncedAt,
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

  if (access.connectionSummary.classification !== "channel_connected") {
    return NextResponse.json(
      { error: "Este agente no tiene una fuente WhatsApp conectada" },
      { status: 400 }
    );
  }

  const connectionResult = await getServiceRoleAgentConnectionByAgentId(
    agentId,
    session.organizationId
  );
  if (connectionResult.error || !connectionResult.data) {
    return NextResponse.json({ error: "No se pudo cargar la conexion WhatsApp" }, { status: 500 });
  }

  const connection = connectionResult.data;
  if (buildAgentConnectionSummary(connection).classification !== "channel_connected") {
    return NextResponse.json(
      { error: "La conexion del agente no es un canal WhatsApp conectado" },
      { status: 400 }
    );
  }

  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    connection.integration_id,
    session.organizationId
  );
  if (integrationConfigResult.error || !integrationConfigResult.data) {
    await markAgentConnectionError(connection.id, session.organizationId, "whatsapp_refresh_config_missing");
    return NextResponse.json(
      { error: integrationConfigResult.error ?? "No se pudo cargar la integracion de WhatsApp" },
      { status: 500 }
    );
  }

  const integrationAccess = assertUsableIntegration(integrationConfigResult.data.integration);
  if (!integrationAccess.ok) {
    return NextResponse.json({ error: integrationAccess.message }, { status: integrationAccess.status });
  }

  try {
    const source = await getWhatsAppSourceById(
      {
        accessToken: integrationConfigResult.data.accessToken,
        wabaId: integrationConfigResult.data.wabaId,
      },
      connection.provider_agent_id,
      {
        organizationId: session.organizationId,
        integrationId: connection.integration_id,
        methodKey: "whatsapp.phone_numbers.list",
      }
    );

    if (!source) {
      await markAgentConnectionError(connection.id, session.organizationId, "whatsapp_source_not_found");
      return NextResponse.json({ error: "La fuente WhatsApp conectada ya no esta disponible" }, { status: 404 });
    }

    const refreshedAt = new Date().toISOString();
    const conversationsResult = await listConversations(agentId, session.organizationId, { useServiceRole: true });
    if (conversationsResult.error || !conversationsResult.data) {
      throw new Error(conversationsResult.error ?? "No se pudieron cargar las conversaciones QA");
    }

    let updatedConversations = 0;

    for (const conversation of conversationsResult.data) {
      const chatMode = resolveConversationChatMode(conversation);
      if (conversation.channel !== "whatsapp" || (chatMode !== "live_external" && chatMode !== "qa_imported")) {
        continue;
      }

      const updateResult = await updateConversationMetadata(
        conversation.id,
        agentId,
        session.organizationId,
        {
          source_context: {
            last_synced_at: refreshedAt,
            source_label: source.displayPhoneNumber,
          },
        },
        { useServiceRole: true }
      );

      if (!updateResult.error) {
        updatedConversations += 1;
      }
    }

    await markAgentConnectionSynced(
      connection.id,
      session.organizationId,
      null,
      mergeLastSyncedAt(
        {
          ...buildWhatsAppSourceMetadata(source),
          last_synced_at: refreshedAt,
        } as Json,
        refreshedAt
      )
    );

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "agent.whatsapp_refreshed",
      resourceType: "agent",
      resourceId: agentId,
      newValue: {
        refreshed_at: refreshedAt,
        updated_conversations: updatedConversations,
      } as Json,
    });

    return NextResponse.json({
      data: {
        refreshedAt,
        updatedConversations,
        source,
      },
    });
  } catch (error) {
    await markAgentConnectionError(connection.id, session.organizationId, "whatsapp_refresh_failed");

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudo refrescar la fuente WhatsApp") },
      { status: 502 }
    );
  }
}
