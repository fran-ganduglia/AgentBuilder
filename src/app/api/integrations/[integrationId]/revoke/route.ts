import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { getIntegrationById, revokeIntegration } from "@/lib/db/integration-operations";

import { insertIntegrationNotification } from "@/lib/db/integration-notifications";
import { insertAuditLog } from "@/lib/db/audit";
import type { Json } from "@/types/database";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const revokeIntegrationSchema = z.object({
  reason: z.string().min(8, "Debes indicar un motivo de al menos 8 caracteres").max(240, "El motivo es demasiado largo"),
  compromised: z.boolean().optional(),
});

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

  const parsedBody = await parseJsonRequestBody(request, revokeIntegrationSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const { integrationId } = await context.params;
  const integrationResult = await getIntegrationById(
    integrationId,
    session.organizationId
  );
  if (integrationResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la integracion" }, { status: 500 });
  }

  const fallbackResult = integrationResult.data
    ? integrationResult
    : null;

  const revokeResult = await revokeIntegration({
    integrationId,
    organizationId: session.organizationId,
    userId: session.user.id,
    reason: parsedBody.data.reason.trim(),
    compromised: parsedBody.data.compromised ?? false,
  });

  if (revokeResult.error) {
    return NextResponse.json({ error: "No se pudo revocar la integracion" }, { status: 500 });
  }

  if (!revokeResult.data) {
    return NextResponse.json({ error: "Integracion no encontrada" }, { status: 404 });
  }

  await insertIntegrationNotification({
    integration: revokeResult.data.integration,
    type: parsedBody.data.compromised ? "error" : "info",
    title: `${revokeResult.data.integration.name}: integracion revocada`,
    body: parsedBody.data.reason.trim(),
  });

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: parsedBody.data.compromised ? "integration.revoked_compromised" : "integration.revoked",
    resourceType: "integration",
    resourceId: integrationId,
    oldValue: fallbackResult?.data
      ? ({
          is_active: fallbackResult.data.is_active,
          type: fallbackResult.data.type,
        } as Json)
      : null,
    newValue: {
      reason: parsedBody.data.reason.trim(),
      compromised: parsedBody.data.compromised ?? false,
      disabled_tools_count: revokeResult.data.disabledToolsCount,
      disconnected_connections_count: revokeResult.data.disconnectedConnectionsCount,
    } as Json,
  });

  return NextResponse.json({
    data: {
      integration: revokeResult.data.integration,
      disabledToolsCount: revokeResult.data.disabledToolsCount,
      disconnectedConnectionsCount: revokeResult.data.disconnectedConnectionsCount,
    },
  });
}


