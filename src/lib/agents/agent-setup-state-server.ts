import "server-only";

import type { Agent } from "@/types/app";
import {
  createDefaultAgentSetupState,
  type AgentSetupState,
  type SetupResolutionContext,
} from "@/lib/agents/agent-setup";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import type { WizardIntegrationId } from "@/lib/agents/wizard-integrations";
import { listAgentToolsWithServiceRole } from "@/lib/db/agent-tools-service";

const TOOL_TYPE_TO_INTEGRATION: Partial<Record<string, WizardIntegrationId>> = {
  crm: "salesforce",
  gmail: "gmail",
  google_calendar: "google_calendar",
  google_sheets: "google_sheets",
};

export async function readAgentSetupStateWithToolSelections(
  agent: Agent,
  organizationId: string,
  context: SetupResolutionContext = {}
): Promise<AgentSetupState | null> {
  const toolsResult = await listAgentToolsWithServiceRole(agent.id, organizationId);
  if (toolsResult.error || !toolsResult.data) {
    return readAgentSetupState(agent, context);
  }

  const setupState =
    readAgentSetupState(agent, context) ??
    createDefaultAgentSetupState({
      channel: "web",
    });

  const nextIntegrations = new Set<WizardIntegrationId>(setupState.integrations);

  for (const tool of toolsResult.data) {
    const integrationId = TOOL_TYPE_TO_INTEGRATION[tool.tool_type];
    if (integrationId) {
      nextIntegrations.add(integrationId);
    }
  }

  if (nextIntegrations.size === setupState.integrations.length) {
    return setupState;
  }

  return {
    ...setupState,
    integrations: [...nextIntegrations],
  };
}
