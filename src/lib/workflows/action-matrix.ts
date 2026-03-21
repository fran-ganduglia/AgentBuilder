import type { AgentScope } from "@/lib/agents/agent-scope";
import {
  GOOGLE_SHEETS_DESTRUCTIVE_TOOL_ACTIONS,
  GOOGLE_SHEETS_READ_TOOL_ACTIONS,
  GOOGLE_SHEETS_TOOL_ACTIONS,
} from "@/lib/integrations/google-agent-tools";
import {
  GMAIL_REQUIRED_SCOPES,
  GOOGLE_CALENDAR_REQUIRED_SCOPES,
  GOOGLE_SHEETS_REQUIRED_SCOPES,
} from "@/lib/integrations/google-scopes";

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
  requiredOAuthScopes?: string[];
  approvalMode?: "never" | "always";
  operationalLimits?: Array<{
    key: string;
    max: number;
    unit: "count" | "per_turn" | "per_message";
    appliesToField?: string;
  }>;
  securityGuards?: Array<
    | "prompt_injection"
    | "sql_injection"
    | "command_injection"
    | "secret_exfiltration"
    | "provider_policy"
  >;
  failureMode?: "deny" | "clarify" | "redirect" | "approval";
};

const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const ALL_AGENT_SCOPES: AgentScope[] = ["support", "sales", "operations"];
const DEFAULT_WRITE_SECURITY_GUARDS: WorkflowActionMatrixEntry["securityGuards"] = [
  "prompt_injection",
  "secret_exfiltration",
  "provider_policy",
];
const DEFAULT_READ_SECURITY_GUARDS: WorkflowActionMatrixEntry["securityGuards"] = [
  "prompt_injection",
  "sql_injection",
  "command_injection",
  "secret_exfiltration",
];
const GOOGLE_SHEETS_SCOPE_KEYWORDS = {
  support: ["planilla", "spreadsheet", "seguimiento", "ticket", "caso"],
  sales: ["pipeline", "lead", "prospecto", "oportunidad", "forecast"],
  operations: ["reporte", "operaciones", "backoffice", "inventario", "control"],
} satisfies Partial<Record<AgentScope, string[]>>;
const GOOGLE_SHEETS_HIGH_RISK_ACTIONS = new Set<string>([
  ...GOOGLE_SHEETS_DESTRUCTIVE_TOOL_ACTIONS,
  "update_range",
]);
const GOOGLE_SHEETS_MATRIX_ENTRIES: WorkflowActionMatrixEntry[] =
  GOOGLE_SHEETS_TOOL_ACTIONS.map((action) =>
    GOOGLE_SHEETS_READ_TOOL_ACTIONS.includes(action as never)
      ? {
          provider: "google_sheets",
          action,
          access: "read",
          sync: true,
          async: false,
          requiresConfirmation: false,
          workflowTriggerable: false,
          allowedPresets: ["copilot", "assisted", "autonomous"],
          approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
          riskLevel: "low",
          allowedScopes: ALL_AGENT_SCOPES,
        }
      : {
          provider: "google_sheets",
          action,
          access: "write",
          sync: false,
          async: true,
          requiresConfirmation: true,
          workflowTriggerable: true,
          allowedPresets: ["assisted", "autonomous"],
          approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
          riskLevel: GOOGLE_SHEETS_HIGH_RISK_ACTIONS.has(action) ? "high" : "medium",
          allowedScopes: ALL_AGENT_SCOPES,
          approvalMode: "always",
          scopeKeywords: GOOGLE_SHEETS_SCOPE_KEYWORDS,
        }
  );

const ACTION_MATRIX: WorkflowActionMatrixEntry[] = [
  { provider: "salesforce", action: "create_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "update_lead", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "support", allowedScopes: ["support"] },
  { provider: "salesforce", action: "update_case", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "support", allowedScopes: ["support"] },
  { provider: "salesforce", action: "update_opportunity", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_task", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", primaryScope: "operations", allowedScopes: ["operations"] },
  { provider: "salesforce", action: "update_contact", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "update_account", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_opportunity", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_account", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "create_opportunity_contact_role", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", primaryScope: "sales", allowedScopes: ["sales"] },
  { provider: "salesforce", action: "lookup_records", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "list_leads_recent", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "list_leads_by_status", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "lookup_accounts", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "lookup_opportunities", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "lookup_cases", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "salesforce", action: "summarize_pipeline", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "gmail", action: "search_threads", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "gmail", action: "read_thread", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "gmail", action: "create_draft_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "create_draft_email", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "send_reply", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "send_email", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo", "follow-up", "follow up"], operations: ["interno", "aprobacion", "reporte", "reporting", "comite", "coordinacion"] } },
  { provider: "gmail", action: "archive_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "pipeline", "oportunidad", "propuesta", "cotizacion"], operations: ["interno", "backoffice", "approval", "aprobacion", "reporting"] } },
  { provider: "gmail", action: "apply_label", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "pipeline", "oportunidad", "propuesta", "cotizacion"], operations: ["interno", "backoffice", "approval", "aprobacion", "reporting"] } },
  { provider: "gmail", action: "mark_as_read", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS },
  { provider: "gmail", action: "mark_as_unread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS },
  { provider: "gmail", action: "star_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS },
  { provider: "gmail", action: "unstar_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS },
  { provider: "gmail", action: "remove_label", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS },
  { provider: "gmail", action: "forward_thread", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS, scopeKeywords: { support: ["ticket", "reclamo", "incidente", "soporte", "caso"], sales: ["lead", "prospecto", "propuesta", "cotizacion", "demo"], operations: ["interno", "aprobacion", "reporte", "coordinacion"] } },
  { provider: "google_calendar", action: "check_availability", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "google_calendar", action: "list_events", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "google_calendar", action: "get_event_details", access: "read", sync: true, async: false, requiresConfirmation: false, workflowTriggerable: false, allowedPresets: ["copilot", "assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "low", allowedScopes: ALL_AGENT_SCOPES },
  { provider: "google_calendar", action: "create_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
  { provider: "google_calendar", action: "reschedule_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
  { provider: "google_calendar", action: "cancel_event", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "high", allowedScopes: ALL_AGENT_SCOPES, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion", "follow-up", "follow up"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite", "reporte", "reporting"] } },
  { provider: "google_calendar", action: "update_event_details", access: "write", sync: false, async: true, requiresConfirmation: true, workflowTriggerable: true, allowedPresets: ["assisted", "autonomous"], approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS, riskLevel: "medium", allowedScopes: ALL_AGENT_SCOPES, securityGuards: DEFAULT_WRITE_SECURITY_GUARDS, scopeKeywords: { support: ["soporte", "reclamo", "incidente", "caso", "cliente con problema"], sales: ["demo", "comercial", "prospecto", "lead", "propuesta", "cotizacion"], operations: ["interno", "equipo", "operaciones", "aprobacion", "comite"] } },
  ...GOOGLE_SHEETS_MATRIX_ENTRIES,
];

function buildActionKey(provider: string, action: string): string {
  return `${provider}:${action}`;
}

const ACTION_REQUIRED_OAUTH_SCOPES: Record<string, string[]> = {
  [buildActionKey("gmail", "search_threads")]: [GMAIL_REQUIRED_SCOPES[0]],
  [buildActionKey("gmail", "read_thread")]: [GMAIL_REQUIRED_SCOPES[0]],
  [buildActionKey("gmail", "create_draft_reply")]: [GMAIL_REQUIRED_SCOPES[1]],
  [buildActionKey("gmail", "create_draft_email")]: [GMAIL_REQUIRED_SCOPES[1]],
  [buildActionKey("gmail", "send_reply")]: [GMAIL_REQUIRED_SCOPES[1], GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "send_email")]: [GMAIL_REQUIRED_SCOPES[1], GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "archive_thread")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "apply_label")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "mark_as_read")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "mark_as_unread")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "star_thread")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "unstar_thread")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "remove_label")]: [GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("gmail", "forward_thread")]: [GMAIL_REQUIRED_SCOPES[1], GMAIL_REQUIRED_SCOPES[2]],
  [buildActionKey("google_calendar", "check_availability")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "list_events")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "create_event")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "reschedule_event")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "cancel_event")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "get_event_details")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  [buildActionKey("google_calendar", "update_event_details")]: [
    ...GOOGLE_CALENDAR_REQUIRED_SCOPES,
  ],
  ...Object.fromEntries(
    GOOGLE_SHEETS_TOOL_ACTIONS.map((action) => [
      buildActionKey("google_sheets", action),
      [...GOOGLE_SHEETS_REQUIRED_SCOPES],
    ])
  ),
};

const ACTION_OPERATIONAL_LIMITS: Record<
  string,
  NonNullable<WorkflowActionMatrixEntry["operationalLimits"]>
> = {
  [buildActionKey("gmail", "search_threads")]: [
    { key: "max_results", max: 5, unit: "count", appliesToField: "maxResults" },
  ],
  [buildActionKey("gmail", "create_draft_reply")]: [
    { key: "max_cc", max: 20, unit: "per_message", appliesToField: "cc" },
    { key: "max_bcc", max: 20, unit: "per_message", appliesToField: "bcc" },
    { key: "max_attachment_paths", max: 3, unit: "per_message", appliesToField: "attachmentPaths" },
  ],
  [buildActionKey("gmail", "create_draft_email")]: [
    { key: "max_to", max: 20, unit: "per_message", appliesToField: "to" },
    { key: "max_cc", max: 20, unit: "per_message", appliesToField: "cc" },
    { key: "max_bcc", max: 20, unit: "per_message", appliesToField: "bcc" },
    { key: "max_attachment_paths", max: 3, unit: "per_message", appliesToField: "attachmentPaths" },
  ],
  [buildActionKey("gmail", "send_reply")]: [
    { key: "max_cc", max: 20, unit: "per_message", appliesToField: "cc" },
    { key: "max_bcc", max: 20, unit: "per_message", appliesToField: "bcc" },
    { key: "max_attachment_paths", max: 3, unit: "per_message", appliesToField: "attachmentPaths" },
  ],
  [buildActionKey("gmail", "send_email")]: [
    { key: "max_to", max: 20, unit: "per_message", appliesToField: "to" },
    { key: "max_cc", max: 20, unit: "per_message", appliesToField: "cc" },
    { key: "max_bcc", max: 20, unit: "per_message", appliesToField: "bcc" },
    { key: "max_attachment_paths", max: 3, unit: "per_message", appliesToField: "attachmentPaths" },
  ],
  [buildActionKey("gmail", "forward_thread")]: [
    { key: "max_to", max: 20, unit: "per_message", appliesToField: "to" },
    { key: "max_cc", max: 20, unit: "per_message", appliesToField: "cc" },
    { key: "max_bcc", max: 20, unit: "per_message", appliesToField: "bcc" },
  ],
  [buildActionKey("google_calendar", "list_events")]: [
    { key: "max_results", max: 20, unit: "count", appliesToField: "maxResults" },
  ],
  [buildActionKey("google_calendar", "create_event")]: [
    { key: "max_attendees", max: 20, unit: "per_message", appliesToField: "attendeeEmails" },
  ],
  [buildActionKey("google_calendar", "reschedule_event")]: [
    { key: "max_attendees", max: 20, unit: "per_message", appliesToField: "attendeeEmails" },
  ],
  [buildActionKey("google_calendar", "update_event_details")]: [
    { key: "max_attendees", max: 20, unit: "per_message", appliesToField: "attendeeEmails" },
  ],
  [buildActionKey("google_calendar", "cancel_event")]: [
    { key: "max_attendees", max: 20, unit: "per_message", appliesToField: "attendeeEmails" },
  ],
  [buildActionKey("google_sheets", "read_range")]: [
    { key: "max_rows", max: 200, unit: "count", appliesToField: "rangeA1" },
  ],
  [buildActionKey("google_sheets", "append_rows")]: [
    { key: "max_rows", max: 100, unit: "count", appliesToField: "values" },
    { key: "max_columns", max: 50, unit: "count", appliesToField: "values" },
  ],
  [buildActionKey("google_sheets", "update_range")]: [
    { key: "max_rows", max: 100, unit: "count", appliesToField: "values" },
    { key: "max_columns", max: 50, unit: "count", appliesToField: "values" },
  ],
  [buildActionKey("google_sheets", "clear_range")]: [
    { key: "explicit_range_required", max: 1, unit: "count", appliesToField: "rangeA1" },
  ],
  [buildActionKey("google_sheets", "get_spreadsheet")]: [],
  [buildActionKey("google_sheets", "preview_sheet")]: [
    { key: "preview_rows", max: 20, unit: "count", appliesToField: "sheetName" },
  ],
  [buildActionKey("google_sheets", "read_table")]: [
    { key: "max_rows", max: 200, unit: "count", appliesToField: "tableRangeA1" },
  ],
  [buildActionKey("google_sheets", "get_headers")]: [
    { key: "header_row_index", max: 100, unit: "count", appliesToField: "headerRowIndex" },
  ],
  [buildActionKey("google_sheets", "find_rows")]: [
    { key: "max_rows", max: 200, unit: "count", appliesToField: "tableRangeA1" },
  ],
  [buildActionKey("google_sheets", "append_records")]: [
    { key: "max_records", max: 100, unit: "count", appliesToField: "records" },
  ],
  [buildActionKey("google_sheets", "update_rows_by_match")]: [
    { key: "max_records", max: 100, unit: "count", appliesToField: "records" },
  ],
  [buildActionKey("google_sheets", "insert_rows")]: [
    { key: "row_count", max: 1000, unit: "count", appliesToField: "rowCount" },
  ],
  [buildActionKey("google_sheets", "insert_columns")]: [
    { key: "column_count", max: 1000, unit: "count", appliesToField: "columnCount" },
  ],
  [buildActionKey("google_sheets", "create_sheet")]: [
    { key: "row_count", max: 20000, unit: "count", appliesToField: "rowCount" },
    { key: "column_count", max: 1000, unit: "count", appliesToField: "columnCount" },
  ],
  [buildActionKey("google_sheets", "rename_sheet")]: [],
  [buildActionKey("google_sheets", "duplicate_sheet")]: [],
  [buildActionKey("google_sheets", "format_range")]: [],
  [buildActionKey("google_sheets", "auto_resize_columns")]: [
    { key: "column_count", max: 1000, unit: "count", appliesToField: "columnCount" },
  ],
  [buildActionKey("google_sheets", "freeze_rows")]: [
    { key: "freeze_count", max: 1000, unit: "count", appliesToField: "count" },
  ],
  [buildActionKey("google_sheets", "freeze_columns")]: [
    { key: "freeze_count", max: 1000, unit: "count", appliesToField: "count" },
  ],
  [buildActionKey("google_sheets", "set_number_format")]: [],
  [buildActionKey("google_sheets", "sort_range")]: [],
  [buildActionKey("google_sheets", "set_basic_filter")]: [],
  [buildActionKey("google_sheets", "clear_basic_filter")]: [],
  [buildActionKey("google_sheets", "set_data_validation")]: [],
  [buildActionKey("google_sheets", "create_named_range")]: [],
  [buildActionKey("google_sheets", "protect_range")]: [],
  [buildActionKey("google_sheets", "create_spreadsheet")]: [],
  [buildActionKey("google_sheets", "copy_spreadsheet")]: [],
  [buildActionKey("google_sheets", "delete_rows")]: [
    { key: "max_rows", max: 200, unit: "count", appliesToField: "tableRangeA1" },
  ],
  [buildActionKey("google_sheets", "delete_columns")]: [
    { key: "column_count", max: 1000, unit: "count", appliesToField: "columnCount" },
  ],
  [buildActionKey("google_sheets", "delete_sheet")]: [],
  [buildActionKey("salesforce", "lookup_records")]: [
    { key: "max_limit", max: 5, unit: "count", appliesToField: "limit" },
  ],
  [buildActionKey("salesforce", "lookup_accounts")]: [
    { key: "max_limit", max: 5, unit: "count", appliesToField: "limit" },
  ],
  [buildActionKey("salesforce", "lookup_opportunities")]: [
    { key: "max_limit", max: 5, unit: "count", appliesToField: "limit" },
  ],
  [buildActionKey("salesforce", "lookup_cases")]: [
    { key: "max_limit", max: 5, unit: "count", appliesToField: "limit" },
  ],
  [buildActionKey("salesforce", "list_leads_recent")]: [
    { key: "max_limit", max: 25, unit: "count", appliesToField: "limit" },
  ],
  [buildActionKey("salesforce", "list_leads_by_status")]: [
    { key: "max_limit", max: 25, unit: "count", appliesToField: "limit" },
  ],
};

const ACTION_SECURITY_GUARDS: Record<
  string,
  NonNullable<WorkflowActionMatrixEntry["securityGuards"]>
> = {
  [buildActionKey("gmail", "search_threads")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("gmail", "read_thread")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("gmail", "create_draft_reply")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("gmail", "create_draft_email")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("gmail", "send_reply")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("gmail", "send_email")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("gmail", "archive_thread")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("gmail", "apply_label")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_calendar", "check_availability")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("google_calendar", "list_events")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("google_calendar", "create_event")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_calendar", "reschedule_event")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_calendar", "cancel_event")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_sheets", "list_sheets")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("google_sheets", "read_range")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("google_sheets", "append_rows")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_sheets", "update_range")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("google_sheets", "clear_range")]: DEFAULT_WRITE_SECURITY_GUARDS,
  ...Object.fromEntries(
    GOOGLE_SHEETS_TOOL_ACTIONS.filter(
      (action) => !["list_sheets", "read_range", "append_rows", "update_range", "clear_range"].includes(action)
    ).map((action) => [
      buildActionKey("google_sheets", action),
      GOOGLE_SHEETS_READ_TOOL_ACTIONS.includes(action as never)
        ? DEFAULT_READ_SECURITY_GUARDS
        : DEFAULT_WRITE_SECURITY_GUARDS,
    ])
  ),
  [buildActionKey("salesforce", "lookup_records")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "list_leads_recent")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "list_leads_by_status")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "lookup_accounts")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "lookup_opportunities")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "lookup_cases")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "summarize_pipeline")]: DEFAULT_READ_SECURITY_GUARDS,
  [buildActionKey("salesforce", "create_task")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "create_lead")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "update_lead")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "create_contact")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "create_case")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "update_case")]: DEFAULT_WRITE_SECURITY_GUARDS,
  [buildActionKey("salesforce", "update_opportunity")]: DEFAULT_WRITE_SECURITY_GUARDS,
};

export function getWorkflowActionMatrixEntry(
  provider: string,
  action: string
): WorkflowActionMatrixEntry {
  const entry =
    ACTION_MATRIX.find(
      (candidate) => candidate.provider === provider && candidate.action === action
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
    };
  const actionKey = buildActionKey(provider, action);

  return {
    ...entry,
    requiredOAuthScopes: entry.requiredOAuthScopes ?? ACTION_REQUIRED_OAUTH_SCOPES[actionKey] ?? [],
    approvalMode: entry.approvalMode ?? (entry.requiresConfirmation ? "always" : "never"),
    operationalLimits: entry.operationalLimits ?? ACTION_OPERATIONAL_LIMITS[actionKey] ?? [],
    securityGuards:
      entry.securityGuards ??
      ACTION_SECURITY_GUARDS[actionKey] ??
      (entry.access === "write" ? DEFAULT_WRITE_SECURITY_GUARDS : DEFAULT_READ_SECURITY_GUARDS),
    failureMode:
      entry.failureMode ??
      (entry.requiresConfirmation ? "approval" : entry.access === "read" ? "deny" : "approval"),
  };
}

export function hasWorkflowActionMatrixEntry(
  provider: string,
  action: string
): boolean {
  return ACTION_MATRIX.some(
    (candidate) => candidate.provider === provider && candidate.action === action
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
