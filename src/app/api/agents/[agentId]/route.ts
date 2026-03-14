import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { haveIntegrationSelectionsChanged, validateIntegrationSelection } from "@/lib/agents/agent-integration-limits";
import { getSession } from "@/lib/auth/get-session";
import { agentModelSchema } from "@/lib/agents/agent-config";
import {
  agentSetupStateSchema,
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
  buildHubSpotSetupResolutionContext,
  getHubSpotAgentIntegrationState,
} from "@/lib/agents/hubspot-agent-integration";
import {
  buildSalesforceSetupResolutionContext,
  getSalesforceAgentIntegrationState,
} from "@/lib/agents/salesforce-agent-integration";
import { getAgentDeletionDeadlineIso } from "@/lib/agents/agent-deletion";
import { normalizeSetupState, readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { hasReadyDocuments } from "@/lib/db/agent-documents";
import { getAgentById, softDeleteAgent, updateAgent } from "@/lib/db/agents";
import {
  createDeletionRequest,
  isDeletionRequestsUnavailableError,
} from "@/lib/db/deletion-requests";
import {
  getAgentConnectionByAgentId,
  markAgentConnectionError,
  markAgentConnectionSynced,
} from "@/lib/db/agent-connections";
import { insertAuditLog } from "@/lib/db/audit";
import { enqueueEvent } from "@/lib/db/event-queue";
import { getOrganizationPlanName } from "@/lib/db/organization-plans";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { resolveGoogleCalendarIntegrationTimezone } from "@/lib/integrations/google-calendar-timezone";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { isSalesforceCrmAgentTool } from "@/lib/integrations/salesforce-agent-tool-selection";
import { listAgentTools } from "@/lib/db/agent-tools";
import {
  buildAssistantConnectionMetadata,
} from "@/lib/llm/openai-assistant-mapper";
import { updateOpenAIAssistant } from "@/lib/llm/openai-assistants";
import type { Role } from "@/types/app";
import type { Json } from "@/types/database";
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
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function hasRemoteManagedFieldChange(
  input: Parameters<typeof updateAgent>[1],
  existingAgent: Awaited<ReturnType<typeof getAgentById>>["data"]
): boolean {
  if (!existingAgent) {
    return false;
  }

  return (
    (input.name !== undefined && input.name !== existingAgent.name) ||
    (input.description !== undefined && (input.description?.trim() || null) !== (existingAgent.description ?? null)) ||
    (input.systemPrompt !== undefined && input.systemPrompt !== existingAgent.system_prompt) ||
    (input.llmModel !== undefined && input.llmModel !== existingAgent.llm_model) ||
    (input.llmTemperature !== undefined && input.llmTemperature !== existingAgent.llm_temperature)
  );
}

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
    const [salesforceIntegrationStateResult, hubspotIntegrationStateResult, gmailIntegrationStateResult, googleCalendarIntegrationStateResult] = await Promise.all([
      getSalesforceAgentIntegrationState({
        agentId,
        organizationId: session.organizationId,
        setupState: baseSetupState,
      }),
      getHubSpotAgentIntegrationState({
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
    ]);

    if (salesforceIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion Salesforce del agente" },
        { status: 500 }
      );
    }

    if (hubspotIntegrationStateResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la vinculacion HubSpot del agente" },
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

    providerIntegrations = {
      ...buildSalesforceSetupResolutionContext(salesforceIntegrationStateResult.data),
      ...buildHubSpotSetupResolutionContext(hubspotIntegrationStateResult.data),
      ...buildGmailSetupResolutionContext(gmailIntegrationStateResult.data),
      ...buildGoogleCalendarSetupResolutionContext(googleCalendarIntegrationStateResult.data),
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
  const nextSetupState = parsedBody.data.setupState
    ? normalizeSetupState(parsedBody.data.setupState, {
      hasReadyDocuments: hasDocumentsReady,
      googleCalendarDetectedTimezone,
      providerIntegrations,
    })
    : existingSetupState;
  const updateInput: Parameters<typeof updateAgent>[1] = {
    name: parsedBody.data.name,
    description: parsedBody.data.description,
    systemPrompt: parsedBody.data.systemPrompt,
    llmModel: parsedBody.data.llmModel,
    llmTemperature: parsedBody.data.llmTemperature,
    status: parsedBody.data.status,
    ...(parsedBody.data.setupState ? { setupState: nextSetupState ?? undefined } : {}),
  };

  const integrationsChanged = parsedBody.data.setupState
    ? haveIntegrationSelectionsChanged(
      existingSetupState?.integrations ?? [],
      nextSetupState?.integrations ?? []
    )
    : false;

  if (parsedBody.data.setupState && integrationsChanged && nextSetupState) {
    const planResult = await getOrganizationPlanName(session.organizationId);

    if (planResult.error || !planResult.data) {
      return NextResponse.json(
        { error: planResult.error ?? "No se pudo validar el plan de la organizacion" },
        { status: 500 }
      );
    }

    const integrationValidationError = validateIntegrationSelection({
      planName: planResult.data,
      integrationIds: nextSetupState.integrations,
    });

    if (integrationValidationError) {
      return NextResponse.json({ error: integrationValidationError }, { status: 422 });
    }
  }

  if (updateInput.status === "active") {
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
  }

  const connectionResult = await getAgentConnectionByAgentId(agentId, session.organizationId);
  if (connectionResult.error) {
    return NextResponse.json(
      { error: "No se pudo validar la conexion del agente" },
      { status: 500 }
    );
  }

  const connection = connectionResult.data;
  const connectionSummary = buildAgentConnectionSummary(connection);
  const requiresRemoteSync =
    connectionSummary.classification === "remote_managed" &&
    hasRemoteManagedFieldChange(updateInput, existingAgent);

  if (requiresRemoteSync && session.role !== "admin") {
    return NextResponse.json(
      { error: "Solo los administradores pueden editar campos sincronizados con OpenAI" },
      { status: 403 }
    );
  }

  let syncedAssistant:
    | Awaited<ReturnType<typeof updateOpenAIAssistant>>
    | null = null;

  if (connection && requiresRemoteSync) {
    const integrationResult = await getOpenAIIntegrationById(
      connection.integration_id,
      session.organizationId
    );

    if (integrationResult.error || !integrationResult.data) {
      return NextResponse.json(
        { error: "No se pudo cargar la integracion del agente" },
        { status: integrationResult.error ? 500 : 404 }
      );
    }

    const integrationAccess = assertUsableIntegration(integrationResult.data);
    if (!integrationAccess.ok) {
      return NextResponse.json({ error: integrationAccess.message }, { status: integrationAccess.status });
    }

    const apiKeyResult = await getOpenAIIntegrationApiKey(
      integrationResult.data.id,
      session.organizationId
    );

    if (apiKeyResult.error || !apiKeyResult.data) {
      return NextResponse.json(
        { error: "No se pudo leer la API key de OpenAI" },
        { status: 500 }
      );
    }

    try {
      syncedAssistant = await updateOpenAIAssistant(apiKeyResult.data, connection.provider_agent_id, {
        name: updateInput.name ?? existingAgent.name,
        description: updateInput.description ?? existingAgent.description ?? undefined,
        instructions: updateInput.systemPrompt ?? existingAgent.system_prompt,
        model: updateInput.llmModel ?? existingAgent.llm_model,
        temperature: updateInput.llmTemperature ?? existingAgent.llm_temperature ?? 0.7,
      }, {
        organizationId: session.organizationId,
        integrationId: integrationResult.data.id,
        methodKey: "openai.assistants.update",
      });
    } catch (error) {
      console.error("agents.update_connected.remote_error", {
        organizationId: session.organizationId,
        agentId,
        integrationId: connection.integration_id,
        error: error instanceof Error ? error.message : "unknown",
      });

      return NextResponse.json(
        { error: getSafeProviderErrorMessage(error, "No se pudo actualizar el assistant en OpenAI") },
        { status: 502 }
      );
    }
  }

  const { data: agent, error } = await updateAgent(
    agentId,
    updateInput,
    session.organizationId
  );

  if (error || !agent) {
    if (connection && syncedAssistant && connectionSummary.classification === "remote_managed") {
      await markAgentConnectionError(
        connection.id,
        session.organizationId,
        "local_sync_failed"
      );
    }

    return NextResponse.json(
      { error: error ?? "No se pudo actualizar el agente" },
      { status: 500 }
    );
  }

  if (connection && syncedAssistant && connectionSummary.classification === "remote_managed") {
    await markAgentConnectionSynced(
      connection.id,
      session.organizationId,
      syncedAssistant.remoteUpdatedAt,
      buildAssistantConnectionMetadata(syncedAssistant)
    );

    void insertProviderActionAudit({
      organizationId: session.organizationId,
      userId: session.user.id,
      integrationId: connection.integration_id,
      agentId,
      provider: "openai",
      providerObjectType: "assistant",
      providerObjectId: connection.provider_agent_id,
      action: "provider.openai.assistant.updated",
      requestId: syncedAssistant.providerRequestId,
      status: "success",
    });
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










