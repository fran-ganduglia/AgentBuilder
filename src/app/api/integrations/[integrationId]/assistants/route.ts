import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { listAgentConnections } from "@/lib/db/agent-connections";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { listOpenAIAssistants } from "@/lib/llm/openai-assistants";

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
  const integrationResult = await getOpenAIIntegrationById(integrationId, session.organizationId);

  if (integrationResult.error) {
    console.error("integrations.openai_assistants.integration_error", {
      organizationId: session.organizationId,
      integrationId,
      error: integrationResult.error,
    });

    return NextResponse.json({ error: "No se pudo cargar la integracion" }, { status: 500 });
  }

  const access = assertUsableIntegration(integrationResult.data);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const [apiKeyResult, connectionResult] = await Promise.all([
    getOpenAIIntegrationApiKey(integrationId, session.organizationId),
    listAgentConnections(session.organizationId),
  ]);

  if (apiKeyResult.error || !apiKeyResult.data) {
    console.error("integrations.openai_assistants.api_key_error", {
      organizationId: session.organizationId,
      integrationId,
      error: apiKeyResult.error ?? "missing",
    });

    return NextResponse.json(
      { error: "No se pudo leer la API key de OpenAI" },
      { status: 500 }
    );
  }

  if (connectionResult.error) {
    console.error("integrations.openai_assistants.connections_error", {
      organizationId: session.organizationId,
      integrationId,
      error: connectionResult.error,
    });

    return NextResponse.json(
      { error: "No se pudieron cargar las conexiones de agentes" },
      { status: 500 }
    );
  }

  try {
    const importedAssistantIds = new Set(
      (connectionResult.data ?? [])
        .filter((connection) => connection.integration_id === integrationId)
        .filter((connection) => connection.provider_type === "openai")
        .map((connection) => connection.provider_agent_id)
    );

    const assistants = await listOpenAIAssistants(apiKeyResult.data, 100, {
      organizationId: session.organizationId,
      integrationId,
      methodKey: "openai.assistants.list",
    });

    return NextResponse.json({
      data: assistants.map((assistant) => ({
        id: assistant.id,
        name: assistant.name,
        description: assistant.description,
        model: assistant.model,
        alreadyImported: importedAssistantIds.has(assistant.id),
      })),
    });
  } catch (error) {
    console.error("integrations.openai_assistants.list_error", {
      organizationId: session.organizationId,
      integrationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudieron listar los assistants") },
      { status: 502 }
    );
  }
}
