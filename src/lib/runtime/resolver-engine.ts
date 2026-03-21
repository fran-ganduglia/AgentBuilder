import {
  readRecentActionContext,
  readRecentSalesforceToolContext,
} from "@/lib/chat/conversation-metadata";
import {
  getActionDefinitionV1,
  type RuntimeParamContractV1,
} from "@/lib/runtime/action-catalog";
import type {
  ExecutionContextV1,
  NodeResultV1,
  ParamValueV1,
  ResolverResultV1,
  ResolverSourceV1,
  RuntimeActionType,
  RuntimeActionV1,
  RuntimeNodeHandlerV1,
  RuntimeResolutionSummaryV1,
} from "@/lib/runtime/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};
const RESOLUTION_STAGE_ORDER = [
  "explicit_payload",
  "conversation_context",
  "db",
  "integration",
  "deterministic",
  "llm",
] as const;

export type RuntimeResolverStageV1 =
  (typeof RESOLUTION_STAGE_ORDER)[number];
export type RuntimeResolverFamilyV1 =
  | "entityResolvers"
  | "referenceResolvers"
  | "timeResolvers"
  | "computedResolvers"
  | "llmResolvers";
export type RuntimeResolverCriticalityV1 = "critical" | "non_critical";

type RuntimeResolverStatusV1 =
  | "resolved"
  | "ambiguous"
  | "missing"
  | "blocked"
  | "use_llm";

type RuntimeResolverStepResultV1 = {
  status: RuntimeResolverStatusV1;
  resolvedParam?: ParamValueV1;
  reason?: string;
  source?: ResolverSourceV1;
  output?: Record<string, unknown>;
};

export type RuntimeResolverLookupResultV1 =
  | ParamValueV1
  | {
      status: Exclude<RuntimeResolverStatusV1, "use_llm">;
      resolvedParam?: ParamValueV1;
      reason?: string;
      output?: Record<string, unknown>;
    };

export type RuntimeParamResolverInputV1 = {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  paramKey: string;
  param: ParamValueV1;
  paramContract: RuntimeParamContractV1 | null;
  resourceFamily: string;
  criticality: RuntimeResolverCriticalityV1;
  resolvedParams: Record<string, ParamValueV1>;
  deps: RuntimeResolverEngineDepsV1;
};

export type RuntimeRegisteredResolverV1 = {
  id: string;
  family: RuntimeResolverFamilyV1;
  stage: RuntimeResolverStageV1;
  priority: number;
  criticality?: RuntimeResolverCriticalityV1;
  actionTypes?: RuntimeActionType[];
  paramKinds?: ParamValueV1["kind"][];
  resourceFamilies?: string[];
  canResolve?: (
    input: RuntimeParamResolverInputV1
  ) => Promise<boolean> | boolean;
  resolve: (
    input: RuntimeParamResolverInputV1
  ) => Promise<RuntimeResolverStepResultV1> | RuntimeResolverStepResultV1;
};

export type RuntimeResolverRegistryV1 = RuntimeRegisteredResolverV1[];

export type RuntimeResolverEngineDepsV1 = {
  now?: () => Date;
  getDefaultTimezone?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => Promise<string | null> | string | null;
  readLocalMetadata?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    paramKey: string;
    param: ParamValueV1;
  }) => Promise<ParamValueV1 | null> | ParamValueV1 | null;
  readIntegrationValue?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    paramKey: string;
    param: ParamValueV1;
  }) => Promise<RuntimeResolverLookupResultV1 | null> | RuntimeResolverLookupResultV1 | null;
  requestLlmRepair?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    paramKey: string;
    param: ParamValueV1;
    resolvedParams: Record<string, ParamValueV1>;
  }) => Promise<ParamValueV1 | null> | ParamValueV1 | null;
};

export type ResolveActionResultV1 = {
  status: ResolverResultV1["status"];
  action: RuntimeActionV1;
  reason?: string;
  resolvedParams: Record<string, ParamValueV1>;
  results: ResolverResultV1[];
  output: RuntimeResolutionSummaryV1;
};

type PrimitiveParamValueLike = Exclude<
  Extract<ParamValueV1, { kind: "primitive" }>["value"],
  undefined
>;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isValidTimezone(value: string | null | undefined): value is string {
  if (!value || value.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isThreadAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ultimo hilo" ||
    normalized === "el ultimo hilo" ||
    normalized === "ultmo hilo" ||
    normalized === "ese hilo" ||
    normalized === "ultimo email" ||
    normalized === "el ultimo email" ||
    normalized === "ese email";
}

function isLatestThreadAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ultimo hilo" ||
    normalized === "el ultimo hilo" ||
    normalized === "ultimo email" ||
    normalized === "el ultimo email";
}

function isEventAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ultimo evento" ||
    normalized === "el ultimo evento" ||
    normalized.includes("ultimo evento que listaste") ||
    normalized === "ese evento" ||
    normalized === "esta reunion" ||
    normalized === "esa reunion" ||
    normalized === "ultima reunion" ||
    normalized.includes("ultima reunion que listaste") ||
    normalized === "la reunion";
}

function isLastEventAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ultimo evento" ||
    normalized === "el ultimo evento" ||
    normalized.includes("ultimo evento que listaste") ||
    normalized === "ultima reunion" ||
    normalized.includes("ultima reunion que listaste");
}

function isSheetAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ultima hoja" ||
    normalized === "esa hoja" ||
    normalized === "esa planilla" ||
    normalized === "la planilla";
}

function isRangeAlias(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "ese rango" ||
    normalized === "ultimo rango";
}

function hasPrimitiveContent(value: PrimitiveParamValueLike): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (value === null) {
    return false;
  }

  return value.length > 0;
}

function getPrimitiveStrings(value: ParamValueV1): string[] {
  if (value.kind !== "primitive") {
    return [];
  }

  if (typeof value.value === "string") {
    return value.value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(value.value)) {
    return value.value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function hasResolvedLiteralEmail(param: ParamValueV1 | undefined): boolean {
  const values = getPrimitiveStrings(param ?? { kind: "unknown" });
  return values.length > 0 && values.every((value) => EMAIL_REGEX.test(value));
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getWeekdayInTimezone(date: Date, timezone: string): number {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}

function parseTimePortion(value: string): { hours: string; minutes: string } | null {
  const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
}

function parseExplicitDate(value: string): string | null {
  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return null;
}

function parseRelativeDate(value: string, timezone: string, now: Date): string | null {
  const normalized = normalizeText(value);

  if (normalized.includes("pasado manana")) {
    return formatDateInTimezone(addDays(now, 2), timezone);
  }

  if (normalized.includes("manana")) {
    return formatDateInTimezone(addDays(now, 1), timezone);
  }

  if (normalized.includes("hoy")) {
    return formatDateInTimezone(now, timezone);
  }

  const weekdayToken = Object.keys(WEEKDAY_INDEX).find((candidate) => normalized.includes(candidate));
  if (!weekdayToken) {
    return null;
  }

  const targetDay = WEEKDAY_INDEX[weekdayToken];
  const currentDay = getWeekdayInTimezone(now, timezone);
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }

  return formatDateInTimezone(addDays(now, delta), timezone);
}

async function resolveDefaultTimezone(
  input: Pick<RuntimeParamResolverInputV1, "ctx" | "action"> & {
    deps: RuntimeResolverEngineDepsV1;
  }
): Promise<string> {
  if (isValidTimezone(input.ctx.timezone)) {
    return input.ctx.timezone;
  }

  const timezone = await input.deps.getDefaultTimezone?.({
    ctx: input.ctx,
    action: input.action,
  });

  return isValidTimezone(timezone) ? timezone : "UTC";
}

function inferResourceFamily(
  paramKey: string,
  param: ParamValueV1,
  paramContract: RuntimeParamContractV1 | null
): string {
  if (paramContract?.resourceFamily) {
    return paramContract.resourceFamily;
  }

  if (param.kind === "reference") {
    return param.refType;
  }

  if (param.kind === "entity") {
    return param.entityType;
  }

  if (param.kind === "time") {
    return param.granularity ?? "datetime";
  }

  if (paramKey.endsWith("Ref")) {
    return normalizeText(paramKey.replace(/Ref$/, ""));
  }

  if (["to", "cc", "bcc", "attendees", "email"].includes(paramKey)) {
    return "recipient";
  }

  if (["body", "description", "reason"].includes(paramKey)) {
    return "body";
  }

  if (["title", "subject", "location", "status", "priority", "company", "lastName", "firstName", "phone"].includes(paramKey)) {
    return "text";
  }

  if (["start", "end", "windowStart", "windowEnd"].includes(paramKey)) {
    return "datetime";
  }

  if (paramKey === "dueDate") {
    return "date";
  }

  return paramKey;
}

function inferCriticality(
  paramKey: string,
  action: RuntimeActionV1,
  paramContract: RuntimeParamContractV1 | null
): RuntimeResolverCriticalityV1 {
  if (paramContract?.criticality) {
    return paramContract.criticality;
  }

  return getActionDefinitionV1(action.type).input.minimum.includes(paramKey)
    ? "critical"
    : "non_critical";
}

function normalizeResolvedParam(value: ParamValueV1): ParamValueV1 | null {
  if (value.kind === "primitive" && !hasPrimitiveContent(value.value)) {
    return null;
  }

  if (value.kind === "reference" && value.value.trim().length === 0) {
    return null;
  }

  if (value.kind === "entity" && value.value.trim().length === 0) {
    return null;
  }

  if (value.kind === "time" && value.value.trim().length === 0) {
    return null;
  }

  if (value.kind === "computed") {
    return value;
  }

  return value.kind === "unknown" ? null : value;
}

function normalizeLookupResult(
  value: RuntimeResolverLookupResultV1 | null | undefined
): RuntimeResolverStepResultV1 | null {
  if (!value) {
    return null;
  }

  if ("kind" in value) {
    const normalizedParam = normalizeResolvedParam(value);
    if (!normalizedParam) {
      return null;
    }

    return {
      status: "resolved",
      resolvedParam: normalizedParam,
    };
  }

  if (value.status === "resolved") {
    const normalizedParam = value.resolvedParam
      ? normalizeResolvedParam(value.resolvedParam)
      : null;

    if (!normalizedParam) {
      return {
        status: "missing",
        reason: value.reason,
        output: value.output,
      };
    }

    return {
      status: "resolved",
      resolvedParam: normalizedParam,
      reason: value.reason,
      output: value.output,
    };
  }

  return {
    status: value.status,
    reason: value.reason,
    output: value.output,
  };
}

function getRecentThreadCandidates(ctx: ExecutionContextV1): Array<{
  threadId: string;
  label?: string;
}> {
  const recentContext = readRecentActionContext(
    ctx.conversationMetadata as never
  );

  if (!recentContext) {
    return [];
  }

  const candidates: Array<{ threadId: string; label?: string }> = [];

  for (const snapshot of [...recentContext.actions].reverse()) {
    if (snapshot.result.kind === "gmail_read_thread") {
      candidates.push({
        threadId: snapshot.result.threadId,
        label: snapshot.result.subject ?? undefined,
      });
      continue;
    }

    if (snapshot.result.kind === "gmail_search_threads") {
      for (const thread of snapshot.result.threads) {
        candidates.push({
          threadId: thread.threadId,
          label: thread.subject ?? undefined,
        });
      }
    }
  }

  return candidates;
}

function getRecentEventCandidates(ctx: ExecutionContextV1): Array<{
  eventId: string;
  label?: string;
}> {
  const recentContext = readRecentActionContext(
    ctx.conversationMetadata as never
  );

  if (!recentContext) {
    return [];
  }

  const recentListSnapshot = [...recentContext.actions]
    .reverse()
    .find((snapshot) => snapshot.result.kind === "google_calendar_list_events");

  if (recentListSnapshot?.result.kind !== "google_calendar_list_events") {
    return [];
  }

  return recentListSnapshot.result.events
    .filter((event) => typeof event.id === "string" && event.id.trim().length > 0)
    .map((event) => ({
      eventId: event.id as string,
      label: event.title ?? undefined,
    }));
}

function getRecentSheetSnapshot(ctx: ExecutionContextV1): {
  spreadsheetId?: string;
  spreadsheetTitle?: string | null;
  sheetName?: string | null;
  rangeA1?: string | null;
} | null {
  const recentContext = readRecentActionContext(
    ctx.conversationMetadata as never
  );

  if (!recentContext) {
    return null;
  }

  for (const snapshot of [...recentContext.actions].reverse()) {
    if (snapshot.result.kind === "google_sheets_read_range") {
      return {
        spreadsheetId: snapshot.result.spreadsheetId,
        spreadsheetTitle: snapshot.result.spreadsheetTitle,
        sheetName: snapshot.result.sheetName,
        rangeA1: snapshot.result.rangeA1,
      };
    }

    if (snapshot.result.kind === "google_sheets_list_sheets") {
      return {
        spreadsheetId: snapshot.result.spreadsheetId,
        spreadsheetTitle: snapshot.result.spreadsheetTitle,
        sheetName: snapshot.result.sheets[0]?.title ?? null,
      };
    }
  }

  return null;
}

function readRequestedLlmFields(ctx: ExecutionContextV1): Set<string> {
  const requested = new Set<string>();

  if (ctx.messageMetadata.runtime_body_repair_requested === true) {
    requested.add("body");
  }

  const explicitFields = ctx.messageMetadata.runtime_llm_repair_fields;
  if (Array.isArray(explicitFields)) {
    for (const field of explicitFields) {
      if (typeof field === "string" && field.trim().length > 0) {
        requested.add(field.trim());
      }
    }
  }

  return requested;
}

function selectResolvers(
  input: RuntimeParamResolverInputV1,
  registry: RuntimeResolverRegistryV1
): RuntimeResolverRegistryV1 {
  return registry
    .filter((resolver) => {
      if (resolver.actionTypes && !resolver.actionTypes.includes(input.action.type)) {
        return false;
      }

      if (resolver.paramKinds && !resolver.paramKinds.includes(input.param.kind)) {
        return false;
      }

      if (resolver.resourceFamilies &&
        !resolver.resourceFamilies.includes(input.resourceFamily)) {
        return false;
      }

      if (resolver.criticality && resolver.criticality !== input.criticality) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const stageDelta =
        RESOLUTION_STAGE_ORDER.indexOf(left.stage) -
        RESOLUTION_STAGE_ORDER.indexOf(right.stage);

      if (stageDelta !== 0) {
        return stageDelta;
      }

      return right.priority - left.priority;
    });
}

function toResolverResult(
  input: RuntimeParamResolverInputV1,
  resolver: RuntimeRegisteredResolverV1 | null,
  step: RuntimeResolverStepResultV1
): ResolverResultV1 {
  if (step.status === "resolved" && step.resolvedParam) {
    return {
      paramKey: input.paramKey,
      status: "success",
      resolutionStatus: "resolved",
      resolvedParam: step.resolvedParam,
      reason: step.reason,
      source: step.source,
      output: {
        ...(step.output ?? {}),
        resolverId: resolver?.id ?? null,
        resourceFamily: input.resourceFamily,
      },
    };
  }

  if (step.status === "blocked") {
    return {
      paramKey: input.paramKey,
      status: "blocked",
      resolutionStatus: "blocked",
      reason: step.reason,
      output: {
        ...(step.output ?? {}),
        resolverId: resolver?.id ?? null,
        resourceFamily: input.resourceFamily,
      },
    };
  }

  if (step.status === "ambiguous") {
    return {
      paramKey: input.paramKey,
      status: "needs_user",
      resolutionStatus: "ambiguous",
      reason: step.reason ?? `ambiguous_${input.paramKey}`,
      output: {
        ...(step.output ?? {}),
        resolverId: resolver?.id ?? null,
        resourceFamily: input.resourceFamily,
      },
    };
  }

  if (step.status === "use_llm") {
    return {
      paramKey: input.paramKey,
      status: "needs_llm",
      resolutionStatus: "missing",
      reason: step.reason,
      output: {
        ...(step.output ?? {}),
        resolverId: resolver?.id ?? null,
        resourceFamily: input.resourceFamily,
      },
    };
  }

  return {
    paramKey: input.paramKey,
    status: "needs_user",
    resolutionStatus: "missing",
    reason: step.reason ?? `missing_${input.paramKey}`,
    output: {
      ...(step.output ?? {}),
      resolverId: resolver?.id ?? null,
      resourceFamily: input.resourceFamily,
    },
  };
}

function createExplicitPrimitiveResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "explicit.primitive",
    family: "entityResolvers",
    stage: "explicit_payload",
    priority: 100,
    paramKinds: ["primitive"],
    resolve: ({ param, paramKey, resourceFamily }) => {
      if (param.kind !== "primitive" || !hasPrimitiveContent(param.value)) {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      if (resourceFamily === "recipient") {
        return {
          status: "missing",
          reason: "recipient_requires_literal_email",
        };
      }

      return {
        status: "resolved",
        resolvedParam: typeof param.value === "string"
          ? {
              kind: "primitive",
              value: param.value.trim(),
            }
          : param,
        source: "explicit_turn",
      };
    },
  };
}

function createExplicitReferenceResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "explicit.reference",
    family: "referenceResolvers",
    stage: "explicit_payload",
    priority: 100,
    paramKinds: ["reference"],
    resolve: ({ param, resourceFamily }) => {
      if (param.kind !== "reference" || param.value.trim().length === 0) {
        return {
          status: "missing",
        };
      }

      const isAlias =
        (resourceFamily === "thread" && isThreadAlias(param.value)) ||
        (resourceFamily === "event" && isEventAlias(param.value)) ||
        (resourceFamily === "sheet" && isSheetAlias(param.value)) ||
        (resourceFamily === "range" && isRangeAlias(param.value));

      if (isAlias) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: param,
        source: "explicit_turn",
      };
    },
  };
}

function createExplicitEntityResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "explicit.entity",
    family: "entityResolvers",
    stage: "explicit_payload",
    priority: 95,
    paramKinds: ["entity"],
    resolve: ({ param, paramKey, resourceFamily }) => {
      if (param.kind !== "entity" || param.value.trim().length === 0) {
        return {
          status: "missing",
        };
      }

      if (resourceFamily === "recipient") {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      return {
        status: "resolved",
        resolvedParam: param,
        source: "explicit_turn",
      };
    },
  };
}

function createExplicitTimeResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "explicit.time",
    family: "timeResolvers",
    stage: "explicit_payload",
    priority: 95,
    paramKinds: ["time"],
    resolve: ({ param }) => {
      if (param.kind !== "time") {
        return {
          status: "missing",
        };
      }

      const rawValue = param.value.trim();
      const isoDateTimeMatch =
        /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:z|[+-]\d{2}:\d{2})?$/i;
      const isoDateMatch = /^\d{4}-\d{2}-\d{2}$/;

      if (!isoDateTimeMatch.test(rawValue) && !isoDateMatch.test(rawValue)) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "time",
          value: rawValue,
          timezone: param.timezone,
          granularity: param.granularity ?? (isoDateMatch.test(rawValue) ? "date" : "datetime"),
        },
        source: "explicit_turn",
      };
    },
  };
}

function createExplicitComputedResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "explicit.computed",
    family: "computedResolvers",
    stage: "explicit_payload",
    priority: 90,
    paramKinds: ["computed"],
    resolve: ({ param }) => {
      if (param.kind !== "computed") {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: param,
        source: "explicit_turn",
      };
    },
  };
}

function createConversationThreadResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "context.thread",
    family: "referenceResolvers",
    stage: "conversation_context",
    priority: 100,
    actionTypes: ["summarize_thread", "archive_thread", "apply_label"],
    resourceFamilies: ["thread"],
    resolve: ({ ctx, paramKey, param }) => {
      const recentCandidates = getRecentThreadCandidates(ctx);
      const explicitLatestAlias =
        param.kind === "reference" && isLatestThreadAlias(param.value);

      if (explicitLatestAlias && recentCandidates.length > 0) {
        return {
          status: "resolved",
          resolvedParam: {
            kind: "reference",
            refType: "thread",
            value: recentCandidates[0].threadId,
            label: recentCandidates[0].label,
          },
          source: "conversation_context",
        };
      }

      if (recentCandidates.length === 1) {
        return {
          status: "resolved",
          resolvedParam: {
            kind: "reference",
            refType: "thread",
            value: recentCandidates[0].threadId,
            label: recentCandidates[0].label,
          },
          source: "conversation_context",
        };
      }

      if (recentCandidates.length > 1) {
        return {
          status: "ambiguous",
          reason: `ambiguous_${paramKey}`,
          output: {
            candidates: recentCandidates.map((candidate) => ({
              threadId: candidate.threadId,
              label: candidate.label ?? null,
            })),
          },
        };
      }

      return {
        status: "missing",
      };
    },
  };
}

function createConversationEventResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "context.event",
    family: "referenceResolvers",
    stage: "conversation_context",
    priority: 100,
    actionTypes: ["reschedule_event", "cancel_event"],
    resourceFamilies: ["event"],
    resolve: ({ ctx, paramKey, param }) => {
      const recentCandidates = getRecentEventCandidates(ctx);
      const explicitLastAlias =
        param.kind === "reference" && isLastEventAlias(param.value);

      if (explicitLastAlias && recentCandidates.length > 0) {
        const lastCandidate = recentCandidates.at(-1);
        if (lastCandidate) {
          return {
            status: "resolved",
            resolvedParam: {
              kind: "reference",
              refType: "event",
              value: lastCandidate.eventId,
              label: lastCandidate.label,
            },
            source: "conversation_context",
          };
        }
      }

      if (recentCandidates.length === 1) {
        return {
          status: "resolved",
          resolvedParam: {
            kind: "reference",
            refType: "event",
            value: recentCandidates[0].eventId,
            label: recentCandidates[0].label,
          },
          source: "conversation_context",
        };
      }

      if (recentCandidates.length > 1) {
        return {
          status: "ambiguous",
          reason: `ambiguous_${paramKey}`,
          output: {
            candidates: recentCandidates.map((candidate) => ({
              eventId: candidate.eventId,
              label: candidate.label ?? null,
            })),
          },
        };
      }

      return {
        status: "missing",
      };
    },
  };
}

function createConversationSheetResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "context.sheet",
    family: "referenceResolvers",
    stage: "conversation_context",
    priority: 100,
    actionTypes: ["read_sheet_range", "append_sheet_rows", "update_sheet_range"],
    resourceFamilies: ["sheet"],
    resolve: ({ ctx }) => {
      const snapshot = getRecentSheetSnapshot(ctx);
      if (!snapshot?.spreadsheetId) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "reference",
          refType: "sheet",
          value: snapshot.spreadsheetId,
          label: snapshot.sheetName ?? snapshot.spreadsheetTitle ?? undefined,
        },
        source: "conversation_context",
      };
    },
  };
}

function createConversationRangeResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "context.range",
    family: "referenceResolvers",
    stage: "conversation_context",
    priority: 100,
    actionTypes: ["read_sheet_range", "append_sheet_rows", "update_sheet_range"],
    resourceFamilies: ["range"],
    resolve: ({ ctx }) => {
      const snapshot = getRecentSheetSnapshot(ctx);
      if (!snapshot?.rangeA1 || snapshot.rangeA1.trim().length === 0) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "reference",
          refType: "range",
          value: snapshot.rangeA1,
          label: snapshot.sheetName ?? undefined,
        },
        source: "conversation_context",
      };
    },
  };
}

function createLocalMetadataResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "db.local_metadata",
    family: "referenceResolvers",
    stage: "db",
    priority: 80,
    resolve: async ({ ctx, action, paramKey, param, deps }) => {
      const metadataValue = await deps.readLocalMetadata?.({
        ctx,
        action,
        paramKey,
        param,
      });
      const normalized = metadataValue ? normalizeResolvedParam(metadataValue) : null;

      if (!normalized) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: normalized,
        source: "local_metadata",
      };
    },
  };
}

function createIntegrationResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "integration.lookup",
    family: "entityResolvers",
    stage: "integration",
    priority: 80,
    resolve: async ({ ctx, action, paramKey, param, deps }) => {
      const integrationValue = await deps.readIntegrationValue?.({
        ctx,
        action,
        paramKey,
        param,
      });

      const normalized = normalizeLookupResult(integrationValue);
      if (!normalized) {
        return {
          status: "missing",
        };
      }

      if (normalized.status === "resolved") {
        return {
          ...normalized,
          source: "integration_read",
        };
      }

      return normalized;
    },
  };
}

function createDeterministicEmailResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "deterministic.email_list",
    family: "entityResolvers",
    stage: "deterministic",
    priority: 100,
    resourceFamilies: ["recipient"],
    resolve: ({ param, paramKey }) => {
      if (param.kind !== "primitive") {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      const values = getPrimitiveStrings(param);
      if (values.length === 0) {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      if (!values.every((value) => EMAIL_REGEX.test(value))) {
        return {
          status: "missing",
          reason: "recipient_requires_literal_email",
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "primitive",
          value: values,
        },
        source: "deterministic_transform",
      };
    },
  };
}

function createDeterministicTextResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "deterministic.text",
    family: "entityResolvers",
    stage: "deterministic",
    priority: 90,
    resourceFamilies: ["text", "query", "label", "record_type", "limit"],
    resolve: ({ param, paramKey, resourceFamily }) => {
      if (param.kind !== "primitive") {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      if (!hasPrimitiveContent(param.value)) {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      if (resourceFamily === "limit" && typeof param.value === "number") {
        return {
          status: "resolved",
          resolvedParam: param,
          source: "deterministic_transform",
        };
      }

      if (typeof param.value === "string") {
        return {
          status: "resolved",
          resolvedParam: {
            kind: "primitive",
            value: param.value.trim(),
          },
          source: "deterministic_transform",
        };
      }

      if (typeof param.value === "number" || typeof param.value === "boolean") {
        return {
          status: "resolved",
          resolvedParam: param,
          source: "deterministic_transform",
        };
      }

      const values = getPrimitiveStrings(param);
      if (values.length > 0) {
        return {
          status: "resolved",
          resolvedParam: {
            kind: "primitive",
            value: values,
          },
          source: "deterministic_transform",
        };
      }

      return {
        status: "missing",
        reason: `missing_${paramKey}`,
      };
    },
  };
}

function createDeterministicReferenceFromPrimitiveResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "deterministic.reference_from_primitive",
    family: "referenceResolvers",
    stage: "deterministic",
    priority: 85,
    paramKinds: ["primitive"],
    resourceFamilies: ["thread", "event", "sheet", "range", "record"],
    resolve: ({ param, resourceFamily, paramKey }) => {
      if (param.kind !== "primitive" || typeof param.value !== "string") {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      const value = param.value.trim();
      if (value.length === 0) {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "reference",
          refType: resourceFamily,
          value,
          label: value,
        },
        source: "deterministic_transform",
      };
    },
  };
}

function createDeterministicTimeResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "deterministic.time",
    family: "timeResolvers",
    stage: "deterministic",
    priority: 100,
    paramKinds: ["time"],
    resourceFamilies: ["datetime", "date"],
    resolve: async ({ param, paramKey, deps, ctx, action }) => {
      if (param.kind !== "time") {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      const rawValue = param.value.trim();
      if (rawValue.length === 0) {
        return {
          status: "missing",
          reason: `missing_${paramKey}`,
        };
      }

      const timezone = isValidTimezone(param.timezone)
        ? param.timezone
        : await resolveDefaultTimezone({ ctx, action, deps });
      const now = deps.now?.() ?? new Date();
      const explicitDate = parseExplicitDate(rawValue);
      const relativeDate = parseRelativeDate(rawValue, timezone, now);
      const resolvedDate = explicitDate ?? relativeDate;

      if (!resolvedDate) {
        return {
          status: "missing",
          reason: `unresolved_${paramKey}`,
        };
      }

      const time = parseTimePortion(rawValue);
      return {
        status: "resolved",
        resolvedParam: {
          kind: "time",
          value: time
            ? `${resolvedDate}T${time.hours}:${time.minutes}:00`
            : resolvedDate,
          timezone,
          granularity: param.granularity ?? (time ? "datetime" : "date"),
        },
        source: "deterministic_transform",
      };
    },
  };
}

function createComputedTimezoneResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "computed.timezone",
    family: "computedResolvers",
    stage: "deterministic",
    priority: 95,
    resourceFamilies: ["timezone"],
    resolve: async ({ ctx, action, deps }) => {
      const timezone = await resolveDefaultTimezone({ ctx, action, deps });
      return {
        status: "resolved",
        resolvedParam: {
          kind: "computed",
          value: timezone,
          source: "default_timezone",
        },
        source: "deterministic_transform",
      };
    },
  };
}

function createComputedLimitResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "computed.limit",
    family: "computedResolvers",
    stage: "deterministic",
    priority: 90,
    resourceFamilies: ["limit"],
    criticality: "non_critical",
    resolve: () => ({
      status: "resolved",
      resolvedParam: {
        kind: "computed",
        value: 10,
        source: "default_limit",
      },
      source: "deterministic_transform",
    }),
  };
}

function createSalesforceContextRecordResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "context.salesforce_record",
    family: "referenceResolvers",
    stage: "conversation_context",
    priority: 70,
    actionTypes: ["update_lead", "create_task"],
    resourceFamilies: ["record"],
    resolve: ({ ctx }) => {
      const recent = readRecentSalesforceToolContext(
        ctx.conversationMetadata as never
      );

      if (!recent?.context) {
        return {
          status: "missing",
        };
      }

      const match = recent.context.match(/\b(00Q[0-9A-Za-z]{12,15})\b/);
      if (!match) {
        return {
          status: "missing",
        };
      }

      return {
        status: "resolved",
        resolvedParam: {
          kind: "reference",
          refType: "record",
          value: match[1],
          label: match[1],
        },
        source: "conversation_context",
      };
    },
  };
}

function createLlmBodyResolver(): RuntimeRegisteredResolverV1 {
  return {
    id: "llm.noncritical_text",
    family: "llmResolvers",
    stage: "llm",
    priority: 100,
    criticality: "non_critical",
    resourceFamilies: ["body"],
    canResolve: ({ ctx, paramKey }) => readRequestedLlmFields(ctx).has(paramKey),
    resolve: ({ paramKey, resolvedParams }) => {
      if (paramKey === "body" && !hasResolvedLiteralEmail(resolvedParams.to)) {
        return {
          status: "missing",
          reason: "recipient_requires_literal_email",
        };
      }

      return {
        status: "use_llm",
        reason: `llm_repair_allowed:${paramKey}`,
      };
    },
  };
}

export function createResolverRegistryV1(): RuntimeResolverRegistryV1 {
  return [
    createExplicitPrimitiveResolver(),
    createExplicitReferenceResolver(),
    createExplicitEntityResolver(),
    createExplicitTimeResolver(),
    createExplicitComputedResolver(),
    createConversationThreadResolver(),
    createConversationEventResolver(),
    createConversationSheetResolver(),
    createConversationRangeResolver(),
    createSalesforceContextRecordResolver(),
    createLocalMetadataResolver(),
    createIntegrationResolver(),
    createDeterministicEmailResolver(),
    createDeterministicTextResolver(),
    createDeterministicReferenceFromPrimitiveResolver(),
    createDeterministicTimeResolver(),
    createComputedTimezoneResolver(),
    createComputedLimitResolver(),
    createLlmBodyResolver(),
  ];
}

export async function resolveParam(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  paramKey: string;
  param: ParamValueV1;
  resolvedParams?: Record<string, ParamValueV1>;
  registry?: RuntimeResolverRegistryV1;
  deps?: RuntimeResolverEngineDepsV1;
}): Promise<ResolverResultV1> {
  const registry = input.registry ?? createResolverRegistryV1();
  const deps = input.deps ?? {};
  const actionDefinition = getActionDefinitionV1(input.action.type);
  const paramContract = actionDefinition.input.params[input.paramKey] ?? null;
  const preparedInput: RuntimeParamResolverInputV1 = {
    ctx: input.ctx,
    action: input.action,
    paramKey: input.paramKey,
    param: input.param,
    paramContract,
    resourceFamily: inferResourceFamily(input.paramKey, input.param, paramContract),
    criticality: inferCriticality(input.paramKey, input.action, paramContract),
    resolvedParams: input.resolvedParams ?? {},
    deps,
  };
  const candidates = selectResolvers(preparedInput, registry);
  let ambiguousResult: ResolverResultV1 | null = null;
  let llmResult: ResolverResultV1 | null = null;
  let lastMissingReason = `missing_${input.paramKey}`;

  for (const resolver of candidates) {
    if (resolver.canResolve && !(await resolver.canResolve(preparedInput))) {
      continue;
    }

    const step = await resolver.resolve(preparedInput);
    const publicResult = toResolverResult(preparedInput, resolver, step);

    if (step.status === "resolved") {
      return publicResult;
    }

    if (step.status === "blocked") {
      return publicResult;
    }

    if (step.status === "ambiguous" && !ambiguousResult) {
      ambiguousResult = publicResult;
    }

    if (step.status === "use_llm" && !llmResult) {
      llmResult = publicResult;
    }

    if (publicResult.reason) {
      lastMissingReason = publicResult.reason;
    }
  }

  if (ambiguousResult) {
    return ambiguousResult;
  }

  if (llmResult) {
    return llmResult;
  }

  return {
    paramKey: input.paramKey,
    status: "needs_user",
    resolutionStatus: "missing",
    reason: lastMissingReason,
    output: {
      resourceFamily: preparedInput.resourceFamily,
    },
  };
}

export async function resolveAction(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  registry?: RuntimeResolverRegistryV1;
  deps?: RuntimeResolverEngineDepsV1;
}): Promise<ResolveActionResultV1> {
  const registry = input.registry ?? createResolverRegistryV1();
  const deps = input.deps ?? {};
  const definition = getActionDefinitionV1(input.action.type);
  const paramKeys = [
    ...new Set([
      ...definition.input.minimum,
      ...Object.keys(input.action.params),
    ]),
  ];

  const resolvedParams: Record<string, ParamValueV1> = {};
  const results: ResolverResultV1[] = [];
  const missingFields: string[] = [];
  const llmFields: string[] = [];
  const blockedFields: string[] = [];
  const ambiguousFields: string[] = [];

  const buildOutput = (): RuntimeResolutionSummaryV1 => ({
    resolvedFields: Object.keys(resolvedParams),
    missingFields,
    llmFields,
    blockedFields,
    ambiguousFields,
  });

  for (const paramKey of paramKeys) {
    const param =
      input.action.params[paramKey] ??
      ({
        kind: "unknown",
        reason: `missing_${paramKey}`,
      } satisfies ParamValueV1);

    const result = await resolveParam({
      ctx: input.ctx,
      action: input.action,
      paramKey,
      param,
      resolvedParams,
      registry,
      deps,
    });

    results.push(result);

    if (result.status === "success" && result.resolvedParam) {
      resolvedParams[paramKey] = result.resolvedParam;
      continue;
    }

    if (result.status === "needs_llm") {
      llmFields.push(paramKey);
      return {
        status: "needs_llm",
        action: {
          ...input.action,
          params: { ...input.action.params, ...resolvedParams },
        },
        reason: result.reason,
        resolvedParams,
        results,
        output: buildOutput(),
      };
    }

    if (result.status === "blocked") {
      blockedFields.push(paramKey);
      return {
        status: "blocked",
        action: {
          ...input.action,
          params: { ...input.action.params, ...resolvedParams },
        },
        reason: result.reason,
        resolvedParams,
        results,
        output: buildOutput(),
      };
    }

    if (
      result.resolutionStatus === "ambiguous" ||
      result.reason?.startsWith("ambiguous_") ||
      ((result.output?.candidates as unknown[] | undefined)?.length ?? 0) > 1
    ) {
      ambiguousFields.push(paramKey);
    }

    missingFields.push(paramKey);
    return {
      status: result.status,
      action: {
        ...input.action,
        params: { ...input.action.params, ...resolvedParams },
      },
      reason: result.reason,
      resolvedParams,
      results,
      output: buildOutput(),
    };
  }

  return {
    status: "success",
    action: {
      ...input.action,
      params: { ...input.action.params, ...resolvedParams },
    },
    resolvedParams,
    results,
    output: buildOutput(),
  };
}

export function createResolveNodeHandlerV1(input?: {
  registry?: RuntimeResolverRegistryV1;
  deps?: RuntimeResolverEngineDepsV1;
}): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }): Promise<NodeResultV1> => {
    const result = await resolveAction({
      ctx,
      action,
      registry: input?.registry,
      deps: input?.deps,
    });

    return {
      status: result.status,
      reason: result.reason,
      actionPatch: {
        params: result.action.params,
        metadata: {
          ...(action.metadata ?? {}),
          resolution: result.output,
        },
      },
      contextPatch: {
        messageMetadata: {
          ...ctx.messageMetadata,
          runtime_resolution: result.output,
        },
      },
      output: result.output,
    };
  };
}
