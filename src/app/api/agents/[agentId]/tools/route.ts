import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { deleteAgentTool, getAgentToolById, listAgentTools, upsertAgentTool } from "@/lib/db/agent-tools";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { getIntegrationById } from "@/lib/db/integration-operations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getIntegrationOperationalView } from "@/lib/integrations/metadata";
import { detectSalesforcePromptConflict } from "@/lib/integrations/salesforce-selection";
import { getSalesforceAgentToolDiagnostics } from "@/lib/integrations/salesforce-agent-tool-selection";
import { salesforceAgentToolConfigSchema } from "@/lib/integrations/salesforce-tools";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";

const saveAgentToolSchema = z.object({
  toolType: z.literal("crm"),
  integrationId: z.string().uuid("integrationId debe ser un UUID valido"),
  isEnabled: z.boolean().optional(),
  config: salesforceAgentToolConfigSchema,
});

const deleteAgentToolSchema = z.object({
  agentToolId: z.string().uuid("agentToolId debe ser un UUID valido"),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "read",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const [toolsResult, salesforceIntegrationResult] = await Promise.all([
    listAgentTools(agentId, session.organizationId),
    getPrimarySalesforceIntegration(session.organizationId),
  ]);

  if (toolsResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar las tools del agente" }, { status: 500 });
  }

  if (salesforceIntegrationResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la integracion Salesforce" }, { status: 500 });
  }

  const tools = toolsResult.data ?? [];
  const salesforceToolDiagnostics = getSalesforceAgentToolDiagnostics(
    tools,
    salesforceIntegrationResult.data?.id ?? null
  );
  const promptConflict = detectSalesforcePromptConflict(access.agent.system_prompt);

  return NextResponse.json({
    data: {
      tools,
      salesforceIntegration: salesforceIntegrationResult.data,
      salesforceOperationalView: getIntegrationOperationalView(salesforceIntegrationResult.data),
      selectedSalesforceToolId: salesforceToolDiagnostics.selectedTool?.id ?? null,
      selectedSalesforceIntegrationId:
        salesforceToolDiagnostics.selectedTool?.integration_id ?? null,
      selectedSalesforceAllowedActions: salesforceToolDiagnostics.selectedAllowedActions,
      hasDuplicateSalesforceTools: salesforceToolDiagnostics.hasDuplicateSalesforceTools,
      hasMisalignedSalesforceTools: salesforceToolDiagnostics.hasMisalignedSalesforceTools,
      hasAlignedSelectedSalesforceTool:
        salesforceToolDiagnostics.hasSelectedToolAlignedWithIntegration,
      selectedSalesforceLookupEnabled: salesforceToolDiagnostics.hasLookupRecordsAction,
      promptBlocksSalesforceAccess: promptConflict.hasConflict,
      salesforcePromptConflictSnippet: promptConflict.snippet,
    },
  });
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

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "edit",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const parsedBody = await parseJsonRequestBody(request, saveAgentToolSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const integrationResult = await getIntegrationById(
    parsedBody.data.integrationId,
    session.organizationId
  );

  if (integrationResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la integracion" }, { status: 500 });
  }

  if (!integrationResult.data || integrationResult.data.type !== "salesforce") {
    return NextResponse.json({ error: "La integracion Salesforce no existe en esta organizacion" }, { status: 404 });
  }

  const integrationAccess = assertUsableIntegration(integrationResult.data);
  if (!integrationAccess.ok) {
    return NextResponse.json({ error: integrationAccess.message }, { status: integrationAccess.status });
  }

  const upsertResult = await upsertAgentTool({
    agentId,
    organizationId: session.organizationId,
    integrationId: parsedBody.data.integrationId,
    toolType: parsedBody.data.toolType,
    isEnabled: parsedBody.data.isEnabled ?? true,
    config: parsedBody.data.config,
  });

  if (upsertResult.error || !upsertResult.data) {
    return NextResponse.json({ error: upsertResult.error ?? "No se pudo guardar la tool" }, { status: 500 });
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent_tool.upserted",
    resourceType: "agent",
    resourceId: agentId,
    newValue: {
      agent_tool_id: upsertResult.data.id,
      tool_type: upsertResult.data.tool_type,
      integration_id: upsertResult.data.integration_id,
      is_enabled: upsertResult.data.is_enabled,
      config: upsertResult.data.config,
    },
  });

  const promptConflict = detectSalesforcePromptConflict(access.agent.system_prompt);

  return NextResponse.json({
    data: upsertResult.data,
    ...(promptConflict.hasConflict
      ? {
          warning:
            "El system prompt del agente contiene frases que le dicen al LLM que no tiene acceso a Salesforce. " +
            "Esto puede impedir que use la tool correctamente. Revisa el system prompt y elimina esas frases.",
          promptConflictSnippet: promptConflict.snippet,
        }
      : {}),
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
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

  const parsedBody = await parseJsonRequestBody(request, deleteAgentToolSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const existingToolResult = await getAgentToolById(parsedBody.data.agentToolId, session.organizationId);
  if (existingToolResult.error) {
    return NextResponse.json({ error: "No se pudo cargar la tool" }, { status: 500 });
  }

  if (!existingToolResult.data || existingToolResult.data.agent_id !== agentId) {
    return NextResponse.json({ error: "Tool no encontrada para este agente" }, { status: 404 });
  }

  const deleteResult = await deleteAgentTool(parsedBody.data.agentToolId, session.organizationId);
  if (deleteResult.error) {
    return NextResponse.json({ error: "No se pudo eliminar la tool" }, { status: 500 });
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent_tool.deleted",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: {
      agent_tool_id: existingToolResult.data.id,
      tool_type: existingToolResult.data.tool_type,
      integration_id: existingToolResult.data.integration_id,
    },
  });

  return NextResponse.json({ data: { deleted: true } });
}
