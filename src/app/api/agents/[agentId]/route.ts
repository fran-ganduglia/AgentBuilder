import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canActivateScope,
  haveIntegrationSelectionsChanged,
  validateIntegrationSelection,
} from "@/lib/agents/agent-integration-limits";
import { getSession } from "@/lib/auth/get-session";
import { agentModelSchema } from "@/lib/agents/agent-config";
import {
  applyPublicWorkflowFields,
  agentSetupStateSchema,
  businessInstructionsPatchSchema,
  getActivationReadiness,
  toSetupStateJson,
} from "@/lib/agents/agent-setup";
import {
  buildGmailSetupResolutionContext,
  getGmailAgentIntegrationState,
} from "@/lib/agents/gmail-agent-integration";
import {
  buildGoogleCalendarSetupResolutionContext,
  getGoogleCalendarAgentIntegrationState,
} from "@/lib/agents/google-calendar-agent-integration";
import {
  buildGoogleSheetsSetupResolutionContext,
  getGoogleSheetsAgentIntegrationState,
} from "@/lib/agents/google-sheets-agent-integration";
import {
  buildSalesforceSetupResolutionContext,
  getSalesforceAgentIntegrationState,
} from "@/lib/agents/salesforce-agent-integration";
import { getAgentDeletionDeadlineIso } from "@/lib/agents/agent-deletion";
import { normalizeSetupState, readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { buildRecommendedSystemPrompt } from "@/lib/agents/agent-templates";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getAgentById, listAgents, softDeleteAgent, updateAgent } from "@/lib/db/agents";
import {
  createDeletionRequest,
  isDeletionRequestsUnavailableError,
} from "@/lib/db/deletion-requests";
import {
  getAgentConnectionByAgentId,
} from "@/lib/db/agent-connections";
import { insertAuditLog } from "@/lib/db/audit";
import { enqueueEvent } from "@/lib/db/event-queue";
import { getOrganizationPlan } from "@/lib/db/organization-plans";
import { resolveGoogleCalendarIntegrationTimezone } from "@/lib/integrations/google-calendar-timezone";
import { isSalesforceCrmAgentTool } from "@/lib/integrations/salesforce-agent-tool-selection";
import { listAgentTools } from "@/lib/db/agent-tools";
import type { Role } from "@/types/app";
import type { Json } from "@/types/database";
import { AGENT_CAPABILITIES, PUBLIC_WORKFLOW_IDS } from "@/lib/agents/public-workflow";
import { AGENT_SCOPES, OUT_OF_SCOPE_POLICIES } from "@/lib/agents/agent-scope";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
  validateSameOriginMutationRequest,
} from "@/lib/utils/request-security";

const ROLES_WITH_WRITE_ACCESS: readonly Role[] = ["admin", "editor"];

const updateAgentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres").optional(),
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido").optional(),
  llmModel: agentModelSchema.optional(),
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0").optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  setupState: agentSetupStateSchema.optional(),
  workflowId: z.enum(PUBLIC_WORKFLOW_IDS).optional(),
  agentScope: z.enum(AGENT_SCOPES).optional(),
  outOfScopePolicy: z.enum(OUT_OF_SCOPE_POLICIES).optional(),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).optional(),
  businessInstructions: businessInstructionsPatchSchema.optional(),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function buildActivationErrorMessage(readiness: ReturnType<typeof getActivationReadiness>): string {
  const parts: string[] = [];

  if (readiness.missingBaseFields.length > 0) {
    parts.push(`faltan campos base: ${readiness.missingBaseFields.join(", ")}`);
  }

  if (readiness.blockingItems.length > 0) {
    parts.push(
      `faltan requisitos de setup: ${readiness.blockingItems
        .map((item) => item.label.toLowerCase())
        .join(", ")}`
    );
  }

  return `No se puede activar el agente porque ${parts.join(" y ")}.`;
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!ROLES_WITH_WRITE_ACCESS.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;
  const { data: existingAgent } = await getAgentById(agentId, session.organizationId);
  if (!existingAgent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const parsedBody = await parseJsonRequestBody(request, updateAgentSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const hasDocumentsReady = await hasReadyDocuments(agentId, session.organizationId);
  const baseSetupState = readAgentSetupState(existingAgent, {
    hasReadyDocuments: hasDocumentsReady,
  });
  let providerIntegrations;
  let googleCalendarDetectedTimezone: string | null = null;

  if (baseSetupState) {
    const [
      salesforceIntegrationStateResult,
      gmailIntegrationStateResult,
      googleCalendarIntegrationStateResult,
      googleSheetsIntegrationStateResult,
    ] = await Promise.all([
      getSalesforceAgentIntegrationState({
        agentId,
        organizationId: session.organizationId,
        setupState: baseSetupState,
      }),
      getGmailAgentIntegrationState({
        agentId,
        organizationId: session.organizationId,
        setupState: baseSetupState,
      }),
      getGoogleCalendarAgentIntegrationState({
        agentId,
        organizationId: session.organizationId,
        setupState: baseSetupState,
      }),
      getGoogleSheetsAgentIntegrationState({
        agentId,
        organizationId: session.organizationId,
        setupState: baseSetupState,
      }),
    ]);

    if (salesforceIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Salesforce del agente" },
        { status: 500 }
      );
    }

    if (gmailIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Gmail del agente" },
        { status: 500 }
      );
    }

    if (googleCalendarIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Google Calendar del agente" },
        { status: 500 }
      );
    }

    if (googleSheetsIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Google Sheets del agente" },
        { status: 500 }
      );
    }

    providerIntegrations = {
      ...buildSalesforceSetupResolutionContext(salesforceIntegrationStateResult.data),
      ...buildGmailSetupResolutionContext(gmailIntegrationStateResult.data),
      ...buildGoogleCalendarSetupResolutionContext(googleCalendarIntegrationStateResult.data),
      ...buildGoogleSheetsSetupResolutionContext(googleSheetsIntegrationStateResult.data),
    };

    if (
      googleCalendarIntegrationStateResult.data?.integration &&
      googleCalendarIntegrationStateResult.data.hasUsableIntegration
    ) {
      const googleCalendarTimezoneResult = await resolveGoogleCalendarIntegrationTimezone({
        integrationId: googleCalendarIntegrationStateResult.data.integration.id,
        organizationId: session.organizationId,
      });
      googleCalendarDetectedTimezone =
        googleCalendarTimezoneResult.data?.detectedTimezone ?? null;
    }
  }

  const existingSetupState = readAgentSetupState(existingAgent, {
    hasReadyDocuments: hasDocumentsReady,
    googleCalendarDetectedTimezone,
    providerIntegrations,
  });
  const explicitSetupState = parsedBody.data.setupState
    ? normalizeSetupState(parsedBody.data.setupState, {
      hasReadyDocuments: hasDocumentsReady,
      googleCalendarDetectedTimezone,
      providerIntegrations,
    })
    : existingSetupState;
  const nextSetupState =
    explicitSetupState ||
    parsedBody.data.workflowId ||
    parsedBody.data.agentScope ||
    parsedBody.data.outOfScopePolicy ||
    parsedBody.data.capabilities ||
    parsedBody.data.businessInstructions
      ? applyPublicWorkflowFields({
        setupState: explicitSetupState,
        workflowId: parsedBody.data.workflowId,
        agentScope: parsedBody.data.agentScope,
        outOfScopePolicy: parsedBody.data.outOfScopePolicy,
        capabilities: parsedBody.data.capabilities,
        businessInstructions: parsedBody.data.businessInstructions,
      })
      : existingSetupState;
  const shouldRegenerateSystemPrompt = Boolean(
    parsedBody.data.setupState ||
    parsedBody.data.workflowId ||
    parsedBody.data.agentScope ||
    parsedBody.data.outOfScopePolicy ||
    parsedBody.data.capabilities ||
    parsedBody.data.businessInstructions
  );
  const resolvedSystemPrompt = shouldRegenerateSystemPrompt && nextSetupState
    ? buildRecommendedSystemPrompt(nextSetupState, {})
    : parsedBody.data.systemPrompt;
  const updateInput: Parameters<typeof updateAgent>[1] = {
    name: parsedBody.data.name,
    description: parsedBody.data.description,
    systemPrompt: resolvedSystemPrompt,
    llmModel: parsedBody.data.llmModel,
    llmTemperature: parsedBody.data.llmTemperature,
    status: parsedBody.data.status,
    ...(
      parsedBody.data.setupState ||
      parsedBody.data.workflowId ||
      parsedBody.data.agentScope ||
      parsedBody.data.outOfScopePolicy ||
      parsedBody.data.capabilities ||
      parsedBody.data.businessInstructions
        ? { setupState: nextSetupState ?? undefined }
        : {}
    ),
  };

  const integrationsChanged = parsedBody.data.setupState
    ? haveIntegrationSelectionsChanged(
      existingSetupState?.integrations ?? [],
      nextSetupState?.integrations ?? []
    )
    : false;

  if (parsedBody.data.setupState && integrationsChanged && nextSetupState) {
    const planResult = await getOrganizationPlan(session.organizationId);

    if (planResult.error || !planResult.data) {
      return NextResponse.json(
        { error: planResult.error ?? "No se pudo validar el plan de la organizacion" },
        { status: 500 }
      );
    }

    const integrationValidationError = validateIntegrationSelection({
      planName: planResult.data.name,
      integrationIds: nextSetupState.integrations,
      features: planResult.data.features,
    });

    if (integrationValidationError) {
      return NextResponse.json({ error: integrationValidationError }, { status: 422 });
    }
  }

  const resultingStatus = updateInput.status ?? existingAgent.status;

  if (resultingStatus === "active") {
    const readiness = getActivationReadiness({
      name: updateInput.name ?? existingAgent.name,
      systemPrompt: updateInput.systemPrompt ?? existingAgent.system_prompt,
      llmModel: updateInput.llmModel ?? existingAgent.llm_model,
      llmTemperature: updateInput.llmTemperature ?? existingAgent.llm_temperature,
      setupState: nextSetupState,
      hasReadyDocuments: hasDocumentsReady,
      providerIntegrations,
    });

    if (!readiness.canActivate) {
      return NextResponse.json(
        { error: buildActivationErrorMessage(readiness) },
        { status: 400 }
      );
    }

    const planResult = await getOrganizationPlan(session.organizationId);

    if (planResult.error || !planResult.data) {
      return NextResponse.json(
        { error: planResult.error ?? "No se pudo validar el plan de la organizacion" },
        { status: 500 }
      );
    }

    const targetScope = nextSetupState?.agentScope ?? existingSetupState?.agentScope ?? "operations";
    const agentsResult = await listAgents(session.organizationId);

    if (agentsResult.error || !agentsResult.data) {
      return NextResponse.json(
        { error: agentsResult.error ?? "No se pudieron verificar los agentes activos" },
        { status: 500 }
      );
    }

    const otherActiveAgents = agentsResult.data.filter(
      (agent) => agent.id !== agentId && agent.status === "active"
    );
    const activeScopes = new Set<string>();
    let activeAgentsInScope = 0;

    for (const agent of otherActiveAgents) {
      const setupState = readAgentSetupState(agent);
      const scope = setupState?.agentScope ?? "operations";
      activeScopes.add(scope);

      if (scope === targetScope) {
        activeAgentsInScope += 1;
      }
    }

    const activationCheck = canActivateScope({
      planName: planResult.data.name,
      activeScopes: Array.from(activeScopes),
      activeAgentsInScope,
      targetScope,
      features: planResult.data.features,
    });

    if (!activationCheck.allowed) {
      return NextResponse.json(
        { error: activationCheck.message ?? "No se pudo activar el scope en el plan actual" },
        { status: 422 }
      );
    }
  }

  const connectionResult = await getAgentConnectionByAgentId(agentId, session.organizationId);
  if (connectionResult.error) {
    return NextResponse.json(
      { error: "No se pudo validar la conexion del agente" },
      { status: 500 }
    );
  }

  const connection = connectionResult.data;
  const { data: agent, error } = await updateAgent(
    agentId,
    updateInput,
    session.organizationId
  );

  if (error || !agent) {
    return NextResponse.json(
      { error: error ?? "No se pudo actualizar el agente" },
      { status: 500 }
    );
  }

  const oldValues: Json = {
    name: existingAgent.name,
    description: existingAgent.description,
    status: existingAgent.status,
    llm_model: existingAgent.llm_model,
    llm_temperature: existingAgent.llm_temperature,
    setup_status: existingSetupState?.setup_status ?? null,
  };
  const newValues: Json = {
    name: agent.name,
    description: agent.description,
    status: agent.status,
    llm_model: agent.llm_model,
    llm_temperature: agent.llm_temperature,
    setup_status: nextSetupState?.setup_status ?? null,
  };

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent.updated",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: oldValues,
    newValue: newValues,
  });

  void enqueueEvent({
    organizationId: session.organizationId,
    eventType: "agent.updated",
    entityType: "agent",
    entityId: agentId,
    idempotencyKey: `agent.updated:${agentId}:${agent.updated_at ?? new Date().toISOString()}`,
    payload: {
      agent_id: agentId,
      name: agent.name,
      status: agent.status,
      llm_model: agent.llm_model,
      llm_temperature: agent.llm_temperature ?? null,
      updated_at: agent.updated_at ?? null,
      changed_fields: Object.keys(updateInput),
      source: connection?.provider_type ?? "local",
      setup_state: nextSetupState ? toSetupStateJson(nextSetupState) : null,
    },
  });

  let salesforcePromptWarning: string | undefined;

  if (parsedBody.data.systemPrompt) {
    const promptResolution = resolveEffectiveAgentPrompt({
      savedPrompt: agent.system_prompt,
      setupState: nextSetupState,
      promptEnvironment: {
        salesforceUsable: Boolean(
          providerIntegrations?.salesforce?.isUsable && providerIntegrations?.salesforce?.hasEnabledTool
        ),
      },
      allowConflictCleanupForCustom: false,
    });

    if (promptResolution.syncMode === "custom" && promptResolution.hasPromptConflict) {
      const toolsResult = await listAgentTools(agentId, session.organizationId);
      const hasSalesforceTool = (toolsResult.data ?? []).some(isSalesforceCrmAgentTool);

      if (hasSalesforceTool) {
        salesforcePromptWarning =
          "El system prompt contiene frases que le dicen al LLM que no tiene acceso a Salesforce. " +
          "Esto puede impedir que la tool CRM funcione correctamente. Revisa y elimina esas frases.";
      }
    }
  }

  return NextResponse.json({
    data: agent,
    ...(salesforcePromptWarning ? { warning: salesforcePromptWarning } : {}),
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateSameOriginMutationRequest(request);
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

  const { agentId } = await context.params;

  const { data: existingAgent } = await getAgentById(agentId, session.organizationId);
  if (!existingAgent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const { data: deletedAgent, error } = await softDeleteAgent(agentId, session.organizationId);

  if (error || !deletedAgent) {
    console.error("agents.delete.soft_delete_error", {
      organizationId: session.organizationId,
      agentId,
      error,
    });
    return NextResponse.json(
      { error: "No se pudo eliminar el agente" },
      { status: 500 }
    );
  }

  let scheduledForPermanentDeletion = false;
  let permanentDeletionAt = getAgentDeletionDeadlineIso(deletedAgent.deleted_at);

  const deletionRequestResult = await createDeletionRequest({
    organizationId: session.organizationId,
    requestedBy: session.user.id,
    entityType: "agent",
    entityId: agentId,
    reason: "agent_soft_deleted_from_agents_page",
  });

  if (deletionRequestResult.error) {
    const logMethod = isDeletionRequestsUnavailableError(deletionRequestResult.error)
      ? console.warn
      : console.error;

    logMethod("agents.delete.schedule_error", {
      organizationId: session.organizationId,
      agentId,
      error: deletionRequestResult.error,
    });
  } else {
    scheduledForPermanentDeletion = true;
    permanentDeletionAt = getAgentDeletionDeadlineIso(
      deletionRequestResult.data?.created_at ?? deletedAgent.deleted_at
    );
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent.deleted",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: { name: existingAgent.name, status: existingAgent.status } as Json,
  });

  void enqueueEvent({
    organizationId: session.organizationId,
    eventType: "agent.deleted",
    entityType: "agent",
    entityId: agentId,
    idempotencyKey: `agent.deleted:${agentId}:${deletedAgent.deleted_at ?? new Date().toISOString()}`,
    payload: {
      agent_id: agentId,
      name: existingAgent.name,
      status: existingAgent.status,
      deleted_at: deletedAgent.deleted_at ?? null,
      scheduled_for_permanent_deletion: scheduledForPermanentDeletion,
      permanent_deletion_at: permanentDeletionAt,
    },
  });

  return NextResponse.json({
    data: {
      success: true,
      agent: deletedAgent,
      scheduledForPermanentDeletion,
      permanentDeletionAt,
    },
  });
}










