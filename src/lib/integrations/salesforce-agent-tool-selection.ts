import type { Tables } from "@/types/database";
import { parseSalesforceAgentToolConfig } from "@/lib/integrations/salesforce-tools";
import {
  getSalesforceAgentToolSelectionDiagnostics,
  selectPreferredSalesforceAgentToolCore,
  type SalesforceAgentToolSelectionDiagnostics,
} from "@/lib/integrations/salesforce-selection";

type AgentTool = Tables<"agent_tools">;

function parseToolConfig(config: unknown) {
  return parseSalesforceAgentToolConfig(
    config as Parameters<typeof parseSalesforceAgentToolConfig>[0]
  );
}

export function isSalesforceCrmAgentTool(tool: AgentTool): boolean {
  if (tool.tool_type !== "crm") {
    return false;
  }

  const config = parseToolConfig(tool.config);
  return config?.provider === "salesforce";
}

export function selectPreferredSalesforceAgentTool(
  tools: AgentTool[],
  integrationId?: string | null
): AgentTool | null {
  return selectPreferredSalesforceAgentToolCore(
    tools,
    integrationId ?? null,
    parseToolConfig
  );
}

export function getSalesforceAgentToolDiagnostics(
  tools: AgentTool[],
  integrationId?: string | null
): SalesforceAgentToolSelectionDiagnostics<AgentTool> {
  return getSalesforceAgentToolSelectionDiagnostics(
    tools,
    integrationId ?? null,
    parseToolConfig
  );
}
