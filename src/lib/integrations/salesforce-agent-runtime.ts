import "server-only";

import { listAgentTools } from "@/lib/db/agent-tools";
import { getIntegrationById, markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { getPrimarySalesforceIntegration, getSalesforceIntegrationConfig, rotateSalesforceTokens } from "@/lib/db/salesforce-integrations";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { isProviderRequestError, ProviderRequestError } from "@/lib/integrations/provider-errors";
import {
  auditSalesforceAction,
  buildSalesforceConfirmationSummary,
  formatSalesforceToolResultForPrompt,
  getSalesforceAuditMetadata,
  getSalesforceExecutionFallback,
} from "@/lib/integrations/salesforce-agent-runtime-utils";
import {
  createSalesforceCase,
  createSalesforceContact,
  createSalesforceLead,
  createSalesforceTask,
  deleteSalesforceObject,
  listSalesforceLeadsByStatus,
  listSalesforceLeadsRecent,
  lookupSalesforceAccounts,
  lookupSalesforceCases,
  lookupSalesforceLeadOrContact,
  lookupSalesforceOpportunities,
  summarizeSalesforcePipeline,
  updateSalesforceCase,
  updateSalesforceLead,
  updateSalesforceOpportunity,
  type SalesforceLeadListResult,
  type SalesforceLookupResult,
  type SalesforceMutationResult,
  type SalesforcePipelineSummaryResult,
} from "@/lib/integrations/salesforce-crm";
import { refreshSalesforceAccessToken } from "@/lib/integrations/salesforce";
import { selectPreferredSalesforceAgentTool } from "@/lib/integrations/salesforce-agent-tool-selection";
import {
  type ExecuteSalesforceCrmToolInput,
  isSalesforceActionAllowed,
  parseSalesforceAgentToolConfig,
} from "@/lib/integrations/salesforce-tools";
import type { Integration } from "@/types/app";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;
type Credentials = { accessToken: string; instanceUrl: string };
type SalesforceToolData =
  | SalesforceLookupResult
  | SalesforceLeadListResult
  | SalesforcePipelineSummaryResult
  | SalesforceMutationResult;

export type SalesforceAgentToolRuntime = {
  tool: AgentTool;
  config: NonNullable<ReturnType<typeof parseSalesforceAgentToolConfig>>;
  integration: Integration;
};

export type SalesforceToolExecutionResult = {
  action: ExecuteSalesforceCrmToolInput["action"];
  isWrite: boolean;
  requestId: string | null;
  providerObjectId: string | null;
  providerObjectType: string;
  data: SalesforceToolData;
};

export type SalesforceCompensationAction =
  | "delete_created_contact"
  | "delete_created_task";

function isAuthFailure(error: unknown): error is ProviderRequestError {
  return isProviderRequestError(error) && (error.statusCode === 401 || error.statusCode === 403);
}

function isMissingSecretError(message: string): boolean {
  return message.includes("token valido") || message.includes("instance_url");
}

async function runSalesforceAction(
  input: ExecuteSalesforceCrmToolInput,
  credentials: Credentials,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<SalesforceToolExecutionResult> {
  const context = {
    organizationId,
    integrationId,
    methodKey: "salesforce.api_requests",
    workflowRunId: workflow?.workflowRunId,
    workflowStepId: workflow?.workflowStepId,
  };
  const audit = getSalesforceAuditMetadata(input.action);

  if (input.action === "lookup_records") {
    const data = await lookupSalesforceLeadOrContact(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "list_leads_recent") {
    const data = await listSalesforceLeadsRecent(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "list_leads_by_status") {
    const data = await listSalesforceLeadsByStatus(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "lookup_accounts") {
    const data = await lookupSalesforceAccounts(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "lookup_opportunities") {
    const data = await lookupSalesforceOpportunities(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "lookup_cases") {
    const data = await lookupSalesforceCases(credentials, input, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "summarize_pipeline") {
    const data = await summarizeSalesforcePipeline(credentials, context);
    return { action: input.action, isWrite: false, requestId: data.requestId, providerObjectId: null, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_task") {
    const data = await createSalesforceTask(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_lead") {
    const data = await createSalesforceLead(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "update_lead") {
    const data = await updateSalesforceLead(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_contact") {
    const data = await createSalesforceContact(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "create_case") {
    const data = await createSalesforceCase(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  if (input.action === "update_case") {
    const data = await updateSalesforceCase(credentials, input, context);
    return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
  }

  const data = await updateSalesforceOpportunity(credentials, input, context);
  return { action: input.action, isWrite: true, requestId: data.requestId, providerObjectId: data.id, providerObjectType: audit.providerObjectType, data };
}

async function runSalesforceCompensation(
  input: {
    compensationAction: SalesforceCompensationAction;
    providerObjectId: string;
  },
  credentials: Credentials,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<SalesforceMutationResult> {
  const context = {
    organizationId,
    integrationId,
    methodKey: "salesforce.api_requests",
    workflowRunId: workflow?.workflowRunId,
    workflowStepId: workflow?.workflowStepId,
  };

  if (input.compensationAction === "delete_created_contact") {
    return deleteSalesforceObject(
      credentials,
      {
        objectType: "Contact",
        recordId: input.providerObjectId,
      },
      context
    );
  }

  return deleteSalesforceObject(
    credentials,
    {
      objectType: "Task",
      recordId: input.providerObjectId,
    },
    context
  );
}

async function refreshSalesforceCredentials(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  refreshToken: string;
  currentInstanceUrl: string;
  currentScopes: string[];
}): Promise<DbResult<Credentials>> {
  try {
    const refreshResult = await refreshSalesforceAccessToken(input.refreshToken);
    const rotatedResult = await rotateSalesforceTokens({
      integrationId: input.integrationId,
      organizationId: input.organizationId,
      userId: input.userId,
      accessToken: refreshResult.accessToken,
      ...(refreshResult.refreshToken !== null ? { refreshToken: refreshResult.refreshToken } : {}),
      instanceUrl: refreshResult.instanceUrl ?? input.currentInstanceUrl,
      grantedScopes: refreshResult.grantedScopes.length > 0 ? refreshResult.grantedScopes : input.currentScopes,
      identityUrl: refreshResult.identityUrl,
      tokenType: refreshResult.tokenType,
      issuedAt: refreshResult.issuedAt,
    });

    return rotatedResult.error
      ? { data: null, error: rotatedResult.error }
      : { data: { accessToken: refreshResult.accessToken, instanceUrl: refreshResult.instanceUrl ?? input.currentInstanceUrl }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "No se pudo refrescar la sesion de Salesforce" };
  }
}

export async function getSalesforceAgentToolRuntime(agentId: string, organizationId: string): Promise<DbResult<SalesforceAgentToolRuntime>> {
  const [toolsResult, primaryIntegrationResult] = await Promise.all([
    listAgentTools(agentId, organizationId),
    getPrimarySalesforceIntegration(organizationId),
  ]);

  if (toolsResult.error) {
    console.error("salesforce.runtime.tools_query_error", { agentId, organizationId, error: toolsResult.error });
    return { data: null, error: toolsResult.error };
  }

  if (primaryIntegrationResult.error) {
    console.error("salesforce.runtime.integration_query_error", { agentId, organizationId, error: primaryIntegrationResult.error });
    return { data: null, error: primaryIntegrationResult.error };
  }

  const allTools = toolsResult.data ?? [];
  const primaryIntegration = primaryIntegrationResult.data;
  const tool = selectPreferredSalesforceAgentTool(
    allTools,
    primaryIntegration?.id ?? null
  );

  if (!tool || !tool.integration_id) {
    console.warn("salesforce.runtime.no_tool_found", {
      agentId,
      organizationId,
      totalTools: allTools.length,
      toolTypes: allTools.map((t) => t.tool_type),
      hasPrimaryIntegration: Boolean(primaryIntegration),
      primaryIntegrationId: primaryIntegration?.id ?? null,
      selectedToolId: tool?.id ?? null,
      selectedToolIntegrationId: tool?.integration_id ?? null,
    });
    return { data: null, error: "El agente no tiene la tool CRM de Salesforce habilitada" };
  }

  const config = parseSalesforceAgentToolConfig(tool.config);
  if (!config) {
    console.warn("salesforce.runtime.invalid_config", {
      agentId,
      organizationId,
      toolId: tool.id,
      rawConfig: JSON.stringify(tool.config),
    });
    return { data: null, error: "La configuracion de Salesforce es invalida" };
  }

  if (tool.is_enabled !== true) {
    console.warn("salesforce.runtime.tool_disabled", { agentId, organizationId, toolId: tool.id, isEnabled: tool.is_enabled });
    return { data: null, error: "La tool CRM de Salesforce existe, pero esta deshabilitada para este agente" };
  }

  if (primaryIntegration && tool.integration_id !== primaryIntegration.id) {
    console.warn("salesforce.runtime.integration_mismatch", {
      agentId,
      organizationId,
      toolIntegrationId: tool.integration_id,
      primaryIntegrationId: primaryIntegration.id,
    });
    return { data: null, error: "La tool CRM de Salesforce quedo desalineada con la integracion activa. Vuelve a guardarla desde la configuracion del agente." };
  }

  const integrationResult = await getIntegrationById(tool.integration_id, organizationId);
  if (integrationResult.error || !integrationResult.data) {
    console.error("salesforce.runtime.integration_load_error", { agentId, organizationId, integrationId: tool.integration_id, error: integrationResult.error });
    return { data: null, error: integrationResult.error ?? "No se pudo cargar la integracion de Salesforce" };
  }

  return { data: { tool, config, integration: integrationResult.data }, error: null };
}

export async function executeSalesforceToolAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  actionInput: ExecuteSalesforceCrmToolInput;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<SalesforceToolExecutionResult>> {
  const configResult = await getSalesforceIntegrationConfig(input.integrationId, input.organizationId);
  if (configResult.error || !configResult.data) {
    if (configResult.error && isMissingSecretError(configResult.error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, configResult.error);
    }

    return { data: null, error: "La integracion necesita reautenticacion antes de volver a operar." };
  }

  let credentials: Credentials = { accessToken: configResult.data.accessToken, instanceUrl: configResult.data.instanceUrl };

  try {
    const data = await runSalesforceAction(
      input.actionInput,
      credentials,
      input.organizationId,
      input.integrationId,
      input.workflow
    );
    await auditSalesforceAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, requestId: data.requestId, providerObjectId: data.providerObjectId, status: "success" });
    return { data, error: null };
  } catch (error) {
    console.error("salesforce.execution_error", {
      agentId: input.agentId,
      organizationId: input.organizationId,
      action: input.actionInput.action,
      error: error instanceof Error ? error.message : String(error),
      statusCode: isProviderRequestError(error) ? error.statusCode : undefined,
    });
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshSalesforceCredentials({ organizationId: input.organizationId, userId: input.userId, integrationId: input.integrationId, refreshToken: configResult.data.refreshToken, currentInstanceUrl: configResult.data.instanceUrl, currentScopes: configResult.data.grantedScopes });

      if (!refreshResult.error && refreshResult.data) {
        credentials = refreshResult.data;

        try {
          const retried = await runSalesforceAction(
            input.actionInput,
            credentials,
            input.organizationId,
            input.integrationId,
            input.workflow
          );
          await auditSalesforceAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, requestId: retried.requestId, providerObjectId: retried.providerObjectId, status: "success" });
          return { data: retried, error: null };
        } catch (retryError) {
          console.error("salesforce.execution_error_after_refresh", {
            agentId: input.agentId,
            organizationId: input.organizationId,
            action: input.actionInput.action,
            error: retryError instanceof Error ? retryError.message : String(retryError),
            statusCode: isProviderRequestError(retryError) ? retryError.statusCode : undefined,
          });
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(input.integrationId, input.organizationId, retryError.message);
          }

          await auditSalesforceAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, providerObjectId: null, status: "error" });
          return { data: null, error: getSafeProviderErrorMessage(retryError, getSalesforceExecutionFallback(input.actionInput.action)) };
        }
      }

      await markIntegrationReauthRequired(input.integrationId, input.organizationId, refreshResult.error ?? error.message);
    } else if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, error.message);
    }

    await auditSalesforceAction({ organizationId: input.organizationId, userId: input.userId, agentId: input.agentId, integrationId: input.integrationId, action: input.actionInput.action, providerObjectId: null, status: "error" });
    return { data: null, error: getSafeProviderErrorMessage(error, getSalesforceExecutionFallback(input.actionInput.action)) };
  }
}

export async function executeSalesforceCompensationAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  compensationAction: SalesforceCompensationAction;
  providerObjectId: string;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<SalesforceMutationResult>> {
  const configResult = await getSalesforceIntegrationConfig(input.integrationId, input.organizationId);
  if (configResult.error || !configResult.data) {
    if (configResult.error && isMissingSecretError(configResult.error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, configResult.error);
    }

    return { data: null, error: "La integracion necesita reautenticacion antes de volver a operar." };
  }

  let credentials: Credentials = {
    accessToken: configResult.data.accessToken,
    instanceUrl: configResult.data.instanceUrl,
  };

  try {
    const data = await runSalesforceCompensation(
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
      const refreshResult = await refreshSalesforceCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: input.integrationId,
        refreshToken: configResult.data.refreshToken,
        currentInstanceUrl: configResult.data.instanceUrl,
        currentScopes: configResult.data.grantedScopes,
      });

      if (!refreshResult.error && refreshResult.data) {
        credentials = refreshResult.data;

        try {
          const retried = await runSalesforceCompensation(
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

          return { data: null, error: getSafeProviderErrorMessage(retryError, "No se pudo compensar la accion previa en Salesforce.") };
        }
      }

      await markIntegrationReauthRequired(input.integrationId, input.organizationId, refreshResult.error ?? error.message);
    } else if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(input.integrationId, input.organizationId, error.message);
    }

    return { data: null, error: getSafeProviderErrorMessage(error, "No se pudo compensar la accion previa en Salesforce.") };
  }
}

export function assertSalesforceRuntimeUsable(runtime: SalesforceAgentToolRuntime): DbResult<SalesforceAgentToolRuntime> {
  const access = assertUsableIntegration(runtime.integration);
  return access.ok ? { data: runtime, error: null } : { data: null, error: access.message };
}

export function assertSalesforceActionEnabled(runtime: SalesforceAgentToolRuntime, action: ExecuteSalesforceCrmToolInput["action"]): DbResult<SalesforceAgentToolRuntime> {
  if (!isSalesforceActionAllowed(runtime.config, action)) {
    return { data: null, error: "La accion pedida no esta habilitada para este agente" };
  }

  return { data: runtime, error: null };
}

export { buildSalesforceConfirmationSummary, formatSalesforceToolResultForPrompt };
