import "server-only";

import { env } from "@/lib/utils/env";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { selectWorkflowsForAgent, type N8nBusinessWorkflowId } from "@/lib/agents/n8n-workflow-selector";
import type { AgentSetupState } from "@/lib/agents/agent-setup";

async function patchN8nWorkflow(workflowId: string, active: boolean): Promise<void> {
  const action = active ? "activate" : "deactivate";
  const url = `${env.N8N_BASE_URL}/api/v1/workflows/${workflowId}/${action}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-N8N-API-KEY": env.N8N_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`n8n ${action} ${workflowId} returned ${response.status}`);
  }
}

async function listActiveAgentSetupStates(organizationId: string): Promise<AgentSetupState[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("agents")
    .select("setup_state")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => row.setup_state as AgentSetupState | null)
    .filter((s): s is AgentSetupState => s !== null && typeof s === "object");
}

function orgStillNeedsWorkflow(
  agentSetupStates: AgentSetupState[],
  workflowId: N8nBusinessWorkflowId
): boolean {
  return agentSetupStates.some((state) =>
    selectWorkflowsForAgent(state).includes(workflowId)
  );
}

/**
 * Activates the n8n workflows required by the given agent's setup state.
 * Never throws — failures are logged and swallowed so they don't block agent activation.
 */
export async function activateWorkflowsForAgent(
  agentId: string,
  organizationId: string,
  setupState: AgentSetupState
): Promise<void> {
  if (!env.WORKERS_ENABLED) {
    console.info("n8n.workflow.activation_skipped_workers_disabled", {
      agentId,
      organizationId,
    });
    return;
  }

  const workflowIds = selectWorkflowsForAgent(setupState);

  for (const workflowId of workflowIds) {
    try {
      await patchN8nWorkflow(workflowId, true);
      console.info("n8n.workflow.activated", { agentId, organizationId, workflowId });
    } catch (err) {
      console.error("n8n.workflow.activate_failed", {
        agentId,
        organizationId,
        workflowId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
}

/**
 * Deactivates an n8n workflow only if no other active agent in the org still needs it.
 * Never throws.
 */
export async function deactivateWorkflowIfNoConsumers(
  workflowId: N8nBusinessWorkflowId,
  organizationId: string
): Promise<void> {
  try {
    if (!env.WORKERS_ENABLED) {
      console.info("n8n.workflow.deactivation_skipped_workers_disabled", {
        organizationId,
        workflowId,
      });
      return;
    }

    const activeSetupStates = await listActiveAgentSetupStates(organizationId);
    if (orgStillNeedsWorkflow(activeSetupStates, workflowId)) {
      return;
    }

    await patchN8nWorkflow(workflowId, false);
    console.info("n8n.workflow.deactivated", { organizationId, workflowId });
  } catch (err) {
    console.error("n8n.workflow.deactivate_failed", {
      organizationId,
      workflowId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
