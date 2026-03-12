import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { upsertOpenAIIntegration } from "@/lib/db/integrations";
import { buildConnectedIntegrationMetadata } from "@/lib/integrations/metadata";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { listOpenAIAssistants, validateOpenAIApiKey } from "@/lib/llm/openai-assistants";
import { encryptSecret } from "@/lib/utils/secrets";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const connectOpenAISchema = z.object({
  apiKey: z.string().min(20, "La API key parece invalida"),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede superar 100 caracteres")
    .optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsedBody = await parseJsonRequestBody(request, connectOpenAISchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const apiKey = parsedBody.data.apiKey.trim();

  try {
    await validateOpenAIApiKey(apiKey, {
      organizationId: session.organizationId,
      methodKey: "openai.assistants.list",
    });
    const assistants = await listOpenAIAssistants(apiKey, 20, {
      organizationId: session.organizationId,
      methodKey: "openai.assistants.list",
    });

    const metadata = buildConnectedIntegrationMetadata({
      current: null,
      validatedAtKey: "validated_at",
      providerMetadata: {
        provider: "openai_assistants",
        api_key_hint: `***${apiKey.slice(-4)}`,
      },
    });

    const integrationResult = await upsertOpenAIIntegration({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: parsedBody.data.name?.trim() || "OpenAI Assistants",
      encryptedApiKey: encryptSecret(apiKey),
      metadata,
    });

    if (integrationResult.error || !integrationResult.data) {
      console.error("integrations.openai_connect_persist_error", {
        organizationId: session.organizationId,
        error: integrationResult.error ?? "unknown",
      });

      return NextResponse.json(
        { error: "No se pudo guardar la integracion" },
        { status: 500 }
      );
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "integration.openai_connected",
      resourceType: "integration",
      resourceId: integrationResult.data.id,
      newValue: {
        assistants_count: assistants.length,
      },
    });

    return NextResponse.json({
      data: {
        integration: integrationResult.data,
        assistantsCount: assistants.length,
      },
    });
  } catch (error) {
    console.error("integrations.openai_connect_error", {
      organizationId: session.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudo validar la API key de OpenAI") },
      { status: 502 }
    );
  }
}
