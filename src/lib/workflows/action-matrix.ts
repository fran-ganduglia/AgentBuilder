import "server-only";

export type WorkflowActionMatrixEntry = {
  provider: string;
  action: string;
  access: "read" | "write";
  sync: boolean;
  async: boolean;
  requiresConfirmation: boolean;
  workflowTriggerable: boolean;
  allowedPresets: Array<"copilot" | "assisted" | "autonomous">;
  approvalTimeoutMs: number;
  riskLevel: "low" | "medium" | "high";
};

const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

const ACTION_MATRIX: WorkflowActionMatrixEntry[] = [
  { provider: "hubspot", action: "create_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "hubspot", action: "update_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "hubspot", action: "create_company", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "hubspot", action: "update_company", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "hubspot", action: "create_deal", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "hubspot", action: "update_deal", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "hubspot", action: "create_task", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low" },
  { provider: "hubspot", action: "create_meeting", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "salesforce", action: "create_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "salesforce", action: "update_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "salesforce", action: "create_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "salesforce", action: "create_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "salesforce", action: "update_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "salesforce", action: "update_opportunity", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "salesforce", action: "create_task", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low" },
  { provider: "gmail", action: "create_draft_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "gmail", action: "send_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: false, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
  { provider: "gmail", action: "archive_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low" },
  { provider: "gmail", action: "apply_label", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low" },
  { provider: "google_calendar", action: "create_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "google_calendar", action: "reschedule_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium" },
  { provider: "google_calendar", action: "cancel_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high" },
];

export function getWorkflowActionMatrixEntry(
  provider: string,
  action: string
): WorkflowActionMatrixEntry {
  return (
    ACTION_MATRIX.find(
      (entry) => entry.provider === provider && entry.action === action
    ) ?? {
      provider,
      action,
      access: "write",
      sync: false,
      async: true,
      requiresConfirmation: true,
      workflowTriggerable: true,
      allowedPresets: ["assisted", "autonomous"],
      approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      riskLevel: "medium",
    }
  );
}
