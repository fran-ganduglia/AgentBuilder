import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import {
  mergeSetupProgress,
  setupProgressPatchSchema,
  toSetupStateJson,
} from "@/lib/agents/agent-setup";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import {
  buildSalesforceSetupResolutionContext,
  getSalesforceAgentIntegrationState,
} from "@/lib/agents/salesforce-agent-integration";
import { canEditAgents } from "@/lib/auth/agent-access";
import { insertAuditLog } from "@/lib/db/audit";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getAgentById, updateAgentSetupState } from "@/lib/db/agents";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canEditAgents(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;
  const { data: existingAgent } = await getAgentById(agentId, session.organizationId);
  if (!existingAgent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const parsedBody = await parseJsonRequestBody(request, setupProgressPatchSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const hasDocumentsReady = await hasReadyDocuments(agentId, session.organizationId);
  const baseSetupState = readAgentSetupState(existingAgent, {
    hasReadyDocuments: hasDocumentsReady,
  });
  let providerIntegrations;

  if (baseSetupState) {
    const salesforceIntegrationStateResult = await getSalesforceAgentIntegrationState({
      agentId,
      organizationId: session.organizationId,
      setupState: baseSetupState,
    });

    if (salesforceIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Salesforce del agente" },
        { status: 500 }
      );
    }

    providerIntegrations = buildSalesforceSetupResolutionContext(salesforceIntegrationStateResult.data);
  }

  const existingSetupState = readAgentSetupState(existingAgent, {
    hasReadyDocuments: hasDocumentsReady,
    providerIntegrations,
  });

  if (!existingSetupState) {
    return NextResponse.json(
      { error: "Este agente no tiene onboarding guiado para actualizar" },
      { status: 400 }
    );
  }

  const manualItems = parsedBody.data.manualChecklist ?? [];
  const taskDataEntries = Object.keys(parsedBody.data.taskData ?? {});
  const unknownManualItem = manualItems.find(
    (item) => !existingSetupState.checklist.some((check) => check.id === item.id)
  );
  const unknownTaskItem = taskDataEntries.find(
    (itemId) => !existingSetupState.checklist.some((check) => check.id === itemId)
  );

  if (unknownManualItem || unknownTaskItem) {
    return NextResponse.json(
      { error: "El item de setup enviado no existe para este agente" },
      { status: 400 }
    );
  }

  const invalidStructuredCompletion = manualItems.find((item) => {
    const existingItem = existingSetupState.checklist.find((check) => check.id === item.id);
    return existingItem?.verification_mode === "structured" && item.status === "completed";
  });

  if (invalidStructuredCompletion) {
    return NextResponse.json(
      { error: "Los items estructurados se completan automaticamente cuando los datos son validos" },
      { status: 400 }
    );
  }

  const nextSetupState = mergeSetupProgress(existingSetupState, parsedBody.data, {
    hasReadyDocuments: hasDocumentsReady,
  });
  const updateResult = await updateAgentSetupState(
    agentId,
    session.organizationId,
    nextSetupState
  );

  if (updateResult.error || !updateResult.data) {
    return NextResponse.json(
      { error: updateResult.error ?? "No se pudo actualizar el setup del agente" },
      { status: 500 }
    );
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent.setup_updated",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: toSetupStateJson(existingSetupState),
    newValue: toSetupStateJson(nextSetupState),
  });

  return NextResponse.json({ data: { setupState: nextSetupState } });
}

