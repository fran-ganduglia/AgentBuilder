import type { ZodIssue } from "zod";
import {
  executeGoogleCalendarReadToolSchema,
  executeGoogleCalendarWriteToolSchema,
  executeGoogleGmailReadToolSchema,
  executeGoogleGmailWriteToolSchema,
  executeGoogleSheetsReadToolSchema,
  executeGoogleSheetsWriteToolSchema,
  isGoogleSheetsReadAction,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
import { buildAssistantContentForPendingChatForm, buildPendingChatFormForTool, isStructuredListField } from "@/lib/tools/tool-call-forms";
import type { ApprovalPolicyConfig } from "@/lib/tools/approval-policy";
import { parseToolName, type ParsedToolName } from "@/lib/tools/tool-name-registry";
import type { PendingChatFormState } from "@/lib/chat/chat-form-state";

type ToolPreparationInput = {
  toolCallId: string;
  toolName: string;
  arguments: string;
  approvalPolicy: ApprovalPolicyConfig;
};

type ToolPreparationBaseResult = {
  toolCallId: string;
};

export type PreparedToolCallExecution =
  | (ToolPreparationBaseResult & {
      kind: "execute_now";
      provider: string;
      surface: string;
      action: string;
      args: Record<string, unknown>;
    })
  | (ToolPreparationBaseResult & {
      kind: "requires_approval";
      provider: string;
      surface: string;
      action: string;
      args: Record<string, unknown>;
    })
  | (ToolPreparationBaseResult & {
      kind: "needs_form";
      provider: string;
      surface: string;
      action: string;
      args: Record<string, unknown>;
      message: string;
      assistantContent: string;
      pendingChatForm: PendingChatFormState;
    })
  | (ToolPreparationBaseResult & {
      kind: "error";
      content: string;
      blocked?: boolean;
    });

function buildErrorResult(
  toolCallId: string,
  error: string
): PreparedToolCallExecution {
  return {
    kind: "error",
    toolCallId,
    content: JSON.stringify({ error }),
  };
}

function parseArgsSafe(argsString: string): Record<string, unknown> | null {
  try {
    return JSON.parse(argsString) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function splitStructuredList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseStructuredMatrix(value: string): string[][] {
  return value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) =>
      row.includes("|")
        ? row.split("|").map((cell) => cell.trim())
        : row.split(",").map((cell) => cell.trim())
    )
    .filter((row) => row.some((cell) => cell.length > 0));
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseNaiveDateTime(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    return null;
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
  ] = match;

  return {
    year: Number.parseInt(year ?? "", 10),
    month: Number.parseInt(month ?? "", 10),
    day: Number.parseInt(day ?? "", 10),
    hour: Number.parseInt(hour ?? "", 10),
    minute: Number.parseInt(minute ?? "", 10),
    second: Number.parseInt(second ?? "0", 10),
  };
}

function formatDateInTimeZone(
  date: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes): number | null => {
      const value = parts.find((part) => part.type === type)?.value;
      if (!value) {
        return null;
      }

      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const year = read("year");
    const month = read("month");
    const day = read("day");
    const hour = read("hour");
    const minute = read("minute");
    const second = read("second");

    if (
      year === null ||
      month === null ||
      day === null ||
      hour === null ||
      minute === null ||
      second === null
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
    };
  } catch {
    return null;
  }
}

function normalizeCalendarDateTime(
  value: string,
  timeZone: string | null
): string {
  if (!timeZone) {
    return value;
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const parsed = parseNaiveDateTime(value);
  if (!parsed) {
    return value;
  }

  const desiredUtcMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second
  );

  let candidateMs = desiredUtcMs;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const rendered = formatDateInTimeZone(new Date(candidateMs), timeZone);
    if (!rendered) {
      return value;
    }

    const renderedUtcMs = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second
    );

    const diffMs = desiredUtcMs - renderedUtcMs;
    if (diffMs === 0) {
      return new Date(candidateMs).toISOString();
    }

    candidateMs += diffMs;
  }

  const normalized = new Date(candidateMs).toISOString();
  return Number.isNaN(new Date(normalized).getTime()) ? value : normalized;
}

function normalizeRawArgs(
  parsed: ParsedToolName,
  rawArgs: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const timeZone =
    typeof rawArgs.timezone === "string" && rawArgs.timezone.trim().length > 0
      ? rawArgs.timezone.trim()
      : typeof rawArgs.eventTimezone === "string" &&
          rawArgs.eventTimezone.trim().length > 0
        ? rawArgs.eventTimezone.trim()
        : null;

  for (const [key, rawValue] of Object.entries(rawArgs)) {
    if (key.includes(".")) {
      const [parentKey, childKey] = key.split(".", 2);
      const parentValue =
        next[parentKey] && typeof next[parentKey] === "object" && !Array.isArray(next[parentKey])
          ? { ...(next[parentKey] as Record<string, unknown>) }
          : {};
      parentValue[childKey] = rawValue;
      next[parentKey] = parentValue;
      continue;
    }

    if (rawValue === "") {
      continue;
    }

    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (trimmed.length === 0) {
        continue;
      }

      if (key === "values") {
        const matrix = parseStructuredMatrix(trimmed);
        next[key] = matrix.length > 0 ? matrix : trimmed;
        continue;
      }

      if (["records", "match", "format", "rule", "sortSpecs"].includes(key)) {
        next[key] = parseJsonObject(trimmed);
        continue;
      }

      if (isStructuredListField(key)) {
        const list = splitStructuredList(trimmed);
        next[key] = list.length > 0 ? list : trimmed;
        continue;
      }

      if (
        [
          "maxResults",
          "slotMinutes",
          "limit",
          "headerRowIndex",
          "startRowIndex",
          "rowCount",
          "startColumnIndex",
          "columnCount",
          "count",
        ].includes(key)
      ) {
        const numeric = Number.parseInt(trimmed, 10);
        next[key] = Number.isFinite(numeric) ? numeric : trimmed;
        continue;
      }

      if (key === "warningOnly") {
        if (trimmed === "true" || trimmed === "false") {
          next[key] = trimmed === "true";
          continue;
        }
      }

      if (
        parsed.provider === "google" &&
        parsed.surface === "google_calendar" &&
        ["startIso", "endIso", "eventStartIso", "eventEndIso"].includes(key)
      ) {
        next[key] = normalizeCalendarDateTime(trimmed, timeZone);
        continue;
      }

      if (key === "amount") {
        const numeric = Number.parseFloat(trimmed);
        next[key] = Number.isFinite(numeric) ? numeric : trimmed;
        continue;
      }

      next[key] = trimmed;
      continue;
    }

    if (Array.isArray(rawValue) && key === "values") {
      next[key] = rawValue;
      continue;
    }

    next[key] = rawValue;
  }

  if (
    parsed.provider === "google" &&
    parsed.surface === "google_sheets" &&
    next.match &&
    typeof next.match === "object" &&
    !Array.isArray(next.match)
  ) {
    next.match = {
      operator: "equals",
      ...(next.match as Record<string, unknown>),
    };
  }

  next.action = parsed.action;
  return next;
}

function validateArgs(
  parsed: ParsedToolName,
  args: Record<string, unknown>
): { success: true; data: Record<string, unknown> } | { success: false; issues: ZodIssue[] } {
  let parsedResult;

  if (parsed.provider === "google" && parsed.surface === "gmail") {
    parsedResult =
      parsed.action === "search_threads" || parsed.action === "read_thread"
        ? executeGoogleGmailReadToolSchema.safeParse(args)
        : executeGoogleGmailWriteToolSchema.safeParse(args);
  } else if (parsed.provider === "google" && parsed.surface === "google_calendar") {
    parsedResult =
      parsed.action === "check_availability" || parsed.action === "list_events"
        ? executeGoogleCalendarReadToolSchema.safeParse(args)
        : executeGoogleCalendarWriteToolSchema.safeParse(args);
  } else if (parsed.provider === "google" && parsed.surface === "google_sheets") {
    parsedResult =
      isGoogleSheetsReadAction(parsed.action as GoogleSheetsToolAction)
        ? executeGoogleSheetsReadToolSchema.safeParse(args)
        : executeGoogleSheetsWriteToolSchema.safeParse(args);
  } else if (parsed.provider === "salesforce" && parsed.surface === "salesforce") {
    parsedResult = executeSalesforceCrmToolSchema.safeParse(args);
  } else {
    return {
      success: false,
      issues: [{ code: "custom", message: `Tool no soportada: ${parsed.surface}.${parsed.action}`, path: [] }],
    };
  }

  if (!parsedResult.success) {
    return { success: false, issues: parsedResult.error.issues };
  }

  return { success: true, data: parsedResult.data as Record<string, unknown> };
}

function buildValidationMessage(issues: ZodIssue[]): string {
  const firstIssue = issues[0];
  if (!firstIssue) {
    return "Faltan datos para ejecutar la accion.";
  }

  return firstIssue.message;
}

export function prepareToolCallExecution(
  input: ToolPreparationInput
): PreparedToolCallExecution {
  const parsed = parseToolName(input.toolName);
  if (!parsed) {
    return buildErrorResult(input.toolCallId, `Tool desconocida: ${input.toolName}`);
  }

  const rawArgs = parseArgsSafe(input.arguments);
  if (!rawArgs) {
    return buildErrorResult(input.toolCallId, "Los argumentos no son JSON valido.");
  }

  const normalizedArgs = normalizeRawArgs(parsed, rawArgs);
  const validation = validateArgs(parsed, normalizedArgs);

  if (!validation.success) {
    const pendingChatForm = buildPendingChatFormForTool({
      toolName: input.toolName,
      parsed,
      args: normalizedArgs,
    });

    if (pendingChatForm) {
      return {
        kind: "needs_form",
        toolCallId: input.toolCallId,
        provider: parsed.provider,
        surface: parsed.surface,
        action: parsed.action,
        args: normalizedArgs,
        message: buildValidationMessage(validation.issues),
        assistantContent: buildAssistantContentForPendingChatForm(pendingChatForm),
        pendingChatForm,
      };
    }

    return buildErrorResult(input.toolCallId, buildValidationMessage(validation.issues));
  }

  if (
    input.approvalPolicy.requireApproval(
      parsed.provider,
      parsed.surface,
      parsed.action
    )
  ) {
    return {
      kind: "requires_approval",
      toolCallId: input.toolCallId,
      provider: parsed.provider,
      surface: parsed.surface,
      action: parsed.action,
      args: validation.data,
    };
  }

  return {
    kind: "execute_now",
    toolCallId: input.toolCallId,
    provider: parsed.provider,
    surface: parsed.surface,
    action: parsed.action,
    args: validation.data,
  };
}
