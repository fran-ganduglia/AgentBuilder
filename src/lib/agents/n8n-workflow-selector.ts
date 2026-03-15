import type { AgentSetupState } from "@/lib/agents/agent-setup";

export const N8N_BUSINESS_WORKFLOW_IDS = [
  "wCrmSyncSalesforce",
  "wWhatsAppFollowUp",
  "wWhatsAppBroadcast",
  "wOAuthTokenRefresh",
  "wConversationReengagement",
] as const;

export type N8nBusinessWorkflowId = (typeof N8N_BUSINESS_WORKFLOW_IDS)[number];

/**
 * Pure function — no I/O.
 * Returns the set of n8n business workflow IDs that must be active for a given agent configuration.
 */
export function selectWorkflowsForAgent(setupState: AgentSetupState): N8nBusinessWorkflowId[] {
  const needed = new Set<N8nBusinessWorkflowId>();

  const hasSalesforce = setupState.integrations.includes("salesforce");
  const isWhatsApp = setupState.channel === "whatsapp";
  const areas = setupState.areas;

  if (hasSalesforce) {
    needed.add("wCrmSyncSalesforce");
    needed.add("wOAuthTokenRefresh");
  }

  const hasGmail = setupState.integrations.includes("gmail");
  const hasGoogleCalendar = setupState.integrations.includes("google_calendar");

  if (hasGmail || hasGoogleCalendar) {
    needed.add("wOAuthTokenRefresh");
  }

  if (isWhatsApp) {
    const needsFollowUp = areas.includes("support");

    if (needsFollowUp) {
      needed.add("wWhatsAppFollowUp");
    }

    const needsBroadcast = areas.includes("sales") || areas.includes("marketing");
    if (needsBroadcast) {
      needed.add("wWhatsAppBroadcast");
    }
  }

  const needsReengagement = areas.includes("support") || areas.includes("sales");
  if (needsReengagement) {
    needed.add("wConversationReengagement");
  }

  return [...needed];
}
