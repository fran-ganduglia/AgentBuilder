import "server-only";

import { incrementRateLimit } from "@/lib/redis";
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
// getChatFormDefinition removed — dynamic forms handle definitions client-side

const CHAT_FORM_SEARCH_RATE_LIMIT_WINDOW_SECONDS = 60;
const CHAT_FORM_SEARCH_RATE_LIMIT_MAX = 20;

type SearchResultItem = {
  id: string;
  label: string;
  subtitle: string | null;
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
  void input;
  return {};
}
