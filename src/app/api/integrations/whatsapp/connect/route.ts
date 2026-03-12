import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { upsertWhatsAppIntegration } from "@/lib/db/whatsapp-integrations";
import { buildConnectedIntegrationMetadata } from "@/lib/integrations/metadata";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  buildWhatsAppAccessTokenHint,
  listWhatsAppSources,
} from "@/lib/whatsapp-cloud";
import { encryptSecret } from "@/lib/utils/secrets";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const connectWhatsAppSchema = z.object({
  accessToken: z.string().min(20, "El access token parece invalido"),
  appSecret: z.string().min(8, "El app secret parece invalido"),
  verifyToken: z.string().min(8, "El verify token parece invalido"),
  wabaId: z.string().min(3, "El WABA ID es requerido").max(120, "El WABA ID es demasiado largo"),
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

  const parsedBody = await parseJsonRequestBody(request, connectWhatsAppSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const accessToken = parsedBody.data.accessToken.trim();
  const appSecret = parsedBody.data.appSecret.trim();
  const verifyToken = parsedBody.data.verifyToken.trim();
  const wabaId = parsedBody.data.wabaId.trim();

  try {
    const sources = await listWhatsAppSources({ accessToken, wabaId }, {
      organizationId: session.organizationId,
      methodKey: "whatsapp.phone_numbers.list",
    });

    const metadata = buildConnectedIntegrationMetadata({
      current: null,
      validatedAtKey: "verified_at",
      providerMetadata: {
        provider: "meta_whatsapp_cloud",
        access_token_hint: buildWhatsAppAccessTokenHint(accessToken),
        source_count: sources.length,
        read_only: true,
        waba_id: wabaId,
      },
    });

    const integrationResult = await upsertWhatsAppIntegration({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: parsedBody.data.name?.trim() || "WhatsApp Cloud API",
      accessTokenEncrypted: encryptSecret(accessToken),
      appSecretEncrypted: encryptSecret(appSecret),
      verifyTokenEncrypted: encryptSecret(verifyToken),
      wabaId,
      metadata,
    });

    if (integrationResult.error || !integrationResult.data) {
      console.error("integrations.whatsapp_connect_persist_error", {
        organizationId: session.organizationId,
        error: integrationResult.error ?? "unknown",
      });

      return NextResponse.json(
        { error: "No se pudo guardar la integracion de WhatsApp" },
        { status: 500 }
      );
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "integration.whatsapp_connected",
      resourceType: "integration",
      resourceId: integrationResult.data.id,
      newValue: {
        sources_count: sources.length,
        waba_id: wabaId,
      },
    });

    return NextResponse.json({
      data: {
        integration: integrationResult.data,
        sourcesCount: sources.length,
      },
    });
  } catch (error) {
    console.error("integrations.whatsapp_connect_error", {
      organizationId: session.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: getSafeProviderErrorMessage(error, "No se pudo validar la conexion con Meta Cloud API") },
      { status: 502 }
    );
  }
}
