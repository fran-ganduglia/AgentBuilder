import { NextResponse } from "next/server";
import { z } from "zod";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { deleteAgentTool, getAgentToolById, listAgentTools, upsertAgentTool } from "@/lib/db/agent-tools";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { getPrimaryHubSpotIntegration } from "@/lib/db/hubspot-integrations";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { getIntegrationById } from "@/lib/db/integration-operations";
import {
  getGmailAgentToolDiagnostics,
  getGoogleCalendarAgentToolDiagnostics,
} from "@/lib/integrations/google-agent-tool-selection";
import {
  gmailAgentToolConfigSchema,
  googleCalendarAgentToolConfigSchema,
} from "@/lib/integrations/google-agent-tools";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  getIntegrationOperationalView,
  isIntegrationOperationalViewUsable,
} from "@/lib/integrations/metadata";
import { getHubSpotAgentToolDiagnostics } from "@/lib/integrations/hubspot-agent-tool-selection";
import { hubSpotAgentToolConfigSchema } from "@/lib/integrations/hubspot-tools";
import { getSalesforceAgentToolDiagnostics } from "@/lib/integrations/salesforce-agent-tool-selection";
import { salesforceAgentToolConfigSchema } from "@/lib/integrations/salesforce-tools";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";

const saveAgentToolSchema = z.object({
  toolType: z.enum(["crm", "gmail", "google_calendar"]),
  integrationId: z.string().uuid("integrationId debe ser un UUID valido"),
  isEnabled: z.boolean().optional(),
  config: z.union([
    salesforceAgentToolConfigSchema,
    hubSpotAgentToolConfigSchema,
    gmailAgentToolConfigSchema,
    googleCalendarAgentToolConfigSchema,
  ]),
}).superRefine((value, ctx) => {
  if (
    value.toolType === "crm" &&
    !("provider" in value.config && (value.config.provider === "salesforce" || value.config.provider === "hubspot"))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La tool CRM debe usar config de Salesforce o HubSpot",
      path: ["config"],
    });
  }

  if (value.toolType === "gmail" && (!("surface" in value.config) || value.config.surface !== "gmail")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La tool Gmail debe usar surface = gmail",
      path: ["config"],
    });
  }

  if (
    value.toolType === "google_calendar" &&
    (!("surface" in value.config) || value.config.surface !== "google_calendar")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La tool Google Calendar debe usar surface = google_calendar",
      path: ["config"],
    });
  }
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

  const [toolsResult, salesforceIntegrationResult, hubspotIntegrationResult, googleIntegrationResult] = await Promise.all([
    listAgentTools(agentId, session.organizationId),
    getPrimarySalesforceIntegration(session.organizationId),
    getPrimaryHubSpotIntegration(session.organizationId),
    getPrimaryGoogleIntegration(session.organizationId),
  ]);

  if (toolsResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar las tools del agente" }, { status: 500 });
  }

  if (salesforceIntegrationResult.error || hubspotIntegrationResult.error || googleIntegrationResult.error) {
    return NextResponse.json({ error: "No se pudieron cargar las integraciones del agente" }, { status: 500 });
  }

  const tools = toolsResult.data ?? [];
  const salesforceToolDiagnostics = getSalesforceAgentToolDiagnostics(
    tools,
    salesforceIntegrationResult.data?.id ?? null
  );
  const hubspotToolDiagnostics = getHubSpotAgentToolDiagnostics(
    tools,
    hubspotIntegrationResult.data?.id ?? null
  );
  const salesforceOperationalView = getIntegrationOperationalView(salesforceIntegrationResult.data);
  const hubspotOperationalView = getIntegrationOperationalView(hubspotIntegrationResult.data);
  const googleOperationalView = getIntegrationOperationalView(googleIntegrationResult.data);
  const gmailToolDiagnostics = getGmailAgentToolDiagnostics(
    tools,
    googleIntegrationResult.data?.id ?? null
  );
  const googleCalendarToolDiagnostics = getGoogleCalendarAgentToolDiagnostics(
    tools,
    googleIntegrationResult.data?.id ?? null
  );
  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: access.agent.system_prompt,
    setupState: readAgentSetupState(access.agent),
    promptEnvironment: {
      salesforceUsable:
        isIntegrationOperationalViewUsable(salesforceOperationalView) &&
        Boolean(salesforceToolDiagnostics.selectedTool?.is_enabled) &&
        salesforceToolDiagnostics.hasSelectedToolAlignedWithIntegration,
      hubspotUsable:
        isIntegrationOperationalViewUsable(hubspotOperationalView) &&
        Boolean(hubspotToolDiagnostics.selectedTool?.is_enabled),
    },
    allowConflictCleanupForCustom: false,
  });

  return NextResponse.json({
    data: {
      tools,
      salesforceIntegration: salesforceIntegrationResult.data,
      salesforceOperationalView,
      selectedSalesforceToolId: salesforceToolDiagnostics.selectedTool?.id ?? null,
      selectedSalesforceIntegrationId: salesforceToolDiagnostics.selectedTool?.integration_id ?? null,
      selectedSalesforceAllowedActions: salesforceToolDiagnostics.selectedAllowedActions,
      hasDuplicateSalesforceTools: salesforceToolDiagnostics.hasDuplicateSalesforceTools,
      hasMisalignedSalesforceTools: salesforceToolDiagnostics.hasMisalignedSalesforceTools,
      hasAlignedSelectedSalesforceTool: salesforceToolDiagnostics.hasSelectedToolAlignedWithIntegration,
      selectedSalesforceLookupEnabled: salesforceToolDiagnostics.hasLookupRecordsAction,
      promptBlocksSalesforceAccess: promptResolution.syncMode === "custom" && promptResolution.hasPromptConflict,
      salesforcePromptConflictSnippet: promptResolution.promptConflictSnippet,
      hubspotIntegration: hubspotIntegrationResult.data,
      hubspotOperationalView,
      selectedHubSpotToolId: hubspotToolDiagnostics.selectedTool?.id ?? null,
      selectedHubSpotIntegrationId: hubspotToolDiagnostics.selectedTool?.integration_id ?? null,
      selectedHubSpotAllowedActions: hubspotToolDiagnostics.selectedAllowedActions,
      hasDuplicateHubSpotTools: hubspotToolDiagnostics.hasDuplicateHubSpotTools,
      hasMisalignedHubSpotTools: hubspotToolDiagnostics.hasMisalignedHubSpotTools,
      googleIntegration: googleIntegrationResult.data,
      googleOperationalView,
      selectedGmailToolId: gmailToolDiagnostics.selectedTool?.id ?? null,
      selectedGmailIntegrationId: gmailToolDiagnostics.selectedTool?.integration_id ?? null,
      selectedGmailAllowedActions: gmailToolDiagnostics.selectedAllowedActions,
      hasDuplicateGmailTools: gmailToolDiagnostics.hasDuplicateTools,
      hasMisalignedGmailTools: gmailToolDiagnostics.hasMisalignedTools,
      selectedGoogleCalendarToolId: googleCalendarToolDiagnostics.selectedTool?.id ?? null,
      selectedGoogleCalendarIntegrationId:
        googleCalendarToolDiagnostics.selectedTool?.integration_id ?? null,
      selectedGoogleCalendarAllowedActions:
        googleCalendarToolDiagnostics.selectedAllowedActions,
      hasDuplicateGoogleCalendarTools:
        googleCalendarToolDiagnostics.hasDuplicateTools,
      hasMisalignedGoogleCalendarTools:
        googleCalendarToolDiagnostics.hasMisalignedTools,
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

  if (!integrationResult.data) {
    return NextResponse.json({ error: "La integracion no existe en esta organizacion" }, { status: 404 });
  }

  if (
    parsedBody.data.config.provider === "google" &&
    integrationResult.data.type !== "google"
  ) {
    return NextResponse.json(
      { error: "La integracion Google no existe en esta organizacion" },
      { status: 404 }
    );
  }

  if (
    parsedBody.data.config.provider !== "google" &&
    integrationResult.data.type !== parsedBody.data.config.provider
  ) {
    return NextResponse.json({ error: "La integracion CRM no existe en esta organizacion" }, { status: 404 });
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

  if (parsedBody.data.config.provider !== "salesforce") {
    return NextResponse.json({ data: upsertResult.data });
  }

  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: access.agent.system_prompt,
    setupState: readAgentSetupState(access.agent),
    promptEnvironment: { salesforceUsable: true },
    allowConflictCleanupForCustom: false,
  });

  return NextResponse.json({
    data: upsertResult.data,
    ...(promptResolution.syncMode === "custom" && promptResolution.hasPromptConflict
      ? {
          warning:
            "El system prompt del agente contiene frases que le dicen al LLM que no tiene acceso a Salesforce. " +
            "Esto puede impedir que use la tool correctamente. Revisa el system prompt y elimina esas frases.",
          promptConflictSnippet: promptResolution.promptConflictSnippet,
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
