import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { agentModelSchema } from "@/lib/agents/agent-config";
import { isSalesforceTemplateId } from "@/lib/agents/agent-templates";
import { agentSetupStateSchema } from "@/lib/agents/agent-setup";
import { normalizeSetupState } from "@/lib/agents/agent-setup-state";
import { createAgent, softDeleteAgent, updateAgentSetupState } from "@/lib/db/agents";
import { createAgentConnection } from "@/lib/db/agent-connections";
import { upsertAgentTool } from "@/lib/db/agent-tools";
import { enqueueEvent } from "@/lib/db/event-queue";
import {
  getOpenAIIntegrationApiKey,
  getOpenAIIntegrationById,
} from "@/lib/db/integrations";
import { getPrimarySalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { getDefaultSalesforceAgentToolConfig } from "@/lib/integrations/salesforce-tools";
import {
  buildAssistantConnectionMetadata,
} from "@/lib/llm/openai-assistant-mapper";
import {
  createOpenAIAssistant,
  deleteOpenAIAssistant,
} from "@/lib/llm/openai-assistants";
import type { Role } from "@/types/app";
import type { Json } from "@/types/database";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const ROLES_WITH_WRITE_ACCESS: readonly Role[] = ["admin", "editor"];

const createAgentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres"),
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
  integrationId: z.string().uuid("integrationId debe ser un UUID valido").optional(),
  setupState: agentSetupStateSchema.optional(),
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

  if (!ROLES_WITH_WRITE_ACCESS.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const parsed = await parseJsonRequestBody(request, createAgentSchema);
  if (parsed.errorResponse) {
    return parsed.errorResponse;
  }

  const normalizedSetupState = parsed.data.setupState
    ? normalizeSetupState(parsed.data.setupState, { hasReadyDocuments: false })
    : undefined;
  const expectsSalesforceIntegration = normalizedSetupState
    ? isSalesforceTemplateId(normalizedSetupState.template_id)
    : false;

  let autoLinkSalesforceIntegrationId: string | null = null;
  if (expectsSalesforceIntegration) {
    const salesforceIntegrationResult = await getPrimarySalesforceIntegration(session.organizationId);

    if (salesforceIntegrationResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar la integracion de Salesforce" },
        { status: 500 }
      );
    }

    if (salesforceIntegrationResult.data) {
      const salesforceAccess = assertUsableIntegration(salesforceIntegrationResult.data);
      if (salesforceAccess.ok) {
        autoLinkSalesforceIntegrationId = salesforceIntegrationResult.data.id;
      }
    }
  }

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
      const remoteAssistant = await createOpenAIAssistant(apiKeyResult.data, {
        name: parsed.data.name,
        description: parsed.data.description,
        instructions: parsed.data.systemPrompt,
        model: parsed.data.llmModel,
        temperature: parsed.data.llmTemperature,
      }, {
        organizationId: session.organizationId,
        integrationId: integrationResult.data.id,
        methodKey: "openai.assistants.create",
      });

      const localAgentResult = await createAgent(
        {
          name: parsed.data.name,
          description: parsed.data.description,
          systemPrompt: parsed.data.systemPrompt,
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
      systemPrompt: parsed.data.systemPrompt,
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

  let createdAgent = agent;

  if (normalizedSetupState && autoLinkSalesforceIntegrationId) {
    const toolResult = await upsertAgentTool({
      agentId: agent.id,
      organizationId: session.organizationId,
      integrationId: autoLinkSalesforceIntegrationId,
      toolType: "crm",
      isEnabled: true,
      config: getDefaultSalesforceAgentToolConfig() as unknown as Json,
    });

    if (toolResult.error || !toolResult.data) {
      return NextResponse.json(
        { error: toolResult.error ?? "No se pudo vincular Salesforce al agente" },
        { status: 500 }
      );
    }

    const resolvedSetupState = normalizeSetupState(normalizedSetupState, {
      hasReadyDocuments: false,
      providerIntegrations: {
        salesforce: {
          isUsable: true,
          hasEnabledTool: true,
        },
      },
    });
    const setupUpdateResult = await updateAgentSetupState(
      agent.id,
      session.organizationId,
      resolvedSetupState
    );

    if (setupUpdateResult.error || !setupUpdateResult.data) {
      return NextResponse.json(
        { error: setupUpdateResult.error ?? "No se pudo guardar el setup de Salesforce del agente" },
        { status: 500 }
      );
    }

    createdAgent = setupUpdateResult.data;
  }

  void enqueueEvent({
    organizationId: session.organizationId,
    eventType: "agent.created",
    entityType: "agent",
    entityId: createdAgent.id,
    idempotencyKey: `agent.created:${createdAgent.id}`,
    payload: {
      agent_id: createdAgent.id,
      name: createdAgent.name,
      status: createdAgent.status,
      llm_model: createdAgent.llm_model,
      llm_temperature: createdAgent.llm_temperature ?? null,
      created_at: createdAgent.created_at ?? null,
      source: autoLinkSalesforceIntegrationId ? "local_salesforce_ready" : "local",
    },
  });

  return NextResponse.json({ data: createdAgent }, { status: 201 });
}










