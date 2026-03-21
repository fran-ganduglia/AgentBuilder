import "server-only";

import type { RoutedCompletionMetadata } from "@/lib/llm/model-routing";
import {
  resolveProviderFromModel,
} from "@/lib/llm/model-routing";
import { sendSemanticCompletion } from "@/lib/llm/semantic-generation";
import { LiteLLMError } from "@/lib/llm/litellm";
import type { ChatMessage } from "@/lib/llm/litellm-types";
import { resolveGoogleCalendarIntegrationTimezone } from "@/lib/integrations/google-calendar-timezone";
import type { GoogleAgentRuntimeSuccess } from "@/lib/integrations/google-agent-runtime";
import type { SalesforceAgentToolRuntime } from "@/lib/integrations/salesforce-agent-runtime";
import type { ConversationMetadata, RecentActionContext } from "@/lib/chat/conversation-metadata";
import {
  buildPendingChatFormFromRuntimeClarification,
  buildRuntimeClarificationSpec,
} from "@/lib/chat/runtime-clarification";
import { buildRuntimeEventInsert, insertRuntimeEvents } from "@/lib/db/runtime-events";
import {
  buildRuntimeUsageEventInsert,
  insertRuntimeUsageEvents,
} from "@/lib/db/runtime-usage-events";
import {
  insertRuntimeRun,
  updateRuntimeRun,
  type RuntimeRunRow,
} from "@/lib/db/runtime-runs";
import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import { estimateLlmCostUsd } from "@/lib/engine/observability";
import {
  buildRecentDeclarativeContextFromRuntime,
  buildRuntimeTraceSummary,
  renderRuntimeNonSuccessMessage,
  renderRuntimeSuccessMessage,
} from "./chat-bridge";
import { readRecentActionContext } from "@/lib/chat/conversation-metadata";
import {
  resolveRuntimeChatRoutingDecision,
  shouldAttemptRuntimePlanner,
} from "./chat-route";
import { requestGoogleGmail, requestGooglePeople } from "@/lib/integrations/google";
import { fetchCandidateOptionsForMissingFields } from "./candidate-fetcher";
import { createRuntimeNodeRegistryV1 } from "./node-registry";
import { enrichRuntimeEvents } from "./observability";
import { buildRuntimeEventOperationalPayload } from "./operations";
import { planActionWithUsage } from "./planner";
import { buildRuntimePolicyContextV1 } from "./runtime-policy-context";
import type { RuntimeResolverLookupResultV1 } from "./resolver-engine";
import { runExecutionGraph } from "./runner";
import { buildRuntimeUsageEvents } from "./usage-events";
import type { RuntimeKillSwitchConfigV1 } from "./runtime-kill-switch";
import type {
  ActionPlanV1,
  ExecutionContextV1,
  ParamValueV1,
} from "./types";

export type RuntimeSurfaceAvailability = {
  gmail: GoogleAgentRuntimeSuccess | null;
  google_calendar: GoogleAgentRuntimeSuccess | null;
  google_sheets: GoogleAgentRuntimeSuccess | null;
  salesforce: SalesforceAgentToolRuntime | null;
};

export type RuntimePlannerSnapshot = {
  intent: string;
  confidence: number;
  missingFields: string[];
  actions: Array<{
    id: string;
    type: string;
    approvalMode: "auto" | "required";
  }>;
} | null;

export type RuntimeSurfacePlanningResult = {
  plannerAttempted: boolean;
  plannerErrorType: string | null;
  plannerPlan: ActionPlanV1 | null;
  plannerDraft: ActionPlanV1 | null;
  plannerModel: string | null;
  plannerProvider: string | null;
  plannerTokensInput: number;
  plannerTokensOutput: number;
  plannerMetadata: RuntimePlannerSnapshot;
  routingDecision: ReturnType<typeof resolveRuntimeChatRoutingDecision>;
};

export type RuntimeSurfaceExecutionResult = {
  content: string;
  llmModel: string | null;
  llmProvider: string | null;
  responseTimeMs: number | null;
  tokensInput: number;
  tokensOutput: number;
  routing: RoutedCompletionMetadata | null;
  conversationMetadataPatch: ConversationMetadata;
  assistantMetadataPatch: Record<string, unknown>;
  runtimeRunId: string | null;
  requestId: string;
  traceId: string;
  outcome: "success" | "needs_user" | "failed" | "blocked";
  primaryActionType: ActionPlanV1["actions"][number]["type"] | null;
};

function createEmptyRuntimePlan(missingFields: string[] = []): ActionPlanV1 {
  return {
    version: 1,
    intent: "unknown",
    actions: [],
    confidence: 0,
    missingFields,
  };
}

function buildPlannerNeedsUserMessage(
  missingFields: string[],
  candidateOptionsByField: Record<string, { value: string; label: string }[]> = {}
): string {
  const firstMissing = missingFields[0] ?? "";
  const firstCandidates = candidateOptionsByField[firstMissing] ?? [];

  if (missingFields.some((field) => field.includes("thread"))) {
    if (firstCandidates.length > 0) {
      return `Encontre ${firstCandidates.length} hilo${firstCandidates.length === 1 ? "" : "s"} reciente${firstCandidates.length === 1 ? "" : "s"}. Selecciona cual quieres usar.`;
    }
    return "Necesito que me indiques exactamente que hilo quieres usar.";
  }

  if (missingFields.some((field) => field.includes("event"))) {
    if (firstCandidates.length > 0) {
      return `Encontre ${firstCandidates.length} evento${firstCandidates.length === 1 ? "" : "s"} proximo${firstCandidates.length === 1 ? "" : "s"}. Selecciona cual quieres usar.`;
    }
    return "Necesito que me indiques exactamente que evento quieres usar.";
  }

  if (missingFields.some((field) => field === "label")) {
    if (firstCandidates.length > 0) {
      return "Selecciona la etiqueta que quieres aplicar.";
    }
    return "Necesito el nombre exacto de la etiqueta para continuar.";
  }

  if (missingFields.some((field) => field.includes("to") || field.includes("recipient"))) {
    return "Necesito el email exacto del destinatario para continuar.";
  }

  if (missingFields.some((field) => field.includes("start") || field.includes("end"))) {
    return "Necesito una fecha y horario claros para ese evento.";
  }

  if (missingFields.some((field) => field.includes("title"))) {
    return "Necesito el titulo del evento para continuar.";
  }

  return "Necesito un poco mas de informacion para continuar con esa accion.";
}

function buildPlannerClarificationMetadataPatch(input: {
  planning: RuntimeSurfacePlanningResult;
  message: string;
  candidates: Record<string, { value: string; label: string }[]>;
}): ConversationMetadata {
  const missingFields = (
    input.planning.plannerPlan?.missingFields ?? input.planning.plannerDraft?.missingFields ?? []
  ).filter((f) => f !== "planner_invalid_output");

  const spec = buildRuntimeClarificationSpec({
    source: "planner",
    plannerDraftPlan: input.planning.plannerDraft,
    plannerMissingFields: missingFields,
  });

  if (!spec) {
    return {};
  }

  if (Object.keys(input.candidates).length > 0) {
    spec.candidateOptionsByField = input.candidates;
  }

  const pendingChatForm = buildPendingChatFormFromRuntimeClarification({
    spec,
    message: input.message,
  });

  if (!pendingChatForm) {
    return {};
  }

  return {
    pending_runtime_clarification: spec,
    pending_chat_form: pendingChatForm,
  };
}

async function buildRuntimeRoutingRejectionResult(input: {
  planning: RuntimeSurfacePlanningResult;
  organizationId: string;
  agentId: string;
  runtimes: RuntimeSurfaceAvailability;
  conversationMetadata: Record<string, unknown>;
}): Promise<RuntimeSurfaceExecutionResult | null> {
  const rejectionReason = input.planning.routingDecision.rejectionReason;
  if (!rejectionReason || rejectionReason === "no_supported_runtime_surface") {
    return null;
  }

  const requestId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const primaryActionType =
    input.planning.routingDecision.unsupportedActions[0] ??
    input.planning.plannerPlan?.actions[0]?.type ??
    null;
  const basePlan = input.planning.plannerPlan ?? createEmptyRuntimePlan(
    rejectionReason === "planner_invalid_output" ? ["planner_invalid_output"] : []
  );

  const needsClarification =
    rejectionReason === "planner_empty" ||
    rejectionReason === "planner_invalid_output";

  const outcome = needsClarification
    ? "needs_user"
    : rejectionReason === "runtime_unavailable_for_action"
      ? "blocked"
      : "failed";

  let plannerClarificationPatch: ConversationMetadata = {};
  let content: string;

  if (needsClarification) {
    const missingFields =
      basePlan.missingFields.length > 0
        ? basePlan.missingFields.filter((f) => f !== "planner_invalid_output")
        : (input.planning.plannerDraft?.missingFields ?? []).filter((f) => f !== "planner_invalid_output");

    const draftAction = input.planning.plannerDraft?.actions[0];
    const candidates = draftAction
      ? await (async () => {
          try {
            return await fetchCandidateOptionsForMissingFields({
              organizationId: input.organizationId,
              agentId: input.agentId,
              actionType: draftAction.type,
              missingFields,
              runtimes: input.runtimes,
              conversationMetadata: input.conversationMetadata,
            });
          } catch {
            return {};
          }
        })()
      : {};

    content = buildPlannerNeedsUserMessage(missingFields, candidates);

    plannerClarificationPatch = buildPlannerClarificationMetadataPatch({
      planning: input.planning,
      message: content,
      candidates,
    });
  } else {
    content =
      rejectionReason === "planner_failed"
        ? "El runtime nuevo no pudo planear la accion por un error tecnico. Intenta de nuevo."
        : primaryActionType
          ? renderRuntimeNonSuccessMessage({
              actionType: primaryActionType,
              status: "blocked",
              reason: "runtime_unavailable_for_action",
            })
          : "Esa accion no esta disponible en el runtime nuevo para este agente.";
  }

  const runtimeTraceSummary = buildRuntimeTraceSummary({
    plan: basePlan,
    trace: {
      requestId,
      traceId,
      planVersion: basePlan.version,
      graph: [],
      actions: [],
      events: [],
    },
    outcome,
  });

  return {
    content,
    llmModel: input.planning.plannerModel,
    llmProvider: input.planning.plannerProvider,
    responseTimeMs: null,
    tokensInput: input.planning.plannerTokensInput,
    tokensOutput: input.planning.plannerTokensOutput,
    routing: null,
    conversationMetadataPatch: {
      ...plannerClarificationPatch,
      runtime_checkpoint: null,
      runtime_trace_summary: runtimeTraceSummary,
    },
    assistantMetadataPatch: {
      runtime: {
        routingDecision: "runtime_primary",
        runtimeRunId: null,
        outcome,
        executionOutcome: outcome,
        rejectionReason,
        actionPlan: basePlan,
        unsupportedActions: input.planning.routingDecision.unsupportedActions,
        actions: primaryActionType
          ? [
              {
                actionId: "routing-rejection",
                actionType: primaryActionType,
                status: outcome,
                approvalItemId: null,
                workflowRunId: null,
                workflowStepId: null,
              },
            ]
          : [],
        llmUsageBreakdown: {
          planner: input.planning.plannerMetadata
            ? {
                model: input.planning.plannerModel,
                provider: input.planning.plannerProvider,
                tokensInput: input.planning.plannerTokensInput,
                tokensOutput: input.planning.plannerTokensOutput,
              }
            : null,
          postprocess: null,
        },
      },
      runtime_trace_summary: runtimeTraceSummary,
      runtime_outcome: outcome,
    },
    runtimeRunId: null,
    requestId,
    traceId,
    outcome,
    primaryActionType,
  };
}

const GOOGLE_CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
] as const;
const GMAIL_RECENT_HISTORY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type RecipientCandidate = {
  email: string;
  label: string | null;
  source: "people" | "gmail_history" | "local_cache";
  score: number;
};

type GmailMessageMetadataResponse = {
  payload?: {
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
  };
};

type GmailMessageListResponse = {
  messages?: Array<{
    id?: string;
  }>;
};

type GmailThreadsListResponse = {
  threads?: Array<{
    id?: string;
  }>;
};

type GmailThreadMetadataResponse = {
  id?: string;
  messages?: Array<{
    payload?: {
      headers?: Array<{
        name?: string;
        value?: string;
      }>;
    };
  }>;
};

type PeopleSearchResponse = {
  results?: Array<{
    person?: {
      names?: Array<{ displayName?: string }>;
      emailAddresses?: Array<{ value?: string }>;
    };
  }>;
};

type OtherContactsSearchResponse = {
  results?: Array<{
    person?: {
      names?: Array<{ displayName?: string }>;
      emailAddresses?: Array<{ value?: string }>;
    };
  }>;
};

function normalizeLookupText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compactLookupText(value: string): string {
  return normalizeLookupText(value).replace(/[^a-z0-9]/g, "");
}

function isLiteralEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

function isLatestThreadAlias(value: string): boolean {
  const normalized = normalizeLookupText(value);
  return normalized === "ultimo hilo" ||
    normalized === "el ultimo hilo" ||
    normalized === "ultimo email" ||
    normalized === "el ultimo email";
}

function splitRecipientInput(param: ParamValueV1): string[] {
  if (param.kind === "entity") {
    return param.value.trim().length > 0 ? [param.value.trim()] : [];
  }

  if (param.kind !== "primitive") {
    return [];
  }

  if (typeof param.value === "string") {
    return param.value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(param.value)) {
    return param.value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function extractEmailAndLabel(value: string | null | undefined): {
  email: string | null;
  label: string | null;
} {
  if (!value) {
    return { email: null, label: null };
  }

  const trimmed = value.trim();
  const angleMatch = trimmed.match(/^(.*?)(?:<([^>]+)>)$/);
  if (angleMatch) {
    const email = angleMatch[2]?.trim() ?? null;
    const label = angleMatch[1]?.replace(/["']/g, "").trim() || null;
    return {
      email: email && isLiteralEmail(email) ? email.toLowerCase() : null,
      label,
    };
  }

  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch?.[0]) {
    return {
      email: emailMatch[0].toLowerCase(),
      label: trimmed === emailMatch[0] ? null : trimmed,
    };
  }

  return { email: null, label: trimmed || null };
}

function getAliasKeys(email: string, label: string | null): Set<string> {
  const keys = new Set<string>();
  const localPart = email.split("@")[0] ?? email;
  const normalizedLocal = normalizeLookupText(localPart);
  const compactLocal = compactLookupText(localPart);

  if (normalizedLocal) {
    keys.add(normalizedLocal);
  }

  if (compactLocal) {
    keys.add(compactLocal);
  }

  const localTokens = normalizedLocal.split(/[^a-z0-9]+/).filter(Boolean);
  if (localTokens.length >= 2) {
    keys.add(`${localTokens[0][0] ?? ""}${localTokens[localTokens.length - 1]}`);
  }

  const normalizedLabel = label ? normalizeLookupText(label) : "";
  const compactLabel = label ? compactLookupText(label) : "";
  if (normalizedLabel) {
    keys.add(normalizedLabel);
  }

  if (compactLabel) {
    keys.add(compactLabel);
  }

  const labelTokens = normalizedLabel.split(/[^a-z0-9]+/).filter(Boolean);
  if (labelTokens.length >= 2) {
    keys.add(`${labelTokens[0][0] ?? ""}${labelTokens[labelTokens.length - 1]}`);
  }

  return keys;
}

function scoreRecipientCandidate(query: string, candidate: Omit<RecipientCandidate, "score">): number {
  const normalizedQuery = normalizeLookupText(query);
  const compactQuery = compactLookupText(query);
  const aliasKeys = getAliasKeys(candidate.email, candidate.label);
  const emailLocal = candidate.email.split("@")[0] ?? candidate.email;
  const normalizedEmail = normalizeLookupText(candidate.email);

  if (normalizedEmail === normalizedQuery || candidate.email === query.toLowerCase()) {
    return 1;
  }

  if (aliasKeys.has(normalizedQuery) || aliasKeys.has(compactQuery)) {
    return 0.97;
  }

  if (normalizeLookupText(emailLocal).startsWith(normalizedQuery) || compactLookupText(emailLocal).startsWith(compactQuery)) {
    return 0.84;
  }

  if (candidate.label) {
    const normalizedLabel = normalizeLookupText(candidate.label);
    if (normalizedLabel.includes(normalizedQuery) || compactLookupText(candidate.label).includes(compactQuery)) {
      return 0.8;
    }
  }

  return 0;
}

function dedupeRecipientCandidates(candidates: RecipientCandidate[]): RecipientCandidate[] {
  const byEmail = new Map<string, RecipientCandidate>();

  for (const candidate of candidates) {
    const existing = byEmail.get(candidate.email);
    if (!existing || candidate.score > existing.score) {
      byEmail.set(candidate.email, candidate);
    }
  }

  return [...byEmail.values()].sort((left, right) => right.score - left.score);
}

function asRecipientCandidate(
  value: string | null | undefined,
  source: RecipientCandidate["source"]
): Omit<RecipientCandidate, "score"> | null {
  const parsed = extractEmailAndLabel(value);
  if (!parsed.email) {
    return null;
  }

  return {
    email: parsed.email,
    label: parsed.label,
    source,
  };
}

function getSingleParamString(param: ParamValueV1): string | null {
  if (param.kind === "reference" || param.kind === "entity" || param.kind === "time") {
    return param.value.trim().length > 0 ? param.value.trim() : null;
  }

  if (param.kind === "primitive" && typeof param.value === "string") {
    return param.value.trim().length > 0 ? param.value.trim() : null;
  }

  return null;
}

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  headerName: string
): string | null {
  const header = headers?.find((entry) => entry.name?.toLowerCase() === headerName.toLowerCase());
  if (typeof header?.value !== "string") {
    return null;
  }

  const normalized = header.value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

function getLocalRecipientCandidates(ctx: ExecutionContextV1): RecipientCandidate[] {
  const recentContext = readRecentActionContext(ctx.conversationMetadata as never);
  const rawCandidates: RecipientCandidate[] = [];
  const caches = [
    ctx.conversationMetadata.runtime_recipient_cache,
    ctx.messageMetadata.runtime_recipient_cache,
  ];

  for (const cache of caches) {
    if (!Array.isArray(cache)) {
      continue;
    }

    for (const entry of cache) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const email = typeof record.email === "string" ? record.email : null;
      const label = typeof record.label === "string" ? record.label : null;
      if (email && isLiteralEmail(email)) {
        rawCandidates.push({
          email: email.toLowerCase(),
          label,
          source: "local_cache",
          score: 0,
        });
      }
    }
  }

  if (recentContext) {
    for (const snapshot of recentContext.actions) {
      if (snapshot.result.kind === "gmail_search_threads") {
        for (const thread of snapshot.result.threads) {
          const candidate = asRecipientCandidate(thread.from ?? null, "local_cache");
          if (candidate) {
            rawCandidates.push({ ...candidate, score: 0 });
          }
        }
      }
    }
  }

  return dedupeRecipientCandidates(rawCandidates);
}

async function searchPeopleRecipientCandidates(input: {
  accessToken: string;
  query: string;
  grantedScopes: string[];
}): Promise<RecipientCandidate[]> {
  if (!GOOGLE_CONTACTS_SCOPES.some((scope) => input.grantedScopes.includes(scope))) {
    return [];
  }

  const query = encodeURIComponent(input.query);
  const collected: RecipientCandidate[] = [];

  try {
    const contactsResponse = await requestGooglePeople<PeopleSearchResponse>(
      input.accessToken,
      `/people:searchContacts?query=${query}&readMask=names,emailAddresses&pageSize=10`,
      { method: "GET" }
    );

    for (const result of contactsResponse.data.results ?? []) {
      const displayName = result.person?.names?.[0]?.displayName ?? null;
      for (const emailEntry of result.person?.emailAddresses ?? []) {
        if (typeof emailEntry.value === "string" && isLiteralEmail(emailEntry.value)) {
          const score = scoreRecipientCandidate(input.query, {
            email: emailEntry.value.toLowerCase(),
            label: displayName,
            source: "people",
          });

          if (score >= 0.75) {
            collected.push({
              email: emailEntry.value.toLowerCase(),
              label: displayName,
              source: "people",
              score,
            });
          }
        }
      }
    }
  } catch {
    // Best effort only.
  }

  try {
    const otherContactsResponse = await requestGooglePeople<OtherContactsSearchResponse>(
      input.accessToken,
      `/otherContacts:search?query=${query}&readMask=names,emailAddresses&pageSize=10`,
      { method: "GET" }
    );

    for (const result of otherContactsResponse.data.results ?? []) {
      const displayName = result.person?.names?.[0]?.displayName ?? null;
      for (const emailEntry of result.person?.emailAddresses ?? []) {
        if (typeof emailEntry.value === "string" && isLiteralEmail(emailEntry.value)) {
          const score = scoreRecipientCandidate(input.query, {
            email: emailEntry.value.toLowerCase(),
            label: displayName,
            source: "people",
          });

          if (score >= 0.75) {
            collected.push({
              email: emailEntry.value.toLowerCase(),
              label: displayName,
              source: "people",
              score,
            });
          }
        }
      }
    }
  } catch {
    // Best effort only.
  }

  return dedupeRecipientCandidates(collected);
}

async function searchRecentGmailRecipientCandidates(input: {
  accessToken: string;
  query: string;
  grantedScopes: string[];
}): Promise<RecipientCandidate[]> {
  if (!input.grantedScopes.includes(GMAIL_RECENT_HISTORY_SCOPE)) {
    return [];
  }

  const query = encodeURIComponent(`${input.query} newer_than:365d`);
  const collected: RecipientCandidate[] = [];

  try {
    const listResponse = await requestGoogleGmail<GmailMessageListResponse>(
      input.accessToken,
      `/gmail/v1/users/me/messages?q=${query}&maxResults=8`,
      { method: "GET" }
    );

    for (const message of listResponse.data.messages ?? []) {
      if (!message.id) {
        continue;
      }

      const metadataResponse = await requestGoogleGmail<GmailMessageMetadataResponse>(
        input.accessToken,
        `/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
        { method: "GET" }
      );

      for (const header of metadataResponse.data.payload?.headers ?? []) {
        const headerName = header.name?.toLowerCase();
        if (!headerName || !["from", "to", "cc", "bcc"].includes(headerName)) {
          continue;
        }

        const headerValues = typeof header.value === "string"
          ? header.value.split(",").map((value) => value.trim())
          : [];

        for (const headerValue of headerValues) {
          const candidate = asRecipientCandidate(headerValue, "gmail_history");
          if (!candidate) {
            continue;
          }

          const score = scoreRecipientCandidate(input.query, candidate);
          if (score >= 0.75) {
            collected.push({
              ...candidate,
              score,
            });
          }
        }
      }
    }
  } catch {
    // Best effort only.
  }

  return dedupeRecipientCandidates(collected);
}

function formatClarificationCandidates(candidates: unknown[]): string {
  const formatted = candidates
    .map((candidate) => {
      if (candidate && typeof candidate === "object") {
        const record = candidate as Record<string, unknown>;
        const email = typeof record.email === "string" ? record.email : null;
        const label = typeof record.label === "string" ? record.label : null;
        const threadId = typeof record.threadId === "string" ? record.threadId : null;
        const eventId = typeof record.eventId === "string" ? record.eventId : null;
        if (email && label) {
          return `- ${label} <${email}>`;
        }

        if (email) {
          return `- ${email}`;
        }

        if (threadId && label) {
          return `- ${label} (${threadId})`;
        }

        if (eventId && label) {
          return `- ${label} (${eventId})`;
        }

        if (threadId) {
          return `- ${threadId}`;
        }

        if (eventId) {
          return `- ${eventId}`;
        }
      }

      return typeof candidate === "string" ? `- ${candidate}` : null;
    })
    .filter((line): line is string => Boolean(line));

  return formatted.length > 0 ? `\n${formatted.join("\n")}` : "";
}

async function resolveRecipientLookup(input: {
  organizationId: string;
  ctx: ExecutionContextV1;
  action: ActionPlanV1["actions"][number];
  paramKey: string;
  param: ParamValueV1;
  runtimes: RuntimeSurfaceAvailability;
}): Promise<RuntimeResolverLookupResultV1 | null> {
  if (!["to", "cc", "bcc", "attendees"].includes(input.paramKey)) {
    return null;
  }

  const recipients = splitRecipientInput(input.param);
  if (recipients.length === 0) {
    return null;
  }

  if (recipients.every(isLiteralEmail)) {
    return {
      status: "resolved",
      resolvedParam: {
        kind: "primitive",
        value: recipients.map((email) => email.toLowerCase()),
      },
    };
  }

  const googleRuntime =
    input.runtimes.gmail ??
    input.runtimes.google_calendar ??
    input.runtimes.google_sheets;
  if (!googleRuntime) {
    return null;
  }

  const configResult = await getGoogleIntegrationConfig(
    googleRuntime.integration.id,
    input.organizationId
  );
  if (configResult.error || !configResult.data) {
    return null;
  }

  const resolvedEmails: string[] = [];
  const localCacheCandidates = getLocalRecipientCandidates(input.ctx);

  for (const recipient of recipients) {
    if (isLiteralEmail(recipient)) {
      resolvedEmails.push(recipient.toLowerCase());
      continue;
    }

    const peopleCandidates = await searchPeopleRecipientCandidates({
      accessToken: configResult.data.accessToken,
      query: recipient,
      grantedScopes: configResult.data.grantedScopes,
    });
    const gmailCandidates = await searchRecentGmailRecipientCandidates({
      accessToken: configResult.data.accessToken,
      query: recipient,
      grantedScopes: configResult.data.grantedScopes,
    });
    const cacheCandidates = localCacheCandidates
      .map((candidate) => ({
        ...candidate,
        score: scoreRecipientCandidate(recipient, candidate),
      }))
      .filter((candidate) => candidate.score >= 0.75);

    const matchedCandidates = dedupeRecipientCandidates([
      ...peopleCandidates,
      ...gmailCandidates,
      ...cacheCandidates,
    ]);

    if (matchedCandidates.length === 0) {
      return {
        status: "missing",
        reason: "recipient_requires_literal_email",
      };
    }

    const topScore = matchedCandidates[0]?.score ?? 0;
    const topCandidates = matchedCandidates.filter(
      (candidate) => topScore - candidate.score <= 0.05
    );

    if (topCandidates.length !== 1) {
      return {
        status: "ambiguous",
        reason: `ambiguous_${input.paramKey}`,
        output: {
          candidates: topCandidates.slice(0, 5).map((candidate) => ({
            email: candidate.email,
            label: candidate.label,
            source: candidate.source,
          })),
        },
      };
    }

    resolvedEmails.push(topCandidates[0].email);
  }

  return {
    status: "resolved",
    resolvedParam: {
      kind: "primitive",
      value: [...new Set(resolvedEmails)],
    },
  };
}

export async function resolveGmailThreadReferenceLookup(input: {
  organizationId: string;
  paramKey: string;
  param: ParamValueV1;
  runtimes: RuntimeSurfaceAvailability;
}, deps?: {
  getGoogleIntegrationConfig?: typeof getGoogleIntegrationConfig;
  requestGoogleGmail?: typeof requestGoogleGmail;
}): Promise<RuntimeResolverLookupResultV1 | null> {
  if (input.paramKey !== "threadRef") {
    return null;
  }

  const rawAlias = getSingleParamString(input.param);
  if (!rawAlias || !isLatestThreadAlias(rawAlias)) {
    return null;
  }

  const gmailRuntime = input.runtimes.gmail;
  if (!gmailRuntime) {
    return null;
  }

  const getConfig = deps?.getGoogleIntegrationConfig ?? getGoogleIntegrationConfig;
  const gmailRequest = deps?.requestGoogleGmail ?? requestGoogleGmail;
  const configResult = await getConfig(gmailRuntime.integration.id, input.organizationId);
  if (configResult.error || !configResult.data) {
    return null;
  }

  try {
    const listResponse = await gmailRequest<GmailThreadsListResponse>(
      configResult.data.accessToken,
      "/gmail/v1/users/me/threads?maxResults=1",
      { method: "GET" }
    );
    const threadId = listResponse.data.threads?.[0]?.id?.trim();

    if (!threadId) {
      return {
        status: "missing",
        reason: "missing_threadRef",
      };
    }

    const threadResponse = await gmailRequest<GmailThreadMetadataResponse>(
      configResult.data.accessToken,
      `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Subject`,
      { method: "GET" }
    );
    const subject = getHeaderValue(
      threadResponse.data.messages?.[0]?.payload?.headers,
      "Subject"
    );

    return {
      status: "resolved",
      resolvedParam: {
        kind: "reference",
        refType: "thread",
        value: threadId,
        ...(subject ? { label: subject } : {}),
      },
    };
  } catch {
    return null;
  }
}

async function resolveIntegrationLookup(input: {
  organizationId: string;
  ctx: ExecutionContextV1;
  action: ActionPlanV1["actions"][number];
  paramKey: string;
  param: ParamValueV1;
  runtimes: RuntimeSurfaceAvailability;
}): Promise<RuntimeResolverLookupResultV1 | null> {
  const threadLookup = await resolveGmailThreadReferenceLookup({
    organizationId: input.organizationId,
    paramKey: input.paramKey,
    param: input.param,
    runtimes: input.runtimes,
  });
  if (threadLookup) {
    return threadLookup;
  }

  return resolveRecipientLookup(input);
}

export async function planRuntimeSurfaceTurn(input: {
  requestedModel: string;
  organizationId: string;
  agentId: string;
  conversationId: string;
  latestUserMessage: string;
  messages: ChatMessage[];
  selectedSurfaces: string[];
  runtimes: RuntimeSurfaceAvailability;
  killSwitch?: RuntimeKillSwitchConfigV1;
  recentActionContext?: RecentActionContext | null;
}): Promise<RuntimeSurfacePlanningResult> {
  let plannerPlan: ActionPlanV1 | null = null;
  let plannerDraft: ActionPlanV1 | null = null;
  let plannerAttempted = false;
  let plannerErrorType: string | null = null;
  let plannerModel: string | null = null;
  let plannerProvider: string | null = null;
  let plannerTokensInput = 0;
  let plannerTokensOutput = 0;
  let plannerMetadata: RuntimePlannerSnapshot = null;

  if (
    shouldAttemptRuntimePlanner({
      selectedSurfaces: input.selectedSurfaces,
      runtimes: input.runtimes,
    })
  ) {
    plannerAttempted = true;

    try {
      const plannerResult = await planActionWithUsage({
        requestedModel: input.requestedModel,
        organizationId: input.organizationId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        latestUserMessage: input.latestUserMessage,
        messages: input.messages,
        recentActionContext: input.recentActionContext,
      });

      plannerPlan = plannerResult.plan;
      plannerDraft = plannerResult.plannerDraft;
      plannerModel = plannerResult.usage.model;
      plannerProvider = plannerResult.usage.provider;
      plannerTokensInput = plannerResult.usage.tokensInput;
      plannerTokensOutput = plannerResult.usage.tokensOutput;
      plannerMetadata = {
        intent: plannerResult.plannerDraft.intent,
        confidence: plannerResult.plannerDraft.confidence,
        missingFields: plannerResult.plannerDraft.missingFields,
        actions: plannerResult.plannerDraft.actions.map((action) => ({
          id: action.id,
          type: action.type,
          approvalMode: action.approvalMode,
        })),
      };
    } catch (error) {
      if (error instanceof LiteLLMError) {
        plannerErrorType = error.errorType;
      } else {
        console.error("runtime.surface_planner_error", {
          conversationId: input.conversationId,
          organizationId: input.organizationId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  return {
    plannerAttempted,
    plannerErrorType,
    plannerPlan,
    plannerDraft,
    plannerModel,
    plannerProvider,
    plannerTokensInput,
    plannerTokensOutput,
    plannerMetadata,
    routingDecision: resolveRuntimeChatRoutingDecision({
      selectedSurfaces: input.selectedSurfaces,
      runtimes: input.runtimes,
      plan: plannerPlan,
      plannerErrorType,
      killSwitch: input.killSwitch,
    }),
  };
}

export async function executeRuntimeSurfacePlan(input: {
  organizationId: string;
  agentId: string;
  conversationId: string;
  channel?: ExecutionContextV1["channel"];
  userId?: string;
  messageId?: string;
  latestUserMessage: string;
  requestedModel: string;
  llmTemperature: number;
  effectiveMaxTokens: number;
  systemPrompt: string;
  routePolicy: Parameters<typeof sendSemanticCompletion>[0]["policy"];
  conversationMetadata: Record<string, unknown>;
  planning: RuntimeSurfacePlanningResult;
  runtimes: RuntimeSurfaceAvailability;
  actionPlanOverride?: ActionPlanV1 | null;
  resumeFromCheckpoint?: Parameters<typeof runExecutionGraph>[0]["resumeFromCheckpoint"];
  existingRuntimeRun?: RuntimeRunRow | null;
}): Promise<RuntimeSurfaceExecutionResult | null> {
  const actionPlan = input.actionPlanOverride ?? input.planning.plannerPlan;
  if (input.planning.routingDecision.runtimeDecision === "reject") {
    return buildRuntimeRoutingRejectionResult({
      planning: input.planning,
      organizationId: input.organizationId,
      agentId: input.agentId,
      runtimes: input.runtimes,
      conversationMetadata: input.conversationMetadata,
    });
  }

  if (!actionPlan) {
    return buildRuntimeRoutingRejectionResult({
      planning: input.planning,
      organizationId: input.organizationId,
      agentId: input.agentId,
      runtimes: input.runtimes,
      conversationMetadata: input.conversationMetadata,
    });
  }

  const requestId = crypto.randomUUID();
  const traceId = crypto.randomUUID();

  const runtimeContext: ExecutionContextV1 = {
    requestId,
    traceId,
    organizationId: input.organizationId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    surface: "chat_web",
    channel: input.channel ?? "web",
    userId: input.userId,
    messageId: input.messageId,
    conversationMetadata: input.conversationMetadata,
    messageMetadata: {},
    budget: {
      plannerCallsMax: 1,
      plannerCallsUsed: actionPlan.actions.length > 0 ? 1 : 0,
      llmRepairCallsMaxPerAction: 2,
      llmRepairCallsMaxPerRequest: 2,
      syncRetriesMaxPerAction: 3,
      destructiveActionsMaxPerRequest: 1,
    },
  };

  let runtimeRunResult:
    | {
        data: RuntimeRunRow | null;
        error: string | null;
      }
    | null = null;

  if (input.existingRuntimeRun) {
    runtimeRunResult = {
      data: input.existingRuntimeRun,
      error: null,
    };
    runtimeContext.runtimeRunId = input.existingRuntimeRun.id;
    await updateRuntimeRun(input.organizationId, input.existingRuntimeRun.id, {
      status: "running",
      request_id: requestId,
      trace_id: traceId,
      action_plan: actionPlan as never,
      current_action_index: input.resumeFromCheckpoint?.actionIndex ?? 0,
      checkpoint_node: input.resumeFromCheckpoint?.node ?? null,
      finished_at: null,
    });
  } else {
    runtimeRunResult = await insertRuntimeRun({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      conversation_id: input.conversationId,
      request_id: requestId,
      trace_id: traceId,
      status: "running",
      planner_model: input.planning.plannerModel,
      planner_confidence: actionPlan.confidence,
      action_plan: actionPlan as never,
      current_action_index: 0,
      checkpoint_node: null,
      llm_calls:
        input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0 ? 1 : 0,
      tokens_input: input.planning.plannerTokensInput,
      tokens_output: input.planning.plannerTokensOutput,
      estimated_cost_usd: estimateLlmCostUsd(
        input.planning.plannerTokensInput,
        input.planning.plannerTokensOutput
      ),
      started_at: new Date().toISOString(),
    });

    if (runtimeRunResult.data) {
      runtimeContext.runtimeRunId = runtimeRunResult.data.id;
    } else {
      console.error("runtime.surface_run_insert_error", {
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        requestId,
        error: runtimeRunResult.error,
      });
    }
  }

  try {
    const getDefaultTimezone = async (): Promise<string | null> => {
      if (!input.runtimes.google_calendar) {
        return null;
      }

      const timezoneResult = await resolveGoogleCalendarIntegrationTimezone({
        integrationId: input.runtimes.google_calendar.integration.id,
        organizationId: input.organizationId,
      });

      return timezoneResult.data?.detectedTimezone ?? null;
    };

    const readLocalMetadata = async (payload: {
      ctx: ExecutionContextV1;
      action: ActionPlanV1["actions"][number];
      paramKey: string;
      param: ParamValueV1;
    }): Promise<ParamValueV1 | null> => {
      if (!["to", "cc", "bcc", "attendees"].includes(payload.paramKey)) {
        return null;
      }

      const recipients = splitRecipientInput(payload.param);
      if (recipients.length === 0 || recipients.some(isLiteralEmail)) {
        return null;
      }

      const candidates = getLocalRecipientCandidates(payload.ctx)
        .map((candidate) => ({
          ...candidate,
          score: Math.max(...recipients.map((recipient) => scoreRecipientCandidate(recipient, candidate))),
        }))
        .filter((candidate) => candidate.score >= 0.75);

      if (candidates.length === 0) {
        return null;
      }

      const deduped = dedupeRecipientCandidates(candidates);
      if (deduped.length === 1) {
        return {
          kind: "primitive",
          value: [deduped[0].email],
        };
      }

      return null;
    };

    const readIntegrationValue = (payload: {
      ctx: ExecutionContextV1;
      action: ActionPlanV1["actions"][number];
      paramKey: string;
      param: ParamValueV1;
    }) => resolveIntegrationLookup({
      organizationId: input.organizationId,
      ctx: payload.ctx,
      action: payload.action,
      paramKey: payload.paramKey,
      param: payload.param,
      runtimes: input.runtimes,
    });

    const runtimeResult = await runExecutionGraph({
      ctx: runtimeContext,
      actionPlan,
      nodes: createRuntimeNodeRegistryV1({
        resolverDeps: {
          getDefaultTimezone,
          readLocalMetadata,
          readIntegrationValue,
        },
        getPolicyContext: async ({ ctx, action }) =>
          buildRuntimePolicyContextV1({
            ctx,
            action,
            actionPlan,
            runtimes: input.runtimes,
          }),
      }),
      allowLlmRepair: () => false,
      resumeFromCheckpoint: input.resumeFromCheckpoint ?? null,
    });

    runtimeResult.trace.events = enrichRuntimeEvents({
      events: runtimeResult.trace.events,
      plannerMetrics:
        input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0
          ? {
              llmCalls: 1,
              tokensInput: input.planning.plannerTokensInput,
              tokensOutput: input.planning.plannerTokensOutput,
              provider: input.planning.plannerProvider,
            }
          : null,
    });

    const runtimePrimaryAction = runtimeResult.actions[0];
    const runtimeTraceSummary = buildRuntimeTraceSummary({
      plan: actionPlan,
      trace: runtimeResult.trace,
      outcome: runtimeResult.outcome,
    });
    const runtimeRecentContext = buildRecentDeclarativeContextFromRuntime({
      actions: runtimeResult.actions,
    });

    let runtimeSemanticContent: string | null = null;
    let runtimeSemanticModel: string | null = null;
    let runtimeSemanticProvider: string | null = null;
    let runtimeSemanticTokensInput = 0;
    let runtimeSemanticTokensOutput = 0;
    let runtimeSemanticResponseTimeMs: number | null = null;
    let runtimeSemanticRouting: RoutedCompletionMetadata | null = null;

    if (
      runtimeResult.outcome === "success" &&
      runtimePrimaryAction?.actionType === "summarize_thread" &&
      runtimePrimaryAction.output
    ) {
      try {
        const semanticResult = await sendSemanticCompletion({
          usageKind: "semantic_summary",
          requestedModel: input.requestedModel,
          policy: input.routePolicy,
          chatInput: {
            systemPrompt: input.systemPrompt,
            messages: [
              {
                role: "user",
                content: input.latestUserMessage,
              },
              {
                role: "assistant",
                content: renderRuntimeSuccessMessage({
                  actionType: "summarize_thread",
                  output: runtimePrimaryAction.output,
                }),
              },
            ],
            temperature: input.llmTemperature,
            maxTokens: input.effectiveMaxTokens,
            organizationId: input.organizationId,
            agentId: input.agentId,
            conversationId: input.conversationId,
          },
        });

        runtimeSemanticContent = semanticResult.output.content;
        runtimeSemanticModel = semanticResult.output.model;
        runtimeSemanticProvider = resolveProviderFromModel(semanticResult.output.model);
        runtimeSemanticTokensInput = semanticResult.output.tokensInput;
        runtimeSemanticTokensOutput = semanticResult.output.tokensOutput;
        runtimeSemanticResponseTimeMs = semanticResult.output.responseTimeMs;
        runtimeSemanticRouting = semanticResult.routing;

        runtimeResult.trace.events = enrichRuntimeEvents({
          events: runtimeResult.trace.events,
          postprocessMetrics: runtimePrimaryAction
            ? {
                actionId: runtimePrimaryAction.actionId,
                llmCalls: 1,
                tokensInput: runtimeSemanticTokensInput,
                tokensOutput: runtimeSemanticTokensOutput,
                provider: runtimeSemanticProvider,
              }
            : null,
        });
      } catch (error) {
        if (error instanceof LiteLLMError) {
          console.warn("runtime.surface_postprocess_error", {
            conversationId: input.conversationId,
            organizationId: input.organizationId,
            errorType: error.errorType,
          });
        } else {
          throw error;
        }
      }
    }

    const content = runtimePrimaryAction
      ? runtimeResult.outcome === "success" && runtimePrimaryAction.output
        ? renderRuntimeSuccessMessage({
            actionType: runtimePrimaryAction.actionType,
            output: runtimePrimaryAction.output,
            semanticSummary: runtimeSemanticContent,
          })
        : typeof runtimePrimaryAction.output?.question === "string"
          ? `${runtimePrimaryAction.output.question}${formatClarificationCandidates(
              Array.isArray(runtimePrimaryAction.output.candidates)
                ? runtimePrimaryAction.output.candidates
                : []
            )}`
        : renderRuntimeNonSuccessMessage({
            actionType: runtimePrimaryAction.actionType,
            status: runtimeResult.outcome === "success" ? "failed" : runtimeResult.outcome,
            reason: runtimePrimaryAction.reason,
            output: runtimePrimaryAction.output,
          })
      : "No pude completar el pedido con el runtime nuevo.";

    const tokensInput = input.planning.plannerTokensInput + runtimeSemanticTokensInput;
    const tokensOutput = input.planning.plannerTokensOutput + runtimeSemanticTokensOutput;
    const llmCalls =
      (input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0 ? 1 : 0) +
      (runtimeSemanticTokensInput > 0 || runtimeSemanticTokensOutput > 0 ? 1 : 0);
    const runtimePrimaryIndex = runtimePrimaryAction
      ? runtimeResult.actions.findIndex((action) => action.actionId === runtimePrimaryAction.actionId)
      : Math.max(runtimeResult.actions.length - 1, 0);
    const runtimeTerminalStatus =
      runtimePrimaryAction?.status === "waiting_approval"
        ? "waiting_approval"
        : runtimeResult.outcome === "success"
          ? runtimePrimaryAction?.status === "completed_with_degradation"
            ? "completed_with_degradation"
            : "success"
          : runtimeResult.outcome;

    if (runtimeRunResult.data) {
      await insertRuntimeEvents(
        runtimeResult.trace.events.map((event) =>
          buildRuntimeEventInsert({
            organizationId: input.organizationId,
            runtimeRunId: runtimeRunResult.data!.id,
            event,
            payload: {
              ...buildRuntimeEventOperationalPayload({
                ctx: runtimeContext,
                actionPlan,
                actionOutcomes: runtimeResult.actions,
                event,
              }),
              reason: event.reason ?? null,
            },
          })
        )
      );

      await updateRuntimeRun(input.organizationId, runtimeRunResult.data.id, {
        status: runtimeTerminalStatus,
        current_action_index: Math.max(runtimePrimaryIndex, 0),
        checkpoint_node: runtimeResult.trace.checkpoint?.node ?? null,
        llm_calls: llmCalls,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        estimated_cost_usd: estimateLlmCostUsd(tokensInput, tokensOutput),
        finished_at:
          runtimeTerminalStatus === "waiting_approval" ? null : new Date().toISOString(),
      });

      const usageEventInsertResult = await insertRuntimeUsageEvents(
        buildRuntimeUsageEvents({
          ctx: runtimeContext,
          runtimeRunId: runtimeRunResult.data.id,
          actionPlan,
          actionOutcomes: runtimeResult.actions,
          traceEvents: runtimeResult.trace.events,
          plannerUsage:
            input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0
              ? {
                  model: input.planning.plannerModel,
                  provider: input.planning.plannerProvider,
                  tokensInput: input.planning.plannerTokensInput,
                  tokensOutput: input.planning.plannerTokensOutput,
                }
              : null,
          postprocessUsage:
            runtimeSemanticTokensInput > 0 || runtimeSemanticTokensOutput > 0
              ? {
                  actionId: runtimePrimaryAction?.actionId,
                  model: runtimeSemanticModel,
                  provider: runtimeSemanticProvider,
                  tokensInput: runtimeSemanticTokensInput,
                  tokensOutput: runtimeSemanticTokensOutput,
                }
              : null,
        }).map(buildRuntimeUsageEventInsert)
      );

      if (usageEventInsertResult.error) {
        console.error("runtime.surface_usage_events_insert_error", {
          conversationId: input.conversationId,
          organizationId: input.organizationId,
          runtimeRunId: runtimeRunResult.data.id,
          error: usageEventInsertResult.error,
        });
      }
    }

    const runtimeClarificationSpec =
      runtimeResult.outcome === "needs_user" && runtimeResult.trace.checkpoint
        ? buildRuntimeClarificationSpec({
            source: "runtime",
            checkpoint: runtimeResult.trace.checkpoint,
            runtimeRunId: runtimeRunResult?.data?.id ?? null,
          })
        : null;
    const runtimeClarificationPatch =
      runtimeClarificationSpec && runtimePrimaryAction
        ? {
            pending_runtime_clarification: runtimeClarificationSpec,
            pending_chat_form: buildPendingChatFormFromRuntimeClarification({
              spec: runtimeClarificationSpec,
              sourceMessageId: input.messageId ?? null,
              message: content,
              timezone: runtimeResult.context.timezone ?? null,
            }),
          }
        : {};

    return {
      content,
      llmModel: runtimeSemanticModel ?? input.planning.plannerModel,
      llmProvider: runtimeSemanticProvider ?? input.planning.plannerProvider,
      responseTimeMs: runtimeSemanticResponseTimeMs ?? null,
      tokensInput,
      tokensOutput,
      routing: runtimeSemanticRouting,
      conversationMetadataPatch: {
        ...runtimeClarificationPatch,
        runtime_checkpoint:
          (runtimeResult.context.conversationMetadata.runtime_checkpoint ?? null) as ConversationMetadata["runtime_checkpoint"],
        runtime_trace_summary: runtimeTraceSummary,
        ...(runtimeRecentContext
          ? { recent_action_context: runtimeRecentContext }
          : {}),
      },
      assistantMetadataPatch: {
        runtime: {
          routingDecision: "runtime_primary",
          runtimeRunId: runtimeRunResult.data?.id ?? null,
          outcome: runtimeResult.outcome,
          executionOutcome: runtimeResult.outcome,
          actionPlan,
          approvalLinkage: runtimeResult.actions
            .filter((action) => typeof action.output?.approvalItemId === "string")
            .map((action) => ({
              actionId: action.actionId,
              approvalItemId: action.output?.approvalItemId as string,
            })),
          workflowLinkage: runtimeResult.actions
            .filter((action) => typeof action.output?.workflowRunId === "string")
            .map((action) => ({
              actionId: action.actionId,
              workflowRunId: action.output?.workflowRunId as string,
              workflowStepId:
                typeof action.output?.workflowStepId === "string"
                  ? (action.output.workflowStepId as string)
                  : null,
            })),
          actions: runtimeResult.actions.map((action) => ({
            actionId: action.actionId,
            actionType: action.actionType,
            status: action.status,
            approvalItemId:
              typeof action.output?.approvalItemId === "string"
                ? action.output.approvalItemId
                : null,
            workflowRunId:
              typeof action.output?.workflowRunId === "string"
                ? action.output.workflowRunId
                : null,
            workflowStepId:
              typeof action.output?.workflowStepId === "string"
                ? action.output.workflowStepId
                : null,
          })),
          llmUsageBreakdown: {
            planner: {
              model: input.planning.plannerModel,
              provider: input.planning.plannerProvider,
              tokensInput: input.planning.plannerTokensInput,
              tokensOutput: input.planning.plannerTokensOutput,
            },
            postprocess: runtimeSemanticModel || runtimeSemanticProvider
              ? {
                  model: runtimeSemanticModel,
                  provider: runtimeSemanticProvider,
                  tokensInput: runtimeSemanticTokensInput,
                  tokensOutput: runtimeSemanticTokensOutput,
                }
              : null,
          },
        },
        runtime_trace_summary: runtimeTraceSummary,
        ...(runtimeResult.context.conversationMetadata.runtime_checkpoint
          ? {
              runtime_checkpoint: runtimeResult.context.conversationMetadata.runtime_checkpoint,
            }
          : {}),
        runtime_outcome: runtimeResult.outcome,
      },
      runtimeRunId: runtimeRunResult.data?.id ?? null,
      requestId,
      traceId,
      outcome: runtimeResult.outcome,
      primaryActionType: runtimePrimaryAction?.actionType ?? null,
    };
  } catch (error) {
    if (runtimeRunResult.data) {
      await insertRuntimeEvents([
        buildRuntimeEventInsert({
          organizationId: input.organizationId,
          runtimeRunId: runtimeRunResult.data.id,
          event: {
            type: "runtime.plan.failed",
            requestId,
            traceId,
            runtimeRunId: runtimeRunResult.data.id,
            status: "failed",
            reason: error instanceof Error ? error.message : "unknown",
          },
          payload: {
            source: "runtime.surface_orchestrator",
          },
        }),
      ]);

      await updateRuntimeRun(input.organizationId, runtimeRunResult.data.id, {
        status: "failed",
        checkpoint_node: null,
        finished_at: new Date().toISOString(),
      });

      const failedUsageInsertResult = await insertRuntimeUsageEvents(
        buildRuntimeUsageEvents({
          ctx: runtimeContext,
          runtimeRunId: runtimeRunResult.data.id,
          actionPlan,
          actionOutcomes: [],
          traceEvents: [],
          plannerUsage:
            input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0
              ? {
                  model: input.planning.plannerModel,
                  provider: input.planning.plannerProvider,
                  tokensInput: input.planning.plannerTokensInput,
                  tokensOutput: input.planning.plannerTokensOutput,
                }
              : null,
        }).map(buildRuntimeUsageEventInsert)
      );

      if (failedUsageInsertResult.error) {
        console.error("runtime.surface_failed_usage_events_insert_error", {
          conversationId: input.conversationId,
          organizationId: input.organizationId,
          runtimeRunId: runtimeRunResult.data.id,
          error: failedUsageInsertResult.error,
        });
      }
    }

    console.error("runtime.surface_execution_error", {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      content: "No pude completar esa accion por un error interno del runtime nuevo. Intenta de nuevo.",
      llmModel: input.planning.plannerModel,
      llmProvider: input.planning.plannerProvider,
      responseTimeMs: null,
      tokensInput: input.planning.plannerTokensInput,
      tokensOutput: input.planning.plannerTokensOutput,
      routing: null,
      conversationMetadataPatch: {
        runtime_checkpoint: null,
        runtime_trace_summary: buildRuntimeTraceSummary({
          plan: actionPlan,
          trace: {
            requestId,
            traceId,
            planVersion: actionPlan.version,
            graph: [],
            actions: [],
            events: [],
          },
          outcome: "failed",
        }),
      },
      assistantMetadataPatch: {
        runtime: {
          routingDecision: "runtime_primary",
          runtimeRunId: runtimeRunResult.data?.id ?? null,
          outcome: "failed",
          executionOutcome: "failed",
          actionPlan,
          unsupportedActions: input.planning.routingDecision.unsupportedActions,
          llmUsageBreakdown: {
            planner: input.planning.plannerTokensInput > 0 || input.planning.plannerTokensOutput > 0
              ? {
                  model: input.planning.plannerModel,
                  provider: input.planning.plannerProvider,
                  tokensInput: input.planning.plannerTokensInput,
                  tokensOutput: input.planning.plannerTokensOutput,
                }
              : null,
            postprocess: null,
          },
        },
        runtime_outcome: "failed",
      },
      runtimeRunId: runtimeRunResult.data?.id ?? null,
      requestId,
      traceId,
      outcome: "failed",
      primaryActionType: actionPlan.actions[0]?.type ?? null,
    };
  }
}
