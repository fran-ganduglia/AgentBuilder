import "server-only";

import { getJsonValue, incrementRateLimit, setJsonValue } from "@/lib/redis";
import {
  assertHubSpotActionEnabled,
  assertHubSpotRuntimeUsable,
  getHubSpotAgentToolRuntime,
} from "@/lib/integrations/hubspot-agent-runtime";
import { getHubSpotIntegrationConfig } from "@/lib/db/hubspot-integrations";
import {
  lookupHubSpotDeals,
  lookupHubSpotRecords,
} from "@/lib/integrations/hubspot-crm";
import { requestHubSpot } from "@/lib/integrations/hubspot";
import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import { getSalesforceIntegrationConfig } from "@/lib/db/salesforce-integrations";
import {
  lookupSalesforceAccounts,
  lookupSalesforceCases,
  lookupSalesforceLeadOrContact,
  lookupSalesforceOpportunities,
} from "@/lib/integrations/salesforce-crm";
import { getChatFormDefinition } from "@/lib/chat/inline-forms";

const CHAT_FORM_SEARCH_RATE_LIMIT_WINDOW_SECONDS = 60;
const CHAT_FORM_SEARCH_RATE_LIMIT_MAX = 20;
const CHAT_FORM_OPTIONS_CACHE_TTL_SECONDS = 300;

type SearchResultItem = {
  id: string;
  label: string;
  subtitle: string | null;
};

type HubSpotPipelineResponse = {
  results?: Array<{ id?: string; label?: string; stages?: Array<{ id?: string; label?: string }> }>;
  stages?: Array<{ id?: string; label?: string }>;
};

function buildSearchRateLimitKey(organizationId: string, conversationId: string): string {
  return `rate_limit:chat_form_search:${organizationId}:${conversationId}`;
}

export async function assertChatFormSearchAllowed(input: {
  organizationId: string;
  conversationId: string;
}): Promise<boolean> {
  const count = await incrementRateLimit(
    buildSearchRateLimitKey(input.organizationId, input.conversationId),
    CHAT_FORM_SEARCH_RATE_LIMIT_WINDOW_SECONDS
  );

  return count <= CHAT_FORM_SEARCH_RATE_LIMIT_MAX;
}

export async function searchChatFormRelations(input: {
  agentId: string;
  organizationId: string;
  formId: string;
  fieldKey: string;
  query: string;
  limit: number;
}): Promise<SearchResultItem[]> {
  const definition = getChatFormDefinition(input.formId as never);
  if (!definition) {
    return [];
  }

  if (definition.provider === "hubspot") {
    const runtimeResult = await getHubSpotAgentToolRuntime(
      input.agentId,
      input.organizationId
    );
    if (runtimeResult.error || !runtimeResult.data) {
      return [];
    }

    const usableRuntime = assertHubSpotRuntimeUsable(runtimeResult.data);
    if (usableRuntime.error || !usableRuntime.data) {
      return [];
    }

    const lookupAction =
      input.fieldKey === "dealIds" ? "lookup_deals" : "lookup_records";
    if (!assertHubSpotActionEnabled(usableRuntime.data, lookupAction).data) {
      return [];
    }

    const config = await getHubSpotIntegrationConfig(
      usableRuntime.data.integration.id,
      input.organizationId
    );
    if (config.error || !config.data) {
      return [];
    }

    const result =
      input.fieldKey === "dealIds"
        ? await lookupHubSpotDeals(
            { accessToken: config.data.accessToken, hubId: config.data.hubId },
            { query: input.query, limit: input.limit },
            {
              organizationId: input.organizationId,
              integrationId: usableRuntime.data.integration.id,
              methodKey: "hubspot.chat_form_search",
            }
          )
        : await lookupHubSpotRecords(
            { accessToken: config.data.accessToken, hubId: config.data.hubId },
            { query: input.query, limit: input.limit },
            {
              organizationId: input.organizationId,
              integrationId: usableRuntime.data.integration.id,
              methodKey: "hubspot.chat_form_search",
            }
          );

    return result.records
      .filter((record) => {
        if (input.fieldKey === "contactIds") return record.objectType === "contact";
        if (input.fieldKey === "companyIds") return record.objectType === "company";
        return record.objectType === "deal";
      })
      .slice(0, input.limit)
      .map((record) => ({
        id: record.id,
        label: record.label,
        subtitle: record.url,
      }));
  }

  const runtimeResult = await getSalesforceAgentToolRuntime(
    input.agentId,
    input.organizationId
  );
  if (runtimeResult.error || !runtimeResult.data) {
    return [];
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return [];
  }

  const config = await getSalesforceIntegrationConfig(
    usableRuntime.data.integration.id,
    input.organizationId
  );
  if (config.error || !config.data) {
    return [];
  }

  const credentials = {
    accessToken: config.data.accessToken,
    instanceUrl: config.data.instanceUrl,
  };
  const context = {
    organizationId: input.organizationId,
    integrationId: usableRuntime.data.integration.id,
    methodKey: "salesforce.chat_form_search",
  };

  if (input.fieldKey === "accountId") {
    if (!assertSalesforceActionEnabled(usableRuntime.data, "lookup_accounts").data) {
      return [];
    }

    const result = await lookupSalesforceAccounts(credentials, { query: input.query, limit: input.limit }, context);
    return result.records.slice(0, input.limit).map((record) => ({
      id: record.id,
      label: record.name,
      subtitle: record.url,
    }));
  }

  if (input.fieldKey === "whoId") {
    if (!assertSalesforceActionEnabled(usableRuntime.data, "lookup_records").data) {
      return [];
    }

    const result = await lookupSalesforceLeadOrContact(credentials, { query: input.query, limit: input.limit }, context);
    return result.records.slice(0, input.limit).map((record) => ({
      id: record.id,
      label: record.name,
      subtitle: record.url,
    }));
  }

  const [accounts, opportunities, cases] = await Promise.all([
    lookupSalesforceAccounts(credentials, { query: input.query, limit: input.limit }, context),
    lookupSalesforceOpportunities(credentials, { query: input.query, limit: input.limit }, context),
    lookupSalesforceCases(credentials, { query: input.query, limit: input.limit }, context),
  ]);

  return [...accounts.records, ...opportunities.records, ...cases.records]
    .slice(0, input.limit)
    .map((record) => ({
      id: record.id,
      label: record.name,
      subtitle: record.url,
    }));
}

export async function loadChatFormOptions(input: {
  agentId: string;
  organizationId: string;
  formId: string;
  pipelineId?: string;
}): Promise<Record<string, Array<{ label: string; value: string }>>> {
  const definition = getChatFormDefinition(input.formId as never);
  if (!definition) {
    return {};
  }

  const options = Object.fromEntries(
    definition.fields
      .filter((field) => field.options && field.options.length > 0)
      .map((field) => [field.key, [...(field.options ?? [])]])
  ) as Record<string, Array<{ label: string; value: string }>>;

  if (definition.provider !== "hubspot") {
    return options;
  }

  const runtimeResult = await getHubSpotAgentToolRuntime(
    input.agentId,
    input.organizationId
  );
  if (runtimeResult.error || !runtimeResult.data) {
    return options;
  }

  const usableRuntime = assertHubSpotRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return options;
  }

  const config = await getHubSpotIntegrationConfig(
    usableRuntime.data.integration.id,
    input.organizationId
  );
  if (config.error || !config.data) {
    return options;
  }

  const pipelinesKey = `chat_form.options:hubspot:pipelines:${usableRuntime.data.integration.id}`;
  const cachedPipelines = await getJsonValue<Array<{ label: string; value: string }>>(pipelinesKey);
  if (cachedPipelines) {
    options["pipeline"] = cachedPipelines;
  } else {
    const pipelinesResponse = await requestHubSpot<HubSpotPipelineResponse>(
      { accessToken: config.data.accessToken },
      "/crm/v3/pipelines/deals",
      { method: "GET" },
      {
        organizationId: input.organizationId,
        integrationId: usableRuntime.data.integration.id,
        methodKey: "hubspot.chat_form_options",
      }
    );
    const pipelines = (pipelinesResponse.data.results ?? [])
      .map((pipeline) => ({ label: pipeline.label ?? pipeline.id ?? "", value: pipeline.id ?? "" }))
      .filter((pipeline) => pipeline.label.length > 0 && pipeline.value.length > 0);
    options["pipeline"] = pipelines;
    await setJsonValue(pipelinesKey, pipelines, CHAT_FORM_OPTIONS_CACHE_TTL_SECONDS);
  }

  if (!input.pipelineId) {
    return options;
  }

  const stagesKey = `chat_form.options:hubspot:stages:${usableRuntime.data.integration.id}:${input.pipelineId}`;
  const cachedStages = await getJsonValue<Array<{ label: string; value: string }>>(stagesKey);
  if (cachedStages) {
    options["dealstage"] = cachedStages;
    return options;
  }

  const stagesResponse = await requestHubSpot<HubSpotPipelineResponse>(
    { accessToken: config.data.accessToken },
    `/crm/v3/pipelines/deals/${encodeURIComponent(input.pipelineId)}`,
    { method: "GET" },
    {
      organizationId: input.organizationId,
      integrationId: usableRuntime.data.integration.id,
      methodKey: "hubspot.chat_form_options",
    }
  );
  const stages = (stagesResponse.data.stages ?? [])
    .map((stage) => ({ label: stage.label ?? stage.id ?? "", value: stage.id ?? "" }))
    .filter((stage) => stage.label.length > 0 && stage.value.length > 0);
  options["dealstage"] = stages;
  await setJsonValue(stagesKey, stages, CHAT_FORM_OPTIONS_CACHE_TTL_SECONDS);
  return options;
}
