import type { AgentScope } from "@/lib/agents/agent-scope";

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
  primaryScope?: AgentScope;
  allowedScopes?: AgentScope[];
  scopeKeywords?: Partial<Record<AgentScope, string[]>>;
};

const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const ALL_AGENT_SCOPES: AgentScope[] = ["support", "sales", "operations"];

const ACTION_MATRIX: WorkflowActionMatrixEntry[] = [
  { provider: "salesforce", action: "create_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "update_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "support", allowedScopes: ["support"] },
  { provider: "salesforce", action: "update_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "support", allowedScopes: ["support"] },
  { provider: "salesforce", action: "update_opportunity", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_task", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", primaryScope: "operations", allowedScopes: ["operations"] },
  { provider: "gmail", action: "create_draft_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "create_draft_email", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "send_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "send_email", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "archive_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "pipeline", "oportunidad", "propuesta", "cotizacion"], operations: ["interno", "backoffice", "approval", "aprobacion", "reporting"] } },
  { provider: "gmail", action: "apply_label", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "pipeline", "oportunidad", "propuesta", "cotizacion"], operations: ["interno", "backoffice", "approval", "aprobacion", "reporting"] } },
  { provider: "google_calendar", action: "create_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
  { provider: "google_calendar", action: "reschedule_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
  { provider: "google_calendar", action: "cancel_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
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
      allowedScopes: ALL_AGENT_SCOPES,
    }
  );
}

export function inferScopeFromWorkflowAction(input: {
  provider: string;
  action: string;
  summary?: string;
}): AgentScope | null {
  const entry = getWorkflowActionMatrixEntry(input.provider, input.action);

  if (entry.primaryScope && (entry.allowedScopes?.length ?? 0) <= 1) {
    return entry.primaryScope;
  }

  const summary = input.summary?.trim().toLowerCase() ?? "";
  if (!summary || !entry.scopeKeywords) {
    return entry.primaryScope ?? null;
  }

  const allowedScopes = entry.allowedScopes ?? ALL_AGENT_SCOPES;
  const scoredScopes = allowedScopes
    .map((scope) => ({
      scope,
      score: (entry.scopeKeywords?.[scope] ?? []).reduce((score, keyword) => {
        return summary.includes(keyword) ? score + 1 : score;
      }, 0),
    }))
    .sort((left, right) => right.score - left.score);

  const best = scoredScopes[0];
  const second = scoredScopes[1];

  if (!best || best.score === 0) {
    return entry.primaryScope ?? null;
  }

  if (second && best.score === second.score) {
    return null;
  }

  return best.scope;
}
