import "server-only";

import { listAgentTools } from "@/lib/db/agent-tools";
import {
  getHubSpotIntegrationConfig,
  getHubSpotRefreshState,
  getPrimaryHubSpotIntegration,
  rotateHubSpotTokens,
} from "@/lib/db/hubspot-integrations";
import { getIntegrationById, markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { archiveHubSpotObject, createHubSpotEngagement, createOrUpdateHubSpotObject, findHubSpotContactByEmail, lookupHubSpotDeals, lookupHubSpotRecords, type HubSpotContactMatch, type HubSpotLookupResult, type HubSpotMutationResult } from "@/lib/integrations/hubspot-crm";
import {
  auditHubSpotAction,
  buildHubSpotConfirmationSummary,
  formatHubSpotToolResultForPrompt,
  getHubSpotAuditMetadata,
  getHubSpotExecutionFallback,
} from "@/lib/integrations/hubspot-agent-runtime-utils";
import { selectPreferredHubSpotAgentTool } from "@/lib/integrations/hubspot-agent-tool-selection";
import { refreshHubSpotAccessToken } from "@/lib/integrations/hubspot";
import {
  isHubSpotActionAllowed,
  parseHubSpotAgentToolConfig,
  type ExecuteHubSpotCrmToolInput,
} from "@/lib/integrations/hubspot-tools";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { coordinateIntegrationRefresh } from "@/lib/integrations/refresh-coordination";
import { isProviderRequestError, ProviderRequestError } from "@/lib/integrations/provider-errors";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;
type Credentials = { accessToken: string; hubId: string | null };

class HubSpotDuplicateContactError extends Error {
  existingContact: HubSpotContactMatch;

  constructor(existingContact: HubSpotContactMatch) {
    super(existingContact.id);
    this.name = "HubSpotDuplicateContactError";
    this.existingContact = existingContact;
  }
}

function buildHubSpotDuplicateContactMessage(existingContact: HubSpotContactMatch): string {
  return [
    `Ya existe un contacto en HubSpot con ese email: ${existingContact.label} (${existingContact.email ?? "sin email"}).`,
    `Contacto existente: ${existingContact.url}.`,
    "Si quieres reutilizarlo, pide actualizar ese contacto existente.",
    "Si de todos modos quieres crear un duplicado, vuelve a pedirlo indicando explicitamente que quieres crear un duplicado.",
  ].join(" ");
}

export type HubSpotAgentToolRuntime = {
  tool: AgentTool;
  config: NonNullable<ReturnType<typeof parseHubSpotAgentToolConfig>>;
  integration: Integration;
};

export type HubSpotToolExecutionResult = {
  action: ExecuteHubSpotCrmToolInput["action"];
  isWrite: boolean;
  requestId: string | null;
  providerObjectId: string | null;
  providerObjectType: string;
  data: HubSpotLookupResult | HubSpotMutationResult;
};

export type HubSpotCompensationAction =
  | "archive_created_contact"
  | "archive_created_task";

function isAuthFailure(error: unknown): error is ProviderRequestError {
  return isProviderRequestError(error) && (error.statusCode === 401 || error.statusCode === 403);
}

async function runHubSpotAction(
  input: ExecuteHubSpotCrmToolInput,
  credentials: Credentials,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<HubSpotToolExecutionResult> {
  const context = {
    organizationId,
    integrationId,
    methodKey: "hubspot.oauth_public_api",
    workflowRunId: workflow?.workflowRunId,
    workflowStepId: workflow?.workflowStepId,
  };
  const audit = getHubSpotAuditMetadata(input.action);

  if (input.action === "lookup_records") {
    const data = await lookupHubSpotRecords(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "lookup_deals") {
    const data = await lookupHubSpotDeals(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_contact") {
    const email = input.properties.email?.trim().toLowerCase();

    if (email && !input.allowDuplicateByEmail) {
      const existingContact = await findHubSpotContactByEmail(credentials, { email }, context);

      if (existingContact) {
        throw new HubSpotDuplicateContactError(existingContact);
      }
    }

    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "contacts", properties: input.properties, dealIds: input.dealIds, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "update_contact") {
    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "contacts", recordId: input.contactId, properties: input.properties, dealIds: input.dealIds, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_company") {
    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "companies", properties: input.properties, dealIds: input.dealIds, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "update_company") {
    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "companies", recordId: input.companyId, properties: input.properties, dealIds: input.dealIds, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_deal") {
    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "deals", properties: input.properties, contactIds: input.contactIds, companyIds: input.companyIds, primaryCompanyId: input.primaryCompanyId, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "update_deal") {
    const data = await createOrUpdateHubSpotObject({ credentials, objectType: "deals", recordId: input.dealId, properties: input.properties, contactIds: input.contactIds, companyIds: input.companyIds, primaryCompanyId: input.primaryCompanyId, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_task") {
    const data = await createHubSpotEngagement({ credentials, objectType: "tasks", properties: input.properties, contactIds: input.contactIds, companyIds: input.companyIds, dealIds: input.dealIds, context });
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  const data = await createHubSpotEngagement({ credentials, objectType: "meetings", properties: input.properties, contactIds: input.contactIds, companyIds: input.companyIds, dealIds: input.dealIds, context });
  return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
}

async function runHubSpotCompensation(
  input: {
    compensationAction: HubSpotCompensationAction;
    providerObjectId: string;
  },
  credentials: Credentials,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<HubSpotMutationResult> {
  const context = {
    organizationId,
    integrationId,
    methodKey: "hubspot.oauth_public_api",
    workflowRunId: workflow?.workflowRunId,
    workflowStepId: workflow?.workflowStepId,
  };

  if (input.compensationAction === "archive_created_contact") {
    return archiveHubSpotObject({
      credentials,
      objectType: "contacts",
      recordId: input.providerObjectId,
      context,
    });
  }

  return archiveHubSpotObject({
    credentials,
    objectType: "tasks",
    recordId: input.providerObjectId,
    context,
  });
}

async function refreshHubSpotCredentials(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  refreshToken: string;
}): Promise<DbResult<Credentials>> {
  try {
    const coordination = await coordinateIntegrationRefresh({
      provider: "hubspot",
      integrationId: input.integrationId,
      loadState: async () => {
        const stateResult = await getHubSpotRefreshState(input.integrationId, input.organizationId);
        return stateResult.data ?? { tokenGeneration: 0, authStatus: null };
      },
      refresh: async () => {
        const refreshResult = await refreshHubSpotAccessToken(input.refreshToken);
        if (!refreshResult.refreshToken) {
          throw new Error("HubSpot no devolvio un refresh token rotado");
        }

        const rotatedResult = await rotateHubSpotTokens({
          integrationId: input.integrationId,
          organizationId: input.organizationId,
          userId: input.userId,
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken,
          grantedScopes: refreshResult.grantedScopes,
          accessTokenExpiresAt: refreshResult.accessTokenExpiresAt,
          hubId: refreshResult.hubId,
          tokenType: refreshResult.tokenType,
        });

        if (rotatedResult.error) {
          throw new Error(rotatedResult.error);
        }
      },
    });

    if (coordination.kind === "timeout") {
      return {
        data: null,
        error: "HubSpot esta refrescando credenciales en otro request. Reintenta en unos segundos.",
      };
    }

    const configResult = await getHubSpotIntegrationConfig(
      input.integrationId,
      input.organizationId
    );

    if (configResult.error || !configResult.data) {
      return { data: null, error: configResult.error ?? "No se pudo recargar HubSpot" };
    }

    if (coordination.kind === "follower" && configResult.data.authStatus === "reauth_required") {
      return { data: null, error: "La integracion necesita reautenticacion antes de volver a operar." };
    }

    return {
      data: {
        accessToken: configResult.data.accessToken,
        hubId: configResult.data.hubId,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "No se pudo refrescar la sesion de HubSpot",
    };
  }
}

export async function getHubSpotAgentToolRuntime(agentId: string, organizationId: string): Promise<DbResult<HubSpotAgentToolRuntime>> {
  const [toolsResult, primaryIntegrationResult] = await Promise.all([
    listAgentTools(agentId, organizationId),
    getPrimaryHubSpotIntegration(organizationId),
  ]);

  if (toolsResult.error) {
    return { data: null, error: toolsResult.error };
  }

  if (primaryIntegrationResult.error) {
    return { data: null, error: primaryIntegrationResult.error };
  }

  const allTools = toolsResult.data ?? [];
  const primaryIntegration = primaryIntegrationResult.data;
  const tool = selectPreferredHubSpotAgentTool(allTools, primaryIntegration?.id ?? null);

  if (!tool || !tool.integration_id) {
    return { data: null, error: "El agente no tiene la tool CRM de HubSpot habilitada" };
  }

  const config = parseHubSpotAgentToolConfig(tool.config);
  if (!config) {
    return { data: null, error: "La configuracion de HubSpot es invalida" };
  }

  if (tool.is_enabled !== true) {
    return { data: null, error: "La tool CRM de HubSpot existe, pero esta deshabilitada para este agente" };
  }

  if (primaryIntegration && tool.integration_id !== primaryIntegration.id) {
    return { data: null, error: "La tool CRM de HubSpot quedo desalineada con la integracion activa. Vuelve a guardarla desde la configuracion del agente." };
  }

  const integrationResult = await getIntegrationById(tool.integration_id, organizationId);
  if (integrationResult.error || !integrationResult.data) {
    return { data: null, error: integrationResult.error ?? "No se pudo cargar la integracion de HubSpot" };
  }

  return { data: { tool, config, integration: integrationResult.data }, error: null };
}

export async function executeHubSpotToolAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  actionInput: ExecuteHubSpotCrmToolInput;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<HubSpotToolExecutionResult>> {
  const configResult = await getHubSpotIntegrationConfig(input.integrationId, input.organizationId);
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, configResult.error);
    }

    return { data: null, error: "La integracion necesita reautenticacion antes de volver a operar." };
  }

  let credentials: Credentials = {
    accessToken: configResult.data.accessToken,
    hubId: configResult.data.hubId,
  };

  try {
    const data = await runHubSpotAction(
      input.actionInput,
      credentials,
      input.organizationId,
      input.integrationId,
      input.workflow
    );
    await auditHubSpotAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, requestId: data.requestId, providerObjectId: data.providerObjectId, status: "success" });
    return { data, error: null };
  } catch (error) {
    if (error instanceof HubSpotDuplicateContactError) {
      return { data: null, error: buildHubSpotDuplicateContactMessage(error.existingContact) };
    }

    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshHubSpotCredentials({ organizationId: input.organizationId, userId: input.userId, integrationId: input.integrationId, refreshToken: configResult.data.refreshToken });

      if (!refreshResult.error && refreshResult.data) {
        credentials = refreshResult.data;

        try {
          const retried = await runHubSpotAction(
            input.actionInput,
            credentials,
            input.organizationId,
            input.integrationId,
            input.workflow
          );
          await auditHubSpotAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, requestId: retried.requestId, providerObjectId: retried.providerObjectId, status: "success" });
          return { data: retried, error: null };
        } catch (retryError) {
          if (retryError instanceof HubSpotDuplicateContactError) {
            return { data: null, error: buildHubSpotDuplicateContactMessage(retryError.existingContact) };
          }

          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(input.integrationId, input.organizationId, retryError.message);
          }

          await auditHubSpotAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, providerObjectId: null, status: "error" });
          return { data: null, error: getSafeProviderErrorMessage(retryError, getHubSpotExecutionFallback(input.actionInput.action)) };
        }
      }

      if (refreshResult.error?.includes("reautenticacion") || refreshResult.error?.includes("HubSpot no devolvio")) {
        await markIntegrationReauthRequired(input.integrationId, input.organizationId, refreshResult.error);
      }

      await auditHubSpotAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, providerObjectId: null, status: "error" });
      return { data: null, error: refreshResult.error ?? getHubSpotExecutionFallback(input.actionInput.action) };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, error.message);
    }

    await auditHubSpotAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, providerObjectId: null, status: "error" });
    return { data: null, error: getSafeProviderErrorMessage(error, getHubSpotExecutionFallback(input.actionInput.action)) };
  }
}

export async function executeHubSpotCompensationAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  compensationAction: HubSpotCompensationAction;
  providerObjectId: string;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<HubSpotMutationResult>> {
  const configResult = await getHubSpotIntegrationConfig(input.integrationId, input.organizationId);
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, configResult.error);
    }

    return { data: null, error: "La integracion necesita reautenticacion antes de volver a operar." };
  }

  let credentials: Credentials = {
    accessToken: configResult.data.accessToken,
    hubId: configResult.data.hubId,
  };

  try {
    const data = await runHubSpotCompensation(
      {
        compensationAction: input.compensationAction,
        providerObjectId: input.providerObjectId,
      },
      credentials,
      input.organizationId,
      input.integrationId,
      input.workflow
    );
    return { data, error: null };
  } catch (error) {
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshHubSpotCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: input.integrationId,
        refreshToken: configResult.data.refreshToken,
      });

      if (!refreshResult.error && refreshResult.data) {
        credentials = refreshResult.data;

        try {
          const retried = await runHubSpotCompensation(
            {
              compensationAction: input.compensationAction,
              providerObjectId: input.providerObjectId,
            },
            credentials,
            input.organizationId,
            input.integrationId,
            input.workflow
          );
          return { data: retried, error: null };
        } catch (retryError) {
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(input.integrationId, input.organizationId, retryError.message);
          }

          return { data: null, error: getSafeProviderErrorMessage(retryError, "No se pudo compensar la accion previa en HubSpot.") };
        }
      }

      if (refreshResult.error?.includes("reautenticacion") || refreshResult.error?.includes("HubSpot no devolvio")) {
        await markIntegrationReauthRequired(input.integrationId, input.organizationId, refreshResult.error);
      }

      return { data: null, error: refreshResult.error ?? "No se pudo compensar la accion previa en HubSpot." };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, error.message);
    }

    return { data: null, error: getSafeProviderErrorMessage(error, "No se pudo compensar la accion previa en HubSpot.") };
  }
}

export function assertHubSpotRuntimeUsable(runtime: HubSpotAgentToolRuntime): DbResult<HubSpotAgentToolRuntime> {
  const access = assertUsableIntegration(runtime.integration);
  return access.ok ? { data: runtime, error: null } : { data: null, error: access.message };
}

export function assertHubSpotActionEnabled(runtime: HubSpotAgentToolRuntime, action: ExecuteHubSpotCrmToolInput["action"]): DbResult<HubSpotAgentToolRuntime> {
  if (!isHubSpotActionAllowed(runtime.config, action)) {
    return { data: null, error: "La accion pedida no esta habilitada para este agente" };
  }

  return { data: runtime, error: null };
}

export { buildHubSpotConfirmationSummary, formatHubSpotToolResultForPrompt };
