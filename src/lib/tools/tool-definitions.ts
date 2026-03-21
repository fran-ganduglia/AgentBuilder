import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { ToolDefinition } from "@/lib/llm/litellm-types";
import type { Tables } from "@/types/database";
import {
  type GmailAgentToolConfig,
  type GmailToolAction,
  getGmailActionDescription,
  executeGoogleGmailSearchThreadsSchema,
  executeGoogleGmailReadThreadSchema,
  executeGoogleGmailCreateDraftReplySchema,
  executeGoogleGmailSendReplySchema,
  executeGoogleGmailCreateDraftEmailSchema,
  executeGoogleGmailSendEmailSchema,
  executeGoogleGmailArchiveThreadSchema,
  executeGoogleGmailApplyLabelSchema,
  executeGoogleGmailMarkAsReadSchema,
  executeGoogleGmailMarkAsUnreadSchema,
  executeGoogleGmailStarThreadSchema,
  executeGoogleGmailUnstarThreadSchema,
  executeGoogleGmailRemoveLabelSchema,
  executeGoogleGmailForwardThreadSchema,
} from "@/lib/integrations/google-agent-tools";
import {
  type GoogleCalendarAgentToolConfig,
  type GoogleCalendarToolAction,
  getGoogleCalendarActionDescription,
  executeGoogleCalendarCheckAvailabilitySchema,
  executeGoogleCalendarListEventsSchema,
  executeGoogleCalendarGetEventDetailsSchema,
  executeGoogleCalendarCreateEventSchema,
  executeGoogleCalendarRescheduleEventSchema,
  executeGoogleCalendarCancelEventSchema,
  executeGoogleCalendarUpdateEventDetailsSchema,
} from "@/lib/integrations/google-agent-tools";
import {
  type GoogleSheetsAgentToolConfig,
  type GoogleSheetsToolAction,
  getGoogleSheetsActionDescription,
  executeGoogleSheetsListSheetsSchema,
  executeGoogleSheetsReadRangeSchema,
  executeGoogleSheetsGetSpreadsheetSchema,
  executeGoogleSheetsPreviewSheetSchema,
  executeGoogleSheetsReadTableSchema,
  executeGoogleSheetsGetHeadersSchema,
  executeGoogleSheetsFindRowsSchema,
  executeGoogleSheetsAppendRowsSchema,
  executeGoogleSheetsUpdateRangeSchema,
  executeGoogleSheetsClearRangeSchema,
  executeGoogleSheetsAppendRecordsSchema,
  executeGoogleSheetsUpdateRowsByMatchSchema,
  executeGoogleSheetsInsertRowsSchema,
  executeGoogleSheetsInsertColumnsSchema,
  executeGoogleSheetsCreateSheetSchema,
  executeGoogleSheetsRenameSheetSchema,
  executeGoogleSheetsDuplicateSheetSchema,
  executeGoogleSheetsFormatRangeSchema,
  executeGoogleSheetsAutoResizeColumnsSchema,
  executeGoogleSheetsFreezeRowsSchema,
  executeGoogleSheetsFreezeColumnsSchema,
  executeGoogleSheetsSetNumberFormatSchema,
  executeGoogleSheetsSortRangeSchema,
  executeGoogleSheetsSetBasicFilterSchema,
  executeGoogleSheetsClearBasicFilterSchema,
  executeGoogleSheetsSetDataValidationSchema,
  executeGoogleSheetsCreateNamedRangeSchema,
  executeGoogleSheetsProtectRangeSchema,
  executeGoogleSheetsCreateSpreadsheetSchema,
  executeGoogleSheetsCopySpreadsheetSchema,
  executeGoogleSheetsDeleteRowsSchema,
  executeGoogleSheetsDeleteColumnsSchema,
  executeGoogleSheetsDeleteSheetSchema,
} from "@/lib/integrations/google-agent-tools";
import {
  type SalesforceAgentToolConfig,
  type SalesforceCrmAction,
  getSalesforceActionDescription,
} from "@/lib/integrations/salesforce-tools";
import {
  parseSalesforceAgentToolConfig,
} from "@/lib/integrations/salesforce-tools";
import {
  parseGmailAgentToolConfig,
  parseGoogleCalendarAgentToolConfig,
  parseGoogleSheetsAgentToolConfig,
} from "@/lib/integrations/google-agent-tools";
import type { Json } from "@/types/database";
import { buildToolName } from "@/lib/tools/tool-name-registry";

type AgentToolRow = Tables<"agent_tools">;
type ToolSchemaExposure = "full" | "llm_compact";
type BuildToolDefinitionOptions = {
  exposure?: ToolSchemaExposure;
};

function compactJsonSchema(
  value: unknown,
  parentKey?: string
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => compactJsonSchema(entry, parentKey));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (
      key === "$schema" ||
      key === "$ref" ||
      key === "definitions" ||
      key === "title" ||
      key === "default" ||
      key === "examples" ||
      key === "example"
    ) {
      continue;
    }

    if (key === "description") {
      if (parentKey === undefined) {
        continue;
      }

      continue;
    }

    const compacted = compactJsonSchema(entry, key);
    if (compacted !== undefined) {
      next[key] = compacted;
    }
  }

  return next;
}

function zodToParams(
  schema: z.ZodType,
  exposure: ToolSchemaExposure = "full"
): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  const result = (
    exposure === "llm_compact"
      ? compactJsonSchema(jsonSchema)
      : { ...jsonSchema }
  ) as Record<string, unknown>;

  if (result.properties && typeof result.properties === "object") {
    const props = result.properties as Record<string, Record<string, unknown>>;
    delete props["action"];

    if (Array.isArray(result.required)) {
      result.required = (result.required as string[]).filter((key) => key !== "action");
      if ((result.required as string[]).length === 0) {
        delete result.required;
      }
    }
  }

  return result;
}

const GMAIL_ACTION_SCHEMAS: Record<GmailToolAction, z.ZodType> = {
  search_threads: executeGoogleGmailSearchThreadsSchema,
  read_thread: executeGoogleGmailReadThreadSchema,
  create_draft_reply: executeGoogleGmailCreateDraftReplySchema,
  send_reply: executeGoogleGmailSendReplySchema,
  create_draft_email: executeGoogleGmailCreateDraftEmailSchema,
  send_email: executeGoogleGmailSendEmailSchema,
  archive_thread: executeGoogleGmailArchiveThreadSchema,
  apply_label: executeGoogleGmailApplyLabelSchema,
  mark_as_read: executeGoogleGmailMarkAsReadSchema,
  mark_as_unread: executeGoogleGmailMarkAsUnreadSchema,
  star_thread: executeGoogleGmailStarThreadSchema,
  unstar_thread: executeGoogleGmailUnstarThreadSchema,
  remove_label: executeGoogleGmailRemoveLabelSchema,
  forward_thread: executeGoogleGmailForwardThreadSchema,
};

const GOOGLE_CALENDAR_ACTION_SCHEMAS: Record<GoogleCalendarToolAction, z.ZodType> = {
  check_availability: executeGoogleCalendarCheckAvailabilitySchema,
  list_events: executeGoogleCalendarListEventsSchema,
  get_event_details: executeGoogleCalendarGetEventDetailsSchema,
  create_event: executeGoogleCalendarCreateEventSchema,
  reschedule_event: executeGoogleCalendarRescheduleEventSchema,
  cancel_event: executeGoogleCalendarCancelEventSchema,
  update_event_details: executeGoogleCalendarUpdateEventDetailsSchema,
};

const GOOGLE_SHEETS_ACTION_SCHEMAS: Record<GoogleSheetsToolAction, z.ZodType> = {
  list_sheets: executeGoogleSheetsListSheetsSchema,
  read_range: executeGoogleSheetsReadRangeSchema,
  get_spreadsheet: executeGoogleSheetsGetSpreadsheetSchema,
  preview_sheet: executeGoogleSheetsPreviewSheetSchema,
  read_table: executeGoogleSheetsReadTableSchema,
  get_headers: executeGoogleSheetsGetHeadersSchema,
  find_rows: executeGoogleSheetsFindRowsSchema,
  append_rows: executeGoogleSheetsAppendRowsSchema,
  update_range: executeGoogleSheetsUpdateRangeSchema,
  clear_range: executeGoogleSheetsClearRangeSchema,
  append_records: executeGoogleSheetsAppendRecordsSchema,
  update_rows_by_match: executeGoogleSheetsUpdateRowsByMatchSchema,
  insert_rows: executeGoogleSheetsInsertRowsSchema,
  insert_columns: executeGoogleSheetsInsertColumnsSchema,
  create_sheet: executeGoogleSheetsCreateSheetSchema,
  rename_sheet: executeGoogleSheetsRenameSheetSchema,
  duplicate_sheet: executeGoogleSheetsDuplicateSheetSchema,
  format_range: executeGoogleSheetsFormatRangeSchema,
  auto_resize_columns: executeGoogleSheetsAutoResizeColumnsSchema,
  freeze_rows: executeGoogleSheetsFreezeRowsSchema,
  freeze_columns: executeGoogleSheetsFreezeColumnsSchema,
  set_number_format: executeGoogleSheetsSetNumberFormatSchema,
  sort_range: executeGoogleSheetsSortRangeSchema,
  set_basic_filter: executeGoogleSheetsSetBasicFilterSchema,
  clear_basic_filter: executeGoogleSheetsClearBasicFilterSchema,
  set_data_validation: executeGoogleSheetsSetDataValidationSchema,
  create_named_range: executeGoogleSheetsCreateNamedRangeSchema,
  protect_range: executeGoogleSheetsProtectRangeSchema,
  create_spreadsheet: executeGoogleSheetsCreateSpreadsheetSchema,
  copy_spreadsheet: executeGoogleSheetsCopySpreadsheetSchema,
  delete_rows: executeGoogleSheetsDeleteRowsSchema,
  delete_columns: executeGoogleSheetsDeleteColumnsSchema,
  delete_sheet: executeGoogleSheetsDeleteSheetSchema,
};

function buildDefinition(
  surface: string,
  action: string,
  description: string,
  schema: z.ZodType,
  options?: BuildToolDefinitionOptions
): ToolDefinition {
  const exposure = options?.exposure ?? "full";
  return {
    type: "function",
    function: {
      name: buildToolName(surface, action),
      description: exposure === "llm_compact" ? `${surface}.${action}` : description,
      parameters: zodToParams(schema, exposure),
    },
  };
}

export function buildGmailToolDefinitions(
  config: GmailAgentToolConfig,
  options?: BuildToolDefinitionOptions
): ToolDefinition[] {
  return config.allowed_actions.map((action) =>
    buildDefinition(
      "gmail",
      action,
      getGmailActionDescription(action),
      GMAIL_ACTION_SCHEMAS[action],
      options
    )
  );
}

export function buildGoogleCalendarToolDefinitions(
  config: GoogleCalendarAgentToolConfig,
  options?: BuildToolDefinitionOptions
): ToolDefinition[] {
  return config.allowed_actions.map((action) =>
    buildDefinition(
      "google_calendar",
      action,
      getGoogleCalendarActionDescription(action),
      GOOGLE_CALENDAR_ACTION_SCHEMAS[action],
      options
    )
  );
}

export function buildGoogleSheetsToolDefinitions(
  config: GoogleSheetsAgentToolConfig,
  options?: BuildToolDefinitionOptions
): ToolDefinition[] {
  return config.allowed_actions.map((action) =>
    buildDefinition(
      "google_sheets",
      action,
      getGoogleSheetsActionDescription(action),
      GOOGLE_SHEETS_ACTION_SCHEMAS[action],
      options
    )
  );
}

// Salesforce doesn't have per-action Zod schemas split the same way,
// so we build lightweight definitions with descriptions only.
// The full schema validation happens at execution time.
export const SALESFORCE_ACTION_PARAM_HINTS: Record<SalesforceCrmAction, Record<string, unknown>> = {
  lookup_records: { type: "object", properties: { query: { type: "string", description: "Texto libre para buscar leads y contactos" }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
  list_leads_recent: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 25 }, createdAfter: { type: "string", description: "Fecha YYYY-MM-DD" } } },
  list_leads_by_status: { type: "object", properties: { status: { type: "string", description: "Status exacto del lead" }, limit: { type: "integer", minimum: 1, maximum: 25 } }, required: ["status"] },
  lookup_accounts: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
  lookup_opportunities: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
  lookup_cases: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
  summarize_pipeline: { type: "object", properties: {} },
  create_task: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, whoId: { type: "string" }, whatId: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, dueDate: { type: "string", description: "YYYY-MM-DD" } }, required: ["subject"] },
  create_lead: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, company: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, description: { type: "string" } }, required: ["lastName", "company"] },
  update_lead: { type: "object", properties: { leadId: { type: "string" }, status: { type: "string" }, rating: { type: "string" }, description: { type: "string" } }, required: ["leadId"] },
  create_contact: { type: "object", properties: { lastName: { type: "string" }, firstName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, title: { type: "string" }, accountId: { type: "string" }, accountName: { type: "string" } }, required: ["lastName"] },
  create_case: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, origin: { type: "string" }, contactId: { type: "string" }, accountId: { type: "string" } }, required: ["subject"] },
  update_case: { type: "object", properties: { caseId: { type: "string" }, subject: { type: "string" }, description: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, ownerId: { type: "string" } }, required: ["caseId"] },
  update_opportunity: { type: "object", properties: { opportunityId: { type: "string" }, stageName: { type: "string" }, amount: { type: "number" }, closeDate: { type: "string" }, nextStep: { type: "string" }, description: { type: "string" } }, required: ["opportunityId"] },
  update_contact: { type: "object", properties: { contactId: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, title: { type: "string" }, accountId: { type: "string" } }, required: ["contactId"] },
  update_account: { type: "object", properties: { accountId: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, website: { type: "string" }, industry: { type: "string" }, description: { type: "string" } }, required: ["accountId"] },
  create_opportunity: { type: "object", properties: { name: { type: "string" }, stageName: { type: "string" }, closeDate: { type: "string", description: "YYYY-MM-DD" }, accountId: { type: "string" }, amount: { type: "number" }, description: { type: "string" }, type: { type: "string" } }, required: ["name", "stageName", "closeDate"] },
  create_account: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, website: { type: "string" }, industry: { type: "string" }, description: { type: "string" }, billingCity: { type: "string" }, billingState: { type: "string" }, billingCountry: { type: "string" } }, required: ["name"] },
  create_opportunity_contact_role: { type: "object", properties: { opportunityId: { type: "string" }, contactId: { type: "string" }, role: { type: "string" } }, required: ["opportunityId", "contactId"] },
};

export function buildSalesforceToolDefinitions(
  config: SalesforceAgentToolConfig,
  options?: BuildToolDefinitionOptions
): ToolDefinition[] {
  const exposure = options?.exposure ?? "full";
  return config.allowed_actions.map((action) => ({
    type: "function" as const,
    function: {
      name: buildToolName("salesforce", action),
      description: exposure === "llm_compact" ? `salesforce.${action}` : getSalesforceActionDescription(action),
      parameters: exposure === "llm_compact"
        ? compactJsonSchema(SALESFORCE_ACTION_PARAM_HINTS[action]) as Record<string, unknown>
        : SALESFORCE_ACTION_PARAM_HINTS[action],
    },
  }));
}

export function buildAgentToolDefinitions(
  agentTools: AgentToolRow[],
  options?: BuildToolDefinitionOptions
): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];

  for (const tool of agentTools) {
    const config = tool.config as Record<string, unknown> | null;
    if (!config) {
      continue;
    }

    const surface = config.surface as string | undefined;
    const provider = config.provider as string | undefined;

    const jsonConfig = config as Json;

    if (provider === "google" && surface === "gmail") {
      const parsed = parseGmailAgentToolConfig(jsonConfig);
      if (parsed) {
        definitions.push(...buildGmailToolDefinitions(parsed, options));
      }
    } else if (provider === "google" && surface === "google_calendar") {
      const parsed = parseGoogleCalendarAgentToolConfig(jsonConfig);
      if (parsed) {
        definitions.push(...buildGoogleCalendarToolDefinitions(parsed, options));
      }
    } else if (provider === "google" && surface === "google_sheets") {
      const parsed = parseGoogleSheetsAgentToolConfig(jsonConfig);
      if (parsed) {
        definitions.push(...buildGoogleSheetsToolDefinitions(parsed, options));
      }
    } else if (provider === "salesforce") {
      const parsed = parseSalesforceAgentToolConfig(jsonConfig);
      if (parsed) {
        definitions.push(...buildSalesforceToolDefinitions(parsed, options));
      }
    }
  }

  return definitions;
}
