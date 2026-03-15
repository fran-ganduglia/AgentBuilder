import { NextResponse } from "next/server";
import { z } from "zod";
import { agentModelSchema } from "@/lib/agents/agent-config";
import { validateIntegrationSelection } from "@/lib/agents/agent-integration-limits";
import {
  applyPublicWorkflowFields,
  agentSetupStateSchema,
  businessInstructionsPatchSchema,
  getResolvedToolsForIntegration,
} from "@/lib/agents/agent-setup";
import { isSalesforceTemplateId } from "@/lib/agents/agent-templates";
import { normalizeSetupState } from "@/lib/agents/agent-setup-state";
import { buildRecommendedSystemPrompt } from "@/lib/agents/agent-templates";
import { getSession } from "@/lib/auth/get-session";
import { createAgent, softDeleteAgent, updateAgentSetupState } from "@/lib/db/agents";
import { createAgentConnection } from "@/lib/db/agent-connections";
import { upsertAgentTool } from "@/lib/db/agent-tools";
import { enqueueEvent } from "@/lib/db/event-queue";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { getOrganizationPlan } from "@/lib/db/organization-plans";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { resolveGoogleCalendarIntegrationTimezone } from "@/lib/integrations/google-calendar-timezone";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { buildAssistantConnectionMetadata } from "@/lib/llm/openai-assistant-mapper";
import {
  gmailAgentToolConfigSchema,
  googleCalendarAgentToolConfigSchema,
} from "@/lib/integrations/google-agent-tools";
import { hasAllGoogleScopesForSurface } from "@/lib/integrations/google-scopes";
import {
  createOpenAIAssistant,
  deleteOpenAIAssistant,
} from "@/lib/llm/openai-assistants";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import type { Role } from "@/types/app";
import type { Json } from "@/types/database";
import { AGENT_CAPABILITIES, PUBLIC_WORKFLOW_IDS } from "@/lib/agents/public-workflow";
import { AGENT_SCOPES, OUT_OF_SCOPE_POLICIES } from "@/lib/agents/agent-scope";

const ROLES_WITH_WRITE_ACCESS: readonly Role[] = ["admin", "editor"];

const createAgentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres"),
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido").optional(),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
  integrationId: z.string().uuid("integrationId debe ser un UUID valido").optional(),
  setupState: agentSetupStateSchema.optional(),
  workflowId: z.enum(PUBLIC_WORKFLOW_IDS).optional(),
  agentScope: z.enum(AGENT_SCOPES).optional(),
  outOfScopePolicy: z.enum(OUT_OF_SCOPE_POLICIES).optional(),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).optional(),
  businessInstructions: businessInstructionsPatchSchema.optional(),
}).superRefine((value, ctx) => {
  if (
    !value.systemPrompt?.trim() &&
    !value.setupState &&
    !value.workflowId &&
    !value.agentScope &&
    !value.businessInstructions
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["systemPrompt"],
      message: "El system prompt es requerido si no envias setupState, workflowId o agentScope.",
    });
  }
});

async function resolveAutoLinkIntegrations(organizationId: string, input: {
  expectsSalesforceIntegration: boolean;
  expectsGmailIntegration: boolean;
  expectsGoogleCalendarIntegration: boolean;
}): Promise<{
  salesforceIntegrationId: string | null;
  googleIntegrationId: string | null;
  googleGrantedScopes: string[];
  error: string | null;
}> {
  let salesforceIntegrationId: string | null = null;
  let googleIntegrationId: string | null = null;
  let googleGrantedScopes: string[] = [];

  if (input.expectsSalesforceIntegration) {
    const salesforceIntegrationResult = await getPrimarySalesforceIntegration(organizationId);

    if (salesforceIntegrationResult.error) {
      return {
        salesforceIntegrationId: null,
        googleIntegrationId: null,
        googleGrantedScopes: [],
        error: "No se pudo validar la integracion de Salesforce",
      };
    }

    if (salesforceIntegrationResult.data) {
      const salesforceAccess = assertUsableIntegration(salesforceIntegrationResult.data);
      if (salesforceAccess.ok) {
        salesforceIntegrationId = salesforceIntegrationResult.data.id;
      }
    }
  }

  if (input.expectsGmailIntegration || input.expectsGoogleCalendarIntegration) {
    const googleIntegrationResult = await getPrimaryGoogleIntegration(organizationId);

    if (googleIntegrationResult.error) {
      return {
        salesforceIntegrationId,
        googleIntegrationId: null,
        googleGrantedScopes: [],
        error: "No se pudo validar la integracion de Google Workspace",
      };
    }

    if (googleIntegrationResult.data) {
      const googleAccess = assertUsableIntegration(googleIntegrationResult.data);
      if (googleAccess.ok) {
        googleIntegrationId = googleIntegrationResult.data.id;
        googleGrantedScopes =
          googleIntegrationResult.data.metadata &&
          typeof googleIntegrationResult.data.metadata === "object" &&
          !Array.isArray(googleIntegrationResult.data.metadata)
            ? (() => {
                const scopes = Reflect.get(
                  googleIntegrationResult.data.metadata,
                  "granted_scopes"
                );
                return Array.isArray(scopes)
                  ? scopes.filter((scope): scope is string => typeof scope === "string")
                  : [];
              })()
            : [];
      }
    }
  }

  return {
    salesforceIntegrationId,
    googleIntegrationId,
    googleGrantedScopes,
    error: null,
  };
}

async function autoLinkLocalCrmTools(input: {
  agentId: string;
  organizationId: string;
  setupState: NonNullable<z.infer<typeof createAgentSchema>["setupState"]>;
  salesforceIntegrationId: string | null;
  googleIntegrationId: string | null;
  googleGrantedScopes: string[];
}): Promise<{ error: string | null; source: "local" | "local_salesforce_ready" }> {
  let source: "local" | "local_salesforce_ready" = "local";
  const salesforceAllowedActions = getResolvedToolsForIntegration(input.setupState, "salesforce");
  const gmailAllowedActions = getResolvedToolsForIntegration(input.setupState, "gmail");
  const googleCalendarAllowedActions = getResolvedToolsForIntegration(
    input.setupState,
    "google_calendar"
  );

  if (input.salesforceIntegrationId && salesforceAllowedActions.length > 0) {
    const toolResult = await upsertAgentTool({
      agentId: input.agentId,
      organizationId: input.organizationId,
      integrationId: input.salesforceIntegrationId,
      toolType: "crm",
      isEnabled: true,
      config: {
        provider: "salesforce",
        allowed_actions: salesforceAllowedActions,
      } as unknown as Json,
    });

    if (toolResult.error || !toolResult.data) {
      return { error: toolResult.error ?? "No se pudo vincular Salesforce al agente", source };
    }

    const resolvedSetupState = normalizeSetupState(input.setupState, {
      hasReadyDocuments: false,
      providerIntegrations: {
        salesforce: {
          isUsable: true,
          hasEnabledTool: true,
        },
      },
    });
    const setupUpdateResult = await updateAgentSetupState(
      input.agentId,
      input.organizationId,
      resolvedSetupState
    );

    if (setupUpdateResult.error || !setupUpdateResult.data) {
      return {
        error: setupUpdateResult.error ?? "No se pudo guardar el setup de Salesforce del agente",
        source,
      };
    }

    source = "local_salesforce_ready";
  }

  if (
    input.googleIntegrationId &&
    gmailAllowedActions.length > 0 &&
    hasAllGoogleScopesForSurface(input.googleGrantedScopes, "gmail")
  ) {
    const toolResult = await upsertAgentTool({
      agentId: input.agentId,
      organizationId: input.organizationId,
      integrationId: input.googleIntegrationId,
      toolType: "gmail",
      isEnabled: true,
      config: gmailAgentToolConfigSchema.parse({
        provider: "google",
        surface: "gmail",
        allowed_actions: gmailAllowedActions,
      }) as unknown as Json,
    });

    if (toolResult.error || !toolResult.data) {
      return { error: toolResult.error ?? "No se pudo configurar Gmail en el agente", source };
    }
  }

  if (
    input.googleIntegrationId &&
    googleCalendarAllowedActions.length > 0 &&
    hasAllGoogleScopesForSurface(input.googleGrantedScopes, "google_calendar")
  ) {
    const toolResult = await upsertAgentTool({
      agentId: input.agentId,
      organizationId: input.organizationId,
      integrationId: input.googleIntegrationId,
      toolType: "google_calendar",
      isEnabled: true,
      config: googleCalendarAgentToolConfigSchema.parse({
        provider: "google",
        surface: "google_calendar",
        allowed_actions: googleCalendarAllowedActions,
      }) as unknown as Json,
    });

    if (toolResult.error || !toolResult.data) {
      return {
        error: toolResult.error ?? "No se pudo configurar Google Calendar en el agente",
        source,
      };
    }
  }

  return { error: null, source };
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = await parseJsonRequestBody(request, createAgentSchema);
  if (parsed.errorResponse) {
    return parsed.errorResponse;
  }

  const initialSetupState = (() => {
    const normalizedBaseSetupState = parsed.data.setupState
      ? normalizeSetupState(parsed.data.setupState, { hasReadyDocuments: false })
      : undefined;

    if (
      normalizedBaseSetupState ||
      parsed.data.workflowId ||
      parsed.data.agentScope ||
      parsed.data.outOfScopePolicy ||
      parsed.data.capabilities ||
      parsed.data.businessInstructions
    ) {
      return applyPublicWorkflowFields({
        setupState: normalizedBaseSetupState,
        workflowId: parsed.data.workflowId,
        agentScope: parsed.data.agentScope,
        outOfScopePolicy: parsed.data.outOfScopePolicy,
        capabilities: parsed.data.capabilities,
        businessInstructions: parsed.data.businessInstructions,
      });
    }

    return undefined;
  })();

  if (initialSetupState) {
    const planResult = await getOrganizationPlan(session.organizationId);

    if (planResult.error || !planResult.data) {
      return NextResponse.json(
        { error: planResult.error ?? "No se pudo validar el plan de la organizacion" },
        { status: 500 }
      );
    }

    const integrationValidationError = validateIntegrationSelection({
      planName: planResult.data.name,
      integrationIds: initialSetupState.integrations,
      features: planResult.data.features,
    });

    if (integrationValidationError) {
      return NextResponse.json({ error: integrationValidationError }, { status: 422 });
    }
  }

  const expectsSalesforceIntegration = initialSetupState
    ? (isSalesforceTemplateId(initialSetupState.template_id) ||
      initialSetupState.integrations.includes("salesforce"))
    : false;
  const expectsGmailIntegration = initialSetupState
    ? (initialSetupState.template_id === "gmail_inbox_assistant" ||
      initialSetupState.template_id === "gmail_follow_up_assistant" ||
      initialSetupState.integrations.includes("gmail"))
    : false;
  const expectsGoogleCalendarIntegration = initialSetupState
    ? (initialSetupState.template_id === "calendar_booking_assistant" ||
      initialSetupState.template_id === "calendar_reschedule_assistant" ||
      initialSetupState.integrations.includes("google_calendar"))
    : false;

  const autoLinkIntegrations = await resolveAutoLinkIntegrations(session.organizationId, {
    expectsSalesforceIntegration,
    expectsGmailIntegration,
    expectsGoogleCalendarIntegration,
  });

  if (autoLinkIntegrations.error) {
    return NextResponse.json({ error: autoLinkIntegrations.error }, { status: 500 });
  }

  const googleCalendarDetectedTimezone =
    autoLinkIntegrations.googleIntegrationId && expectsGoogleCalendarIntegration
      ? (await resolveGoogleCalendarIntegrationTimezone({
          integrationId: autoLinkIntegrations.googleIntegrationId,
          organizationId: session.organizationId,
        })).data?.detectedTimezone ?? null
      : null;
  const normalizedSetupState = initialSetupState
    ? normalizeSetupState(initialSetupState, {
        hasReadyDocuments: false,
        googleCalendarDetectedTimezone,
      })
    : undefined;
  const resolvedSystemPrompt = normalizedSetupState
    ? buildRecommendedSystemPrompt(normalizedSetupState, {})
    : parsed.data.systemPrompt ?? "";

  if (parsed.data.integrationId && session.role !== "admin") {
    return NextResponse.json(
      { error: "Solo los administradores pueden crear agentes conectados a OpenAI" },
      { status: 403 }
    );
  }

  if (parsed.data.integrationId) {
    const integrationResult = await getOpenAIIntegrationById(
      parsed.data.integrationId,
      session.organizationId
    );

    if (integrationResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la integracion de OpenAI" },
        { status: 500 }
      );
    }

    if (!integrationResult.data) {
      return NextResponse.json({ error: "Integracion no encontrada" }, { status: 404 });
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
      const remoteAssistant = await createOpenAIAssistant(
        apiKeyResult.data,
        {
          name: parsed.data.name,
          description: parsed.data.description,
          instructions: resolvedSystemPrompt,
          model: parsed.data.llmModel,
          temperature: parsed.data.llmTemperature,
        },
        {
          organizationId: session.organizationId,
          integrationId: integrationResult.data.id,
          methodKey: "openai.assistants.create",
        }
      );

      const localAgentResult = await createAgent(
        {
          name: parsed.data.name,
          description: parsed.data.description,
          systemPrompt: resolvedSystemPrompt,
          llmModel: parsed.data.llmModel,
          llmTemperature: parsed.data.llmTemperature,
          status: "draft",
          setupState: normalizedSetupState,
        },
        session.organizationId,
        session.user.id
      );

      if (localAgentResult.error || !localAgentResult.data) {
        try {
          await deleteOpenAIAssistant(apiKeyResult.data, remoteAssistant.id, {
            organizationId: session.organizationId,
            integrationId: integrationResult.data.id,
            methodKey: "openai.assistants.delete",
          });
        } catch {
          // Best effort cleanup for remote assistant when local persistence fails.
        }

        return NextResponse.json(
          { error: localAgentResult.error ?? "No se pudo crear el agente conectado" },
          { status: 500 }
        );
      }

      const connectionResult = await createAgentConnection({
        organization_id: session.organizationId,
        agent_id: localAgentResult.data.id,
        integration_id: integrationResult.data.id,
        provider_agent_id: remoteAssistant.id,
        provider_type: "openai",
        sync_status: "connected",
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        remote_updated_at: remoteAssistant.remoteUpdatedAt,
        metadata: buildAssistantConnectionMetadata(remoteAssistant),
      });

      if (connectionResult.error) {
        try {
          await deleteOpenAIAssistant(apiKeyResult.data, remoteAssistant.id, {
            organizationId: session.organizationId,
            integrationId: integrationResult.data.id,
            methodKey: "openai.assistants.delete",
          });
        } catch {
          // Best effort cleanup for remote assistant when connection persistence fails.
        }

        await softDeleteAgent(localAgentResult.data.id, session.organizationId);

        return NextResponse.json(
          { error: "No se pudo vincular el agente con OpenAI" },
          { status: 500 }
        );
      }

      void insertProviderActionAudit({
        organizationId: session.organizationId,
        userId: session.user.id,
        integrationId: integrationResult.data.id,
        agentId: localAgentResult.data.id,
        provider: "openai",
        providerObjectType: "assistant",
        providerObjectId: remoteAssistant.id,
        action: "provider.openai.assistant.created",
        requestId: remoteAssistant.providerRequestId,
        status: "success",
      });

      void enqueueEvent({
        organizationId: session.organizationId,
        eventType: "agent.created",
        entityType: "agent",
        entityId: localAgentResult.data.id,
        idempotencyKey: `agent.created:${localAgentResult.data.id}`,
        payload: {
          agent_id: localAgentResult.data.id,
          name: localAgentResult.data.name,
          status: localAgentResult.data.status,
          llm_model: localAgentResult.data.llm_model,
          llm_temperature: localAgentResult.data.llm_temperature ?? null,
          created_at: localAgentResult.data.created_at ?? null,
          source: "openai",
          provider_agent_id: remoteAssistant.id,
        },
      });

      return NextResponse.json({ data: localAgentResult.data }, { status: 201 });
    } catch (error) {
      console.error("agents.create_connected.remote_error", {
        organizationId: session.organizationId,
        integrationId: parsed.data.integrationId,
        error: error instanceof Error ? error.message : "unknown",
      });

      return NextResponse.json(
        { error: getSafeProviderErrorMessage(error, "No se pudo crear el assistant en OpenAI") },
        { status: 502 }
      );
    }
  }

  const { data: agent, error } = await createAgent(
        {
          name: parsed.data.name,
          description: parsed.data.description,
          systemPrompt: resolvedSystemPrompt,
          llmModel: parsed.data.llmModel,
          llmTemperature: parsed.data.llmTemperature,
          status: "draft",
      setupState: normalizedSetupState,
    },
    session.organizationId,
    session.user.id
  );

  if (error || !agent) {
    return NextResponse.json(
      { error: error ?? "No se pudo crear el agente" },
      { status: 500 }
    );
  }

  let source: "local" | "local_salesforce_ready" = "local";

  if (normalizedSetupState) {
    const autoLinkResult = await autoLinkLocalCrmTools({
      agentId: agent.id,
      organizationId: session.organizationId,
      setupState: normalizedSetupState,
      salesforceIntegrationId: autoLinkIntegrations.salesforceIntegrationId,
      googleIntegrationId: autoLinkIntegrations.googleIntegrationId,
      googleGrantedScopes: autoLinkIntegrations.googleGrantedScopes,
    });

    if (autoLinkResult.error) {
      return NextResponse.json({ error: autoLinkResult.error }, { status: 500 });
    }

    source = autoLinkResult.source;
  }

  void enqueueEvent({
    organizationId: session.organizationId,
    eventType: "agent.created",
    entityType: "agent",
    entityId: agent.id,
    idempotencyKey: `agent.created:${agent.id}`,
    payload: {
      agent_id: agent.id,
      name: agent.name,
      status: agent.status,
      llm_model: agent.llm_model,
      llm_temperature: agent.llm_temperature ?? null,
      created_at: agent.created_at ?? null,
      source,
    },
  });

  return NextResponse.json({ data: agent }, { status: 201 });
}
