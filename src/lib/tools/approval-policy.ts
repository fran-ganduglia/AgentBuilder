import type { Tables } from "@/types/database";
import {
  isGmailWriteAction,
  type GmailToolAction,
} from "@/lib/integrations/google-agent-tools";
import {
  GOOGLE_CALENDAR_READ_TOOL_ACTIONS,
} from "@/lib/integrations/google-agent-tools";
import {
  isGoogleSheetsWriteAction,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import {
  isSalesforceWriteAction,
  type SalesforceCrmAction,
} from "@/lib/integrations/salesforce-tools";

type AgentToolRow = Tables<"agent_tools">;

export type ApprovalPolicyConfig = {
  requireApproval(provider: string, surface: string, action: string): boolean;
};

type ToolConfig = {
  approval_actions?: string[];
};

function parseApprovalActions(config: unknown): string[] | null {
  if (!config || typeof config !== "object") {
    return null;
  }

  const raw = (config as ToolConfig).approval_actions;
  if (!Array.isArray(raw)) {
    return null;
  }

  return raw.filter((item): item is string => typeof item === "string");
}

function isWriteActionByDefault(surface: string, action: string): boolean {
  switch (surface) {
    case "gmail":
      return isGmailWriteAction(action as GmailToolAction);
    case "google_calendar":
      return !GOOGLE_CALENDAR_READ_TOOL_ACTIONS.includes(
        action as (typeof GOOGLE_CALENDAR_READ_TOOL_ACTIONS)[number]
      );
    case "google_sheets":
      return isGoogleSheetsWriteAction(action as GoogleSheetsToolAction);
    case "salesforce":
      return isSalesforceWriteAction(action as SalesforceCrmAction);
    default:
      return false;
  }
}

export function buildApprovalPolicy(
  agentTools: AgentToolRow[]
): ApprovalPolicyConfig {
  const surfaceApprovalMap = new Map<string, string[] | null>();

  for (const tool of agentTools) {
    const surface = (tool.config as Record<string, unknown> | null)?.surface as string | undefined;
    if (!surface) {
      continue;
    }

    const approvalActions = parseApprovalActions(tool.config);
    surfaceApprovalMap.set(surface, approvalActions);
  }

  return {
    requireApproval(_provider: string, surface: string, action: string): boolean {
      const approvalActions = surfaceApprovalMap.get(surface);

      if (approvalActions !== null && approvalActions !== undefined) {
        return approvalActions.includes(action);
      }

      return isWriteActionByDefault(surface, action);
    },
  };
}
