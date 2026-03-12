import { NextResponse } from "next/server";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { getSession } from "@/lib/auth/get-session";
import { getAgentById, updateAgent } from "@/lib/db/agents";
import {
  getAgentConnectionByAgentId,
  markAgentConnectionError,
  markAgentConnectionSynced,
} from "@/lib/db/agent-connections";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  buildAssistantConnectionMetadata,
  mapAssistantToUpdateAgentInput,
} from "@/lib/llm/openai-assistant-mapper";
import { getOpenAIAssistant } from "@/lib/llm/openai-assistants";
import { validateSameOriginMutationRequest } from "@/lib/utils/request-security";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateSameOriginMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;
  const agentResult = await getAgentById(agentId, session.organizationId);
  if (agentResult.error) {
    return NextResponse.json({ error: "No se pudo cargar el agente" }, { status: 500 });
  }

  if (!agentResult.data) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const connectionResult = await getAgentConnectionByAgentId(agentId, session.organizationId);
  if (connectionResult.error) {
    return NextResponse.json(
      { error: "No se pudo cargar la conexion del agente" },
      { status: 500 }
    );
  }

  if (!connectionResult.data) {
    return NextResponse.json(
      { error: "El agente no esta conectado a OpenAI" },
      { status: 400 }
    );
  }

  const connectionSummary = buildAgentConnectionSummary(connectionResult.data);
  if (connectionSummary.classification !== "remote_managed") {
    return NextResponse.json(
      { error: "La resincronizacion remota solo aplica a agentes gestionados por OpenAI" },
      { status: 400 }
    );
  }

  const integrationResult = await getOpenAIIntegrationById(
    connectionResult.data.integration_id,
    session.organizationId
  );
  if (integrationResult.error || !integrationResult.data) {
    return NextResponse.json(
      { error: "No se pudo cargar la integracion del agente" },
      { status: integrationResult.error ? 500 : 404 }
    );
  }

  const integrationAccess = assertUsableIntegration(integrationResult.data);
  if (!integrationAccess.ok) {
    return NextResponse.json({ error: integrationAccess.message }, { status: integrationAccess.status });
  }

  const apiKeyResult = await getOpenAIIntegrationApiKey(
    integrationResult.data.id,
    session.organizationId
  );
  if (apiKeyResult.error || !apiKeyResult.data) {
    return NextResponse.json(
      { error: "No se pudo leer la API key de OpenAI" },
      { status: 500 }
    );
  }

  try {
    const remoteAssistant = await getOpenAIAssistant(
      apiKeyResult.data,
      connectionResult.data.provider_agent_id,
      {
        organizationId: session.organizationId,
        integrationId: integrationResult.data.id,
        methodKey: "openai.assistants.get",
      }
    );

    const updateResult = await updateAgent(
      agentId,
      mapAssistantToUpdateAgentInput(remoteAssistant),
      session.organizationId
    );

    if (updateResult.error || !updateResult.data) {
      await markAgentConnectionError(
        connectionResult.data.id,
        session.organizationId,
        "local_sync_failed"
      );

      return NextResponse.json(
        { error: updateResult.error ?? "No se pudo resincronizar el agente" },
        { status: 500 }
      );
    }

    await markAgentConnectionSynced(
      connectionResult.data.id,
      session.organizationId,
      remoteAssistant.remoteUpdatedAt,
      buildAssistantConnectionMetadata(remoteAssistant)
    );

    return NextResponse.json({ data: updateResult.data });
  } catch (error) {
    console.error("agents.resync.remote_error", {
      organizationId: session.organizationId,
      agentId,
      integrationId: connectionResult.data.integration_id,
      error: error instanceof Error ? error.message : "unknown",
    });

    await markAgentConnectionError(
      connectionResult.data.id,
      session.organizationId,
      "provider_sync_failed"
    );

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudo resincronizar con OpenAI") },
      { status: 502 }
    );
  }
}
