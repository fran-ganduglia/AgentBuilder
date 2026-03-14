import type { Tables } from "@/types/database";
import { parseHubSpotAgentToolConfig } from "@/lib/integrations/hubspot-tools";

type AgentTool = Tables<"agent_tools">;

function isHubSpotCrmAgentTool(tool: AgentTool): boolean {
  return tool.tool_type === "crm" && Boolean(parseHubSpotAgentToolConfig(tool.config));
}

function sortNewestFirst<T extends { created_at: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function selectPreferredHubSpotAgentTool(
  tools: AgentTool[],
  activeIntegrationId: string | null
): AgentTool | null {
  const hubSpotTools = sortNewestFirst(tools.filter(isHubSpotCrmAgentTool));

  if (activeIntegrationId) {
    const alignedTool = hubSpotTools.find(
      (tool) => tool.integration_id === activeIntegrationId
    );
    if (alignedTool) {
      return alignedTool;
    }
  }

  return hubSpotTools[0] ?? null;
}

export function getHubSpotAgentToolDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null
): {
  selectedTool: AgentTool | null;
  selectedAllowedActions: string[];
  hasDuplicateHubSpotTools: boolean;
  hasMisalignedHubSpotTools: boolean;
} {
  const hubSpotTools = tools.filter(isHubSpotCrmAgentTool);
  const selectedTool = selectPreferredHubSpotAgentTool(tools, activeIntegrationId);
  const config = selectedTool ? parseHubSpotAgentToolConfig(selectedTool.config) : null;

  return {
    selectedTool,
    selectedAllowedActions: config?.allowed_actions ?? [],
    hasDuplicateHubSpotTools: hubSpotTools.length > 1,
    hasMisalignedHubSpotTools: Boolean(
      activeIntegrationId &&
      hubSpotTools.some((tool) => tool.integration_id && tool.integration_id !== activeIntegrationId)
    ),
  };
}

export { isHubSpotCrmAgentTool };
