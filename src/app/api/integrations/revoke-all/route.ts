import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  listIntegrationsByOrganization,
  revokeIntegration,
} from "@/lib/db/integration-operations";
import { insertIntegrationNotification } from "@/lib/db/integration-notifications";
import { insertAuditLog } from "@/lib/db/audit";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const revokeAllIntegrationsSchema = z.object({
  reason: z.string().min(8, "Debes indicar un motivo de al menos 8 caracteres").max(240, "El motivo es demasiado largo"),
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

  const parsedBody = await parseJsonRequestBody(request, revokeAllIntegrationsSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const integrationsResult = await listIntegrationsByOrganization(
    session.organizationId,
    { includeInactive: false, useServiceRole: true }
  );

  if (integrationsResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar las integraciones activas" }, { status: 500 });
  }

  const revokedIds: string[] = [];
  let disabledToolsCount = 0;
  let disconnectedConnectionsCount = 0;

  for (const integration of integrationsResult.data ?? []) {
    const revokeResult = await revokeIntegration({
      integrationId: integration.id,
      organizationId: session.organizationId,
      userId: session.user.id,
      reason: parsedBody.data.reason.trim(),
      compromised: parsedBody.data.compromised ?? false,
    });

    if (revokeResult.data) {
      revokedIds.push(revokeResult.data.integration.id);
      disabledToolsCount += revokeResult.data.disabledToolsCount;
      disconnectedConnectionsCount += revokeResult.data.disconnectedConnectionsCount;
      await insertIntegrationNotification({
        integration: revokeResult.data.integration,
        type: parsedBody.data.compromised ? "error" : "info",
        title: `${revokeResult.data.integration.name}: integracion revocada`,
        body: parsedBody.data.reason.trim(),
      });
    }
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: parsedBody.data.compromised ? "integration.revoke_all_compromised" : "integration.revoke_all",
    resourceType: "integration",
    resourceId: null,
    newValue: {
      reason: parsedBody.data.reason.trim(),
      compromised: parsedBody.data.compromised ?? false,
      revoked_ids: revokedIds,
      disabled_tools_count: disabledToolsCount,
      disconnected_connections_count: disconnectedConnectionsCount,
    },
  });

  return NextResponse.json({
    data: {
      revokedCount: revokedIds.length,
      disabledToolsCount,
      disconnectedConnectionsCount,
    },
  });
}

