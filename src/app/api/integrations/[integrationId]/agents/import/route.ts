import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { createAgent, softDeleteAgent } from "@/lib/db/agents";
import {
  createAgentConnection,
  getAgentConnectionByProviderAgentId,
} from "@/lib/db/agent-connections";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  buildAssistantConnectionMetadata,
  mapAssistantToCreateAgentInput,
} from "@/lib/llm/openai-assistant-mapper";
import { getOpenAIAssistant } from "@/lib/llm/openai-assistants";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const importAssistantsSchema = z.object({
  assistantIds: z
    .array(z.string().min(1, "Cada assistantId es requerido"))
    .min(1, "Selecciona al menos un assistant para importar")
    .max(25, "No puedes importar mas de 25 assistants por vez"),
});

const GENERIC_IMPORT_ERROR = "No se pudo importar el assistant";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
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

  const { integrationId } = await context.params;
  const integrationResult = await getOpenAIIntegrationById(integrationId, session.organizationId);

  if (integrationResult.error) {
    console.error("integrations.openai_import.integration_error", {
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

  const apiKeyResult = await getOpenAIIntegrationApiKey(integrationId, session.organizationId);
  if (apiKeyResult.error || !apiKeyResult.data) {
    console.error("integrations.openai_import.api_key_error", {
      organizationId: session.organizationId,
      integrationId,
      error: apiKeyResult.error ?? "missing",
    });

    return NextResponse.json(
      { error: "No se pudo leer la API key de OpenAI" },
      { status: 500 }
    );
  }

  const parsedBody = await parseJsonRequestBody(request, importAssistantsSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const imported: Array<{ agentId: string; assistantId: string; name: string }> = [];
  const duplicates: string[] = [];
  const failed: Array<{ assistantId: string; error: string }> = [];

  for (const assistantId of parsedBody.data.assistantIds) {
    const existingConnection = await getAgentConnectionByProviderAgentId(
      integrationId,
      session.organizationId,
      assistantId
    );

    if (existingConnection.error) {
      console.error("integrations.openai_import.connection_lookup_error", {
        organizationId: session.organizationId,
        integrationId,
        assistantId,
        error: existingConnection.error,
      });

      failed.push({ assistantId, error: GENERIC_IMPORT_ERROR });
      continue;
    }

    if (existingConnection.data) {
      duplicates.push(assistantId);
      continue;
    }

    try {
      const assistant = await getOpenAIAssistant(apiKeyResult.data, assistantId, {
        organizationId: session.organizationId,
        integrationId,
        methodKey: "openai.assistants.get",
      });
      const localAgent = await createAgent(
        mapAssistantToCreateAgentInput(assistant, "active"),
        session.organizationId,
        session.user.id
      );

      if (localAgent.error || !localAgent.data) {
        console.error("integrations.openai_import.local_agent_error", {
          organizationId: session.organizationId,
          integrationId,
          assistantId,
          error: localAgent.error ?? "missing",
        });

        failed.push({ assistantId, error: GENERIC_IMPORT_ERROR });
        continue;
      }

      const connectionResult = await createAgentConnection({
        organization_id: session.organizationId,
        agent_id: localAgent.data.id,
        integration_id: integrationId,
        provider_agent_id: assistant.id,
        provider_type: "openai",
        sync_status: "connected",
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        remote_updated_at: assistant.remoteUpdatedAt,
        metadata: buildAssistantConnectionMetadata(assistant),
      });

      if (connectionResult.error) {
        console.error("integrations.openai_import.connection_create_error", {
          organizationId: session.organizationId,
          integrationId,
          assistantId,
          agentId: localAgent.data.id,
          error: connectionResult.error,
        });

        await softDeleteAgent(localAgent.data.id, session.organizationId);
        failed.push({ assistantId, error: GENERIC_IMPORT_ERROR });
        continue;
      }

      imported.push({
        agentId: localAgent.data.id,
        assistantId: assistant.id,
        name: localAgent.data.name,
      });
    } catch (error) {
      console.error("integrations.openai_import.remote_error", {
        organizationId: session.organizationId,
        integrationId,
        assistantId,
        error: error instanceof Error ? error.message : "unknown",
      });

      failed.push({
        assistantId,
        error: getSafeProviderErrorMessage(error, GENERIC_IMPORT_ERROR),
      });
    }
  }

  return NextResponse.json({
    data: {
      imported,
      duplicates,
      failed,
    },
  });
}
