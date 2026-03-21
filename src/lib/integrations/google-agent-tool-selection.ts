import type { Tables } from "@/types/database";
import {
  parseGmailAgentToolConfig,
  parseGoogleCalendarAgentToolConfig,
  parseGoogleDriveAgentToolConfig,
  parseGoogleSheetsAgentToolConfig,
} from "@/lib/integrations/google-agent-tools";

type AgentTool = Tables<"agent_tools">;

function sortNewestFirst<T extends { created_at: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function isGmailAgentTool(tool: AgentTool): boolean {
  return tool.tool_type === "gmail" && Boolean(parseGmailAgentToolConfig(tool.config));
}

export function isGoogleCalendarAgentTool(tool: AgentTool): boolean {
  return (
    tool.tool_type === "google_calendar" &&
    Boolean(parseGoogleCalendarAgentToolConfig(tool.config))
  );
}

export function isGoogleSheetsAgentTool(tool: AgentTool): boolean {
  return (
    tool.tool_type === "google_sheets" &&
    Boolean(parseGoogleSheetsAgentToolConfig(tool.config))
  );
}

export function isGoogleDriveAgentTool(tool: AgentTool): boolean {
  return (
    tool.tool_type === "google_drive" &&
    Boolean(parseGoogleDriveAgentToolConfig(tool.config))
  );
}

function selectPreferredTool(
  tools: AgentTool[],
  predicate: (tool: AgentTool) => boolean,
  activeIntegrationId: string | null
): AgentTool | null {
  const filteredTools = sortNewestFirst(tools.filter(predicate));

  if (activeIntegrationId) {
    const alignedTool = filteredTools.find(
      (tool) => tool.integration_id === activeIntegrationId
    );
    if (alignedTool) {
      return alignedTool;
    }
  }

  return filteredTools[0] ?? null;
}

export function getGmailAgentToolDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null
): {
  selectedTool: AgentTool | null;
  selectedAllowedActions: string[];
  hasDuplicateTools: boolean;
  hasMisalignedTools: boolean;
} {
  const gmailTools = tools.filter(isGmailAgentTool);
  const selectedTool = selectPreferredTool(
    tools,
    isGmailAgentTool,
    activeIntegrationId
  );
  const config = selectedTool ? parseGmailAgentToolConfig(selectedTool.config) : null;

  return {
    selectedTool,
    selectedAllowedActions: config?.allowed_actions ?? [],
    hasDuplicateTools: gmailTools.length > 1,
    hasMisalignedTools: Boolean(
      activeIntegrationId &&
        gmailTools.some(
          (tool) => tool.integration_id && tool.integration_id !== activeIntegrationId
        )
    ),
  };
}

export function getGoogleCalendarAgentToolDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null
): {
  selectedTool: AgentTool | null;
  selectedAllowedActions: string[];
  hasDuplicateTools: boolean;
  hasMisalignedTools: boolean;
} {
  const calendarTools = tools.filter(isGoogleCalendarAgentTool);
  const selectedTool = selectPreferredTool(
    tools,
    isGoogleCalendarAgentTool,
    activeIntegrationId
  );
  const config = selectedTool
    ? parseGoogleCalendarAgentToolConfig(selectedTool.config)
    : null;

  return {
    selectedTool,
    selectedAllowedActions: config?.allowed_actions ?? [],
    hasDuplicateTools: calendarTools.length > 1,
    hasMisalignedTools: Boolean(
      activeIntegrationId &&
        calendarTools.some(
          (tool) => tool.integration_id && tool.integration_id !== activeIntegrationId
        )
    ),
  };
}

export function getGoogleSheetsAgentToolDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null
): {
  selectedTool: AgentTool | null;
  selectedAllowedActions: string[];
  hasDuplicateTools: boolean;
  hasMisalignedTools: boolean;
} {
  const sheetsTools = tools.filter(isGoogleSheetsAgentTool);
  const selectedTool = selectPreferredTool(
    tools,
    isGoogleSheetsAgentTool,
    activeIntegrationId
  );
  const config = selectedTool
    ? parseGoogleSheetsAgentToolConfig(selectedTool.config)
    : null;

  return {
    selectedTool,
    selectedAllowedActions: config?.allowed_actions ?? [],
    hasDuplicateTools: sheetsTools.length > 1,
    hasMisalignedTools: Boolean(
      activeIntegrationId &&
        sheetsTools.some(
          (tool) => tool.integration_id && tool.integration_id !== activeIntegrationId
        )
    ),
  };
}

export function getGoogleDriveAgentToolDiagnostics(
  tools: AgentTool[],
  activeIntegrationId: string | null
): {
  selectedTool: AgentTool | null;
  selectedAllowedActions: string[];
  hasDuplicateTools: boolean;
  hasMisalignedTools: boolean;
} {
  const driveTools = tools.filter(isGoogleDriveAgentTool);
  const selectedTool = selectPreferredTool(
    tools,
    isGoogleDriveAgentTool,
    activeIntegrationId
  );
  const config = selectedTool
    ? parseGoogleDriveAgentToolConfig(selectedTool.config)
    : null;

  return {
    selectedTool,
    selectedAllowedActions: config?.allowed_actions ?? [],
    hasDuplicateTools: driveTools.length > 1,
    hasMisalignedTools: Boolean(
      activeIntegrationId &&
        driveTools.some(
          (tool) => tool.integration_id && tool.integration_id !== activeIntegrationId
        )
    ),
  };
}
