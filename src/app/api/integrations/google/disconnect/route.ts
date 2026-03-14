import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import {
  getPrimaryGoogleIntegration,
} from "@/lib/db/google-integrations";
import { insertIntegrationNotification } from "@/lib/db/integration-notifications";
import { revokeIntegration } from "@/lib/db/integration-operations";
import { revokeGoogleToken } from "@/lib/integrations/google";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const disconnectGoogleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(8, "Debes indicar un motivo de al menos 8 caracteres")
    .max(240, "El motivo es demasiado largo"),
  compromised: z.boolean().optional(),
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

  const parsedBody = await parseJsonRequestBody(request, disconnectGoogleSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const integrationResult = await getPrimaryGoogleIntegration(session.organizationId);
  if (integrationResult.error) {
    return NextResponse.json(
      { error: "No se pudo cargar la integracion de Google" },
      { status: 500 }
    );
  }

  if (!integrationResult.data) {
    return NextResponse.json(
      { error: "Integracion Google no encontrada" },
      { status: 404 }
    );
  }

  const configResult = await getGoogleIntegrationConfig(
    integrationResult.data.id,
    session.organizationId
  );

  if (configResult.data) {
    try {
      await revokeGoogleToken(configResult.data.refreshToken ?? configResult.data.accessToken);
    } catch {
      // Best effort remote revocation.
    }
  }

  const revokeResult = await revokeIntegration({
    integrationId: integrationResult.data.id,
    organizationId: session.organizationId,
    userId: session.user.id,
    reason: parsedBody.data.reason,
    compromised: parsedBody.data.compromised ?? false,
  });

  if (revokeResult.error || !revokeResult.data) {
    return NextResponse.json(
      { error: "No se pudo desconectar Google" },
      { status: 500 }
    );
  }

  await insertIntegrationNotification({
    integration: revokeResult.data.integration,
    type: parsedBody.data.compromised ? "error" : "info",
    title: `${revokeResult.data.integration.name}: integracion revocada`,
    body: parsedBody.data.reason,
  });

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: parsedBody.data.compromised
      ? "integration.google_disconnected_compromised"
      : "integration.google_disconnected",
    resourceType: "integration",
    resourceId: revokeResult.data.integration.id,
    newValue: {
      reason: parsedBody.data.reason,
      compromised: parsedBody.data.compromised ?? false,
      disabled_tools_count: revokeResult.data.disabledToolsCount,
      disconnected_connections_count: revokeResult.data.disconnectedConnectionsCount,
    },
  });

  return NextResponse.json({
    data: {
      integration: revokeResult.data.integration,
      disabledToolsCount: revokeResult.data.disabledToolsCount,
      disconnectedConnectionsCount: revokeResult.data.disconnectedConnectionsCount,
    },
  });
}
