import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { insertIntegrationNotification } from "@/lib/db/integration-notifications";
import { getPrimarySalesforceIntegration, getSalesforceIntegrationConfig } from "@/lib/db/salesforce-integrations";
import { revokeIntegration } from "@/lib/db/integration-operations";
import { revokeSalesforceToken } from "@/lib/integrations/salesforce";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";

const disconnectSalesforceSchema = z.object({
  reason: z.string().trim().min(8, "Debes indicar un motivo de al menos 8 caracteres").max(240, "El motivo es demasiado largo"),
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

  const parsedBody = await parseJsonRequestBody(request, disconnectSalesforceSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const integrationResult = await getPrimarySalesforceIntegration(session.organizationId);
  if (integrationResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la integracion de Salesforce" }, { status: 500 });
  }

  if (!integrationResult.data) {
    return NextResponse.json({ error: "Integracion Salesforce no encontrada" }, { status: 404 });
  }

  const configResult = await getSalesforceIntegrationConfig(
    integrationResult.data.id,
    session.organizationId
  );

  if (configResult.data) {
    const revocationToken = configResult.data.refreshToken ?? configResult.data.accessToken;

    try {
      await revokeSalesforceToken({
        instanceUrl: configResult.data.instanceUrl,
        token: revocationToken,
      });
    } catch (error) {
      console.warn("integrations.salesforce_disconnect_remote_revoke_failed", {
        organizationId: session.organizationId,
        integrationId: integrationResult.data.id,
        error: error instanceof Error ? error.message : "unknown",
      });
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
    return NextResponse.json({ error: "No se pudo desconectar Salesforce" }, { status: 500 });
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
    action: parsedBody.data.compromised ? "integration.salesforce_disconnected_compromised" : "integration.salesforce_disconnected",
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