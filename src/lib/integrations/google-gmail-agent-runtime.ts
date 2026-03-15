import "server-only";

import {
  getGoogleIntegrationConfig,
  getGoogleRefreshState,
  rotateGoogleTokens,
} from "@/lib/db/google-integration-config";
import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { requestGoogleGmail, refreshGoogleAccessToken } from "@/lib/integrations/google";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  executeGoogleGmailReadToolSchema,
  executeGoogleGmailWriteToolSchema,
  isGmailReadOnlyAction,
  dedupeEmails,
  type ExecuteGoogleGmailReadToolInput,
  type ExecuteGoogleGmailWriteToolInput,
  type GmailAgentToolConfig,
  type GmailReadOnlyToolAction,
} from "@/lib/integrations/google-agent-tools";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import { isProviderRequestError, ProviderRequestError } from "@/lib/integrations/provider-errors";
import { coordinateIntegrationRefresh } from "@/lib/integrations/refresh-coordination";
import type {
  GoogleAgentRuntimeSafeError,
  GoogleAgentRuntimeSuccess,
} from "@/lib/integrations/google-agent-runtime";

type DbResult<T> = { data: T | null; error: string | null };

const GMAIL_SEARCH_FETCH_LIMIT = 12;
const GMAIL_MAX_RESULTS = 5;
const GMAIL_MAX_MESSAGES_PER_THREAD = 5;
const GMAIL_METHOD_KEY = "google_workspace.gmail.user_quota";
const GMAIL_WRITE_METHOD_KEY = "google_workspace.gmail.write_requests";
const GMAIL_STEP_HEADER = "X-AgentBuilder-Workflow-Step-Id";

type GmailMessagePart = {
  filename?: string;
  body?: { attachmentId?: string | null };
  parts?: GmailMessagePart[];
};

type GmailMessagePayload = {
  headers?: Array<{ name?: string; value?: string }>;
  filename?: string;
  body?: { attachmentId?: string | null };
  parts?: GmailMessagePart[];
};

type GmailThreadGetResponse = {
  id?: string;
  historyId?: string;
  snippet?: string;
  messages?: Array<{
    id?: string;
    threadId?: string;
    internalDate?: string;
    labelIds?: string[];
    snippet?: string;
    payload?: GmailMessagePayload;
  }>;
};

type GmailThreadsListResponse = {
  threads?: Array<{ id?: string }>;
};

type GmailDraftListResponse = {
  drafts?: Array<{
    id?: string;
    message?: {
      id?: string;
      threadId?: string;
      labelIds?: string[];
      payload?: GmailMessagePayload;
    };
  }>;
};

type GmailDraftSummary = NonNullable<GmailDraftListResponse["drafts"]>[number];

type GmailDraftCreateResponse = {
  id?: string;
  message?: {
    id?: string;
    threadId?: string;
    labelIds?: string[];
    payload?: GmailMessagePayload;
  };
};

type GmailMessageSendResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  payload?: GmailMessagePayload;
};

type GmailThreadModifyResponse = {
  id?: string;
  historyId?: string;
};

export type GmailThreadSummary = {
  threadId: string;
  subject: string | null;
  from: string | null;
  date: string | null;
  snippet: string | null;
};

export type GmailThreadMessageSummary = {
  messageId: string | null;
  rfcMessageId: string | null;
  from: string | null;
  to: string | null;
  replyTo: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  attachmentCount: number;
};

export type GmailSearchThreadsResult = {
  action: "search_threads";
  requestId: string | null;
  data: {
    query: string | null;
    threads: GmailThreadSummary[];
  };
  summary: string;
};

export type GmailReadThreadResult = {
  action: "read_thread";
  requestId: string | null;
  data: {
    threadId: string;
    subject: string | null;
    messageCount: number;
    latestMessageId: string | null;
    latestRfcMessageId: string | null;
    messages: GmailThreadMessageSummary[];
  };
  summary: string;
};

export type GoogleGmailReadToolExecutionResult =
  | GmailSearchThreadsResult
  | GmailReadThreadResult;

export type GoogleGmailWriteToolExecutionResult =
  | {
      action: "create_draft_reply";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "draft";
      data: {
        draftId: string | null;
        threadId: string;
        messageId: string | null;
        rfcMessageId: string | null;
        subject: string | null;
        status: "created" | "already_exists";
      };
      summary: string;
    }
  | {
      action: "send_reply";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "message";
      data: {
        messageId: string | null;
        threadId: string;
        rfcMessageId: string | null;
        subject: string | null;
        status: "sent";
      };
      summary: string;
    }
  | {
      action: "create_draft_email";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "draft";
      data: {
        draftId: string | null;
        threadId: string | null;
        messageId: string | null;
        rfcMessageId: string | null;
        subject: string | null;
        to: string[];
        status: "created" | "already_exists";
      };
      summary: string;
    }
  | {
      action: "send_email";
      requestId: string | null;
      providerObjectId: string | null;
      providerObjectType: "message";
      data: {
        messageId: string | null;
        threadId: string | null;
        rfcMessageId: string | null;
        subject: string | null;
        to: string[];
        status: "sent";
      };
      summary: string;
    }
  | {
      action: "apply_label";
      requestId: string | null;
      providerObjectId: string;
      providerObjectType: "thread";
      data: {
        threadId: string;
        messageId: string;
        labelId: string;
        labelName: string;
        status: "applied" | "already_applied";
      };
      summary: string;
    }
  | {
      action: "archive_thread";
      requestId: string | null;
      providerObjectId: string;
      providerObjectType: "thread";
      data: {
        threadId: string;
        messageId: string;
        status: "archived" | "already_archived";
      };
      summary: string;
    };

export type GoogleGmailAgentRuntime = GoogleAgentRuntimeSuccess & {
  surface: "gmail";
  config: GmailAgentToolConfig;
};

type GoogleGmailReadToolExecutorDeps = {
  getGoogleIntegrationConfig: typeof getGoogleIntegrationConfig;
  markIntegrationReauthRequired: typeof markIntegrationReauthRequired;
  refreshGoogleCredentials: typeof refreshGoogleCredentials;
  runGoogleGmailAction: typeof runGoogleGmailAction;
};

function isAuthFailure(error: unknown): error is ProviderRequestError {
  if (!isProviderRequestError(error)) {
    return false;
  }

  if (error.statusCode === 401) {
    return true;
  }

  if (error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid credentials") ||
    message.includes("token expired") ||
    message.includes("token has been expired") ||
    message.includes("token has been revoked") ||
    message.includes("expired or revoked") ||
    message.includes("invalid_grant") ||
    message.includes("login required") ||
    message.includes("unauthorized")
  );
}

function isPermissionFailure(error: unknown): error is ProviderRequestError {
  if (!isProviderRequestError(error) || error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("insufficient authentication scopes") ||
    message.includes("insufficient permissions") ||
    message.includes("permission denied") ||
    message.includes("accessnotconfigured") ||
    message.includes("api has not been used in project") ||
    message.includes("it is disabled") ||
    message.includes("metadata scope")
  );
}

function getGmailProviderErrorMessage(error: unknown, fallback: string): string {
  if (isProviderRequestError(error) && error.statusCode === 404) {
    return "No encontre ese hilo de Gmail.";
  }

  if (isPermissionFailure(error)) {
    return "Gmail rechazo la consulta por permisos insuficientes para esta superficie. Reconecta Gmail y acepta el scope de metadata antes de volver a intentar.";
  }

  if (error instanceof Error) {
    if (error.message.includes("label de Gmail")) {
      return error.message;
    }

    if (error.message.includes("destinatario")) {
      return error.message;
    }
  }

  return getSafeProviderErrorMessage(error, fallback);
}

function sanitizeText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeSubject(value: string | null | undefined): string | null {
  const sanitized = sanitizeText(value, 160);
  if (!sanitized) {
    return null;
  }

  return sanitized.replace(/^(?:re|fw|fwd)\s*:\s*/gi, "").trim() || sanitized;
}

function getHeaderValue(
  payload: GmailMessagePayload | undefined,
  headerName: string
): string | null {
  const header = payload?.headers?.find(
    (entry) => entry.name?.toLowerCase() === headerName.toLowerCase()
  );

  return sanitizeText(header?.value, headerName === "Subject" ? 160 : 180);
}

function normalizeEmailHeader(value: string | null | undefined): string | null {
  const sanitized = sanitizeText(value, 320);
  if (!sanitized) {
    return null;
  }

  const emailMatch = sanitized.match(/<([^>]+)>/);
  if (emailMatch?.[1]) {
    return sanitizeText(emailMatch[1], 254);
  }

  const bareEmailMatch = sanitized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return sanitizeText(bareEmailMatch?.[0] ?? sanitized, 254);
}

function getMessageTimestamp(
  message: NonNullable<GmailThreadGetResponse["messages"]>[number] | undefined
): number {
  if (!message?.internalDate) {
    return 0;
  }

  const parsed = Number(message.internalDate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countAttachmentsFromPart(part: GmailMessagePart | undefined): number {
  if (!part) {
    return 0;
  }

  const currentCount =
    Boolean(part.filename?.trim()) || Boolean(part.body?.attachmentId) ? 1 : 0;
  const childCount = (part.parts ?? []).reduce(
    (sum, child) => sum + countAttachmentsFromPart(child),
    0
  );

  return currentCount + childCount;
}

function countAttachments(payload: GmailMessagePayload | undefined): number {
  if (!payload) {
    return 0;
  }

  return countAttachmentsFromPart(payload);
}

function mapThreadSummary(thread: GmailThreadGetResponse): GmailThreadSummary | null {
  const messages = [...(thread.messages ?? [])].sort(
    (left, right) => getMessageTimestamp(right) - getMessageTimestamp(left)
  );
  const latestMessage = messages[0];
  const threadId = sanitizeText(thread.id, 128);

  if (!threadId) {
    return null;
  }

  return {
    threadId,
    subject: normalizeSubject(getHeaderValue(latestMessage?.payload, "Subject")),
    from: getHeaderValue(latestMessage?.payload, "From"),
    date: getHeaderValue(latestMessage?.payload, "Date"),
    snippet: sanitizeText(thread.snippet ?? latestMessage?.snippet, 180),
  };
}

function mapThreadMessageSummary(
  message: NonNullable<GmailThreadGetResponse["messages"]>[number]
): GmailThreadMessageSummary {
  return {
    messageId: sanitizeText(message.id, 128),
    rfcMessageId: getHeaderValue(message.payload, "Message-Id"),
    from: getHeaderValue(message.payload, "From"),
    to: getHeaderValue(message.payload, "To"),
    replyTo: getHeaderValue(message.payload, "Reply-To"),
    subject: normalizeSubject(getHeaderValue(message.payload, "Subject")),
    date: getHeaderValue(message.payload, "Date"),
    snippet: sanitizeText(message.snippet, 180),
    attachmentCount: countAttachments(message.payload),
  };
}

function getThreadLabelIds(thread: GmailThreadGetResponse): string[] {
  const labels = new Set<string>();

  for (const message of thread.messages ?? []) {
    for (const labelId of message.labelIds ?? []) {
      if (typeof labelId === "string" && labelId.trim().length > 0) {
        labels.add(labelId.trim());
      }
    }
  }

  return [...labels];
}

function encodeDraftRaw(content: string): string {
  return Buffer.from(content, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function findDraftForWorkflowStep(
  response: GmailDraftListResponse,
  threadId: string,
  workflowStepId: string
): GmailDraftSummary | null {
  return (
    response.drafts?.find((draft) => {
      if (sanitizeText(draft.message?.threadId, 128) !== threadId) {
        return false;
      }

      return (
        getHeaderValue(draft.message?.payload, GMAIL_STEP_HEADER) === workflowStepId
      );
    }) ?? null
  );
}

function buildDraftReplyMessage(input: {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  rfcMessageId?: string | null;
  workflowStepId: string;
}): string {
  const lines = [
    `To: ${input.to}`,
    ...(input.cc?.length ? [`Cc: ${dedupeEmails(input.cc).join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${dedupeEmails(input.bcc).join(", ")}`] : []),
    `Subject: Re: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    GMAIL_STEP_HEADER + `: ${input.workflowStepId}`,
    ...(input.rfcMessageId
      ? [
          `In-Reply-To: ${input.rfcMessageId}`,
          `References: ${input.rfcMessageId}`,
        ]
      : []),
    "",
    input.body,
  ];

  return lines.join("\r\n");
}

function buildNewEmailMessage(input: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  workflowStepId: string;
}): string {
  const lines = [
    `To: ${dedupeEmails(input.to).join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${dedupeEmails(input.cc).join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${dedupeEmails(input.bcc).join(", ")}`] : []),
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    GMAIL_STEP_HEADER + `: ${input.workflowStepId}`,
    "",
    input.body,
  ];

  return lines.join("\r\n");
}

async function sendGmailMessage(
  accessToken: string,
  organizationId: string,
  integrationId: string,
  input: {
    threadId?: string;
    raw: string;
    workflow?: {
      workflowRunId: string;
      workflowStepId: string;
    };
  }
): Promise<{ requestId: string | null; data: GmailMessageSendResponse }> {
  return requestGoogleGmail<GmailMessageSendResponse>(
    accessToken,
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.threadId ? { threadId: input.threadId } : {}),
        raw: input.raw,
      }),
    },
    {
      organizationId,
      integrationId,
      methodKey: GMAIL_WRITE_METHOD_KEY,
      workflowRunId: input.workflow?.workflowRunId,
      workflowStepId: input.workflow?.workflowStepId,
    }
  );
}

function matchesLocalQuery(thread: GmailThreadSummary, query: string | null | undefined): boolean {
  if (!query) {
    return true;
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  const haystack = [
    thread.threadId,
    thread.subject,
    thread.from,
    thread.snippet,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

async function fetchGmailThread(
  accessToken: string,
  threadId: string,
  organizationId: string,
  integrationId: string,
  methodKey = GMAIL_METHOD_KEY
): Promise<{ requestId: string | null; data: GmailThreadGetResponse }> {
  const searchParams = new URLSearchParams({
    format: "metadata",
    fields:
      "id,historyId,snippet,messages(id,threadId,internalDate,labelIds,snippet,payload(headers,filename,body/attachmentId,parts(filename,body/attachmentId,parts)))",
  });
  searchParams.append("metadataHeaders", "Subject");
  searchParams.append("metadataHeaders", "From");
  searchParams.append("metadataHeaders", "To");
  searchParams.append("metadataHeaders", "Date");
  searchParams.append("metadataHeaders", "Reply-To");
  searchParams.append("metadataHeaders", "Message-Id");
  searchParams.append("metadataHeaders", GMAIL_STEP_HEADER);

  return requestGoogleGmail<GmailThreadGetResponse>(
    accessToken,
    `/gmail/v1/users/me/threads/${threadId}?${searchParams.toString()}`,
    { method: "GET" },
    {
      organizationId,
      integrationId,
      methodKey,
    }
  );
}

async function listGmailDrafts(
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<{ requestId: string | null; data: GmailDraftListResponse }> {
  const searchParams = new URLSearchParams({
    maxResults: "20",
    fields: "drafts(id,message(id,threadId,labelIds,payload(headers)))",
  });
  searchParams.append("metadataHeaders", GMAIL_STEP_HEADER);

  return requestGoogleGmail<GmailDraftListResponse>(
    accessToken,
    `/gmail/v1/users/me/drafts?${searchParams.toString()}`,
    { method: "GET" },
    {
      organizationId,
      integrationId,
      methodKey: GMAIL_WRITE_METHOD_KEY,
    }
  );
}

async function createGmailDraft(
  accessToken: string,
  organizationId: string,
  integrationId: string,
  input: {
    threadId?: string;
    raw: string;
    workflow?: {
      workflowRunId: string;
      workflowStepId: string;
    };
  }
): Promise<{ requestId: string | null; data: GmailDraftCreateResponse }> {
  return requestGoogleGmail<GmailDraftCreateResponse>(
    accessToken,
    "/gmail/v1/users/me/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          ...(input.threadId ? { threadId: input.threadId } : {}),
          raw: input.raw,
        },
      }),
    },
    {
      organizationId,
      integrationId,
      methodKey: GMAIL_WRITE_METHOD_KEY,
      workflowRunId: input.workflow?.workflowRunId,
      workflowStepId: input.workflow?.workflowStepId,
    }
  );
}

async function modifyGmailThread(
  accessToken: string,
  organizationId: string,
  integrationId: string,
  input: {
    threadId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    workflow?: {
      workflowRunId: string;
      workflowStepId: string;
    };
  }
): Promise<{ requestId: string | null; data: GmailThreadModifyResponse }> {
  return requestGoogleGmail<GmailThreadModifyResponse>(
    accessToken,
    `/gmail/v1/users/me/threads/${encodeURIComponent(input.threadId)}/modify`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.addLabelIds?.length ? { addLabelIds: input.addLabelIds } : {}),
        ...(input.removeLabelIds?.length
          ? { removeLabelIds: input.removeLabelIds }
          : {}),
      }),
    },
    {
      organizationId,
      integrationId,
      methodKey: GMAIL_WRITE_METHOD_KEY,
      workflowRunId: input.workflow?.workflowRunId,
      workflowStepId: input.workflow?.workflowStepId,
    }
  );
}

async function listGmailLabels(
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<{
  requestId: string | null;
  data: {
    labels?: Array<{ id?: string; name?: string }>;
  };
}> {
  return requestGoogleGmail<{
    labels?: Array<{ id?: string; name?: string }>;
  }>(
    accessToken,
    "/gmail/v1/users/me/labels?fields=labels(id,name)",
    { method: "GET" },
    {
      organizationId,
      integrationId,
      methodKey: GMAIL_WRITE_METHOD_KEY,
    }
  );
}

function buildSearchSummary(query: string | null, threads: GmailThreadSummary[]): string {
  if (threads.length === 0) {
    return query
      ? `No encontre hilos recientes que coincidan con "${query}".`
      : "No encontre hilos recientes para mostrar.";
  }

  return query
    ? `Encontre ${threads.length} hilo(s) recientes que coinciden con "${query}".`
    : `Encontre ${threads.length} hilo(s) recientes en Gmail.`;
}

function buildReadSummary(subject: string | null, messageCount: number): string {
  return [
    `Lei el hilo ${subject ? `"${subject}"` : "sin asunto"}.`,
    `Mensajes resumidos: ${messageCount}.`,
    "Se usaron solo headers, snippet y conteo de adjuntos.",
  ].join(" ");
}

function getExecutionFallback(action: GmailReadOnlyToolAction): string {
  return action === "search_threads"
    ? "No se pudo consultar Gmail."
    : "No se pudo leer el hilo de Gmail.";
}

function getWriteExecutionFallback(
  action: ExecuteGoogleGmailWriteToolInput["action"]
): string {
  if (action === "create_draft_reply" || action === "create_draft_email") {
    return "No se pudo crear el borrador en Gmail.";
  }

  if (action === "send_reply" || action === "send_email") {
    return "No se pudo enviar el email en Gmail.";
  }

  if (action === "apply_label") {
    return "No se pudo aplicar el label en Gmail.";
  }

  return "No se pudo archivar el hilo en Gmail.";
}

export async function runGoogleGmailAction(
  input: ExecuteGoogleGmailReadToolInput,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<GoogleGmailReadToolExecutionResult> {
  if (input.action === "search_threads") {
    const listParams = new URLSearchParams({
      maxResults: String(GMAIL_SEARCH_FETCH_LIMIT),
      includeSpamTrash: "false",
    });
    listParams.append("labelIds", "INBOX");

    const threadsResponse = await requestGoogleGmail<GmailThreadsListResponse>(
      accessToken,
      `/gmail/v1/users/me/threads?${listParams.toString()}`,
      { method: "GET" },
      {
        organizationId,
        integrationId,
        methodKey: GMAIL_METHOD_KEY,
      }
    );

    const fetchedThreads = await Promise.all(
      (threadsResponse.data.threads ?? [])
        .map((thread) => sanitizeText(thread.id, 128))
        .filter((threadId): threadId is string => Boolean(threadId))
        .map((threadId) =>
          fetchGmailThread(accessToken, threadId, organizationId, integrationId)
        )
    );

    const threads = fetchedThreads
      .map((thread) => mapThreadSummary(thread.data))
      .filter((thread): thread is GmailThreadSummary => Boolean(thread))
      .filter((thread) => matchesLocalQuery(thread, input.query))
      .slice(0, input.maxResults ?? GMAIL_MAX_RESULTS);

    return {
      action: "search_threads",
      requestId: threadsResponse.requestId,
      data: {
        query: input.query ?? null,
        threads,
      },
      summary: buildSearchSummary(input.query ?? null, threads),
    };
  }

  const threadResponse = await fetchGmailThread(
    accessToken,
    input.threadId,
    organizationId,
    integrationId
  );
  const orderedMessages = [...(threadResponse.data.messages ?? [])]
    .sort((left, right) => getMessageTimestamp(right) - getMessageTimestamp(left))
    .slice(0, GMAIL_MAX_MESSAGES_PER_THREAD);
  const mappedMessages = orderedMessages.map(mapThreadMessageSummary);
  const subject =
    mappedMessages.find((message) => message.subject)?.subject ?? null;
  const latestMessage = mappedMessages[0] ?? null;

  return {
    action: "read_thread",
    requestId: threadResponse.requestId,
    data: {
      threadId: sanitizeText(threadResponse.data.id, 128) ?? input.threadId,
      subject,
      messageCount: mappedMessages.length,
      latestMessageId: latestMessage?.messageId ?? null,
      latestRfcMessageId: latestMessage?.rfcMessageId ?? null,
      messages: mappedMessages,
    },
    summary: buildReadSummary(subject, mappedMessages.length),
  };
}

function findMessageById(
  thread: GmailThreadGetResponse,
  messageId: string
): NonNullable<GmailThreadGetResponse["messages"]>[number] | null {
  return (
    thread.messages?.find((message) => sanitizeText(message.id, 128) === messageId) ?? null
  );
}

function normalizeLabelName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function resolveLabelMatch(
  labels: Array<{ id?: string; name?: string }>,
  labelName: string
): { id: string; name: string } | null {
  const normalizedLabelName = normalizeLabelName(labelName).toLowerCase();
  const label = labels.find((entry) => {
    const name = normalizeLabelName(entry.name ?? "");
    return name.toLowerCase() === normalizedLabelName;
  });

  const labelId = sanitizeText(label?.id, 128);
  const resolvedName = sanitizeText(label?.name, 225);
  return labelId && resolvedName ? { id: labelId, name: resolvedName } : null;
}

function buildDraftSummary(status: "created" | "already_exists", subject: string | null): string {
  return status === "already_exists"
    ? `El borrador para ${subject ? `"${subject}"` : "ese hilo"} ya existia y se reutilizo.`
    : `Se creo un borrador de respuesta para ${subject ? `"${subject}"` : "ese hilo"}.`;
}

export async function runGoogleGmailWriteAction(
  input: ExecuteGoogleGmailWriteToolInput,
  accessToken: string,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<GoogleGmailWriteToolExecutionResult> {
  // --- Standalone actions (no thread required) ---
  if (input.action === "create_draft_email") {
    if (!workflow?.workflowStepId) {
      throw new Error("workflowStepId requerido para idempotencia de Gmail draft.");
    }

    const to = dedupeEmails(input.to);
    if (to.length === 0) {
      throw new Error("Se necesita al menos un destinatario valido para crear el borrador.");
    }

    const subject = input.subject ?? "Sin asunto";
    const draftResponse = await createGmailDraft(accessToken, organizationId, integrationId, {
      raw: encodeDraftRaw(
        buildNewEmailMessage({
          to,
          cc: input.cc,
          bcc: input.bcc,
          subject,
          body: input.body,
          workflowStepId: workflow.workflowStepId,
        })
      ),
      workflow,
    });

    return {
      action: "create_draft_email",
      requestId: draftResponse.requestId,
      providerObjectId: sanitizeText(draftResponse.data.id, 128),
      providerObjectType: "draft",
      data: {
        draftId: sanitizeText(draftResponse.data.id, 128),
        threadId: sanitizeText(draftResponse.data.message?.threadId, 128),
        messageId: sanitizeText(draftResponse.data.message?.id, 128),
        rfcMessageId: getHeaderValue(draftResponse.data.message?.payload, "Message-Id"),
        subject,
        to,
        status: "created",
      },
      summary: `Se creo un borrador nuevo para ${to.join(", ")}${subject !== "Sin asunto" ? ` con asunto "${subject}"` : ""}.`,
    };
  }

  if (input.action === "send_email") {
    if (!workflow?.workflowStepId) {
      throw new Error("workflowStepId requerido para trazabilidad de Gmail send.");
    }

    const to = dedupeEmails(input.to);
    if (to.length === 0) {
      throw new Error("Se necesita al menos un destinatario valido para enviar el email.");
    }

    const subject = input.subject ?? "Sin asunto";
    const sendResponse = await sendGmailMessage(accessToken, organizationId, integrationId, {
      raw: encodeDraftRaw(
        buildNewEmailMessage({
          to,
          cc: input.cc,
          bcc: input.bcc,
          subject,
          body: input.body,
          workflowStepId: workflow.workflowStepId,
        })
      ),
      workflow,
    });

    return {
      action: "send_email",
      requestId: sendResponse.requestId,
      providerObjectId: sanitizeText(sendResponse.data.id, 128),
      providerObjectType: "message",
      data: {
        messageId: sanitizeText(sendResponse.data.id, 128),
        threadId: sanitizeText(sendResponse.data.threadId, 128),
        rfcMessageId: getHeaderValue(sendResponse.data.payload, "Message-Id"),
        subject,
        to,
        status: "sent",
      },
      summary: `Se envio un email nuevo a ${to.join(", ")}${subject !== "Sin asunto" ? ` con asunto "${subject}"` : ""}.`,
    };
  }

  // --- Thread-scoped actions ---
  const threadResponse = await fetchGmailThread(
    accessToken,
    input.threadId,
    organizationId,
    integrationId,
    GMAIL_WRITE_METHOD_KEY
  );
  const targetMessage = findMessageById(threadResponse.data, input.messageId);

  if (!targetMessage) {
    throw new ProviderRequestError({
      provider: "google_workspace",
      message: "No encontre el mensaje de referencia dentro del hilo de Gmail.",
      statusCode: 404,
    });
  }

  if (input.action === "create_draft_reply") {
    if (!workflow?.workflowStepId) {
      throw new Error("workflowStepId requerido para idempotencia de Gmail draft.");
    }

    const draftsResponse = await listGmailDrafts(
      accessToken,
      organizationId,
      integrationId
    );
    const existingDraft = findDraftForWorkflowStep(
      draftsResponse.data,
      input.threadId,
      workflow.workflowStepId
    );

    if (existingDraft) {
      return {
        action: "create_draft_reply",
        requestId: draftsResponse.requestId,
        providerObjectId: sanitizeText(existingDraft.id, 128),
        providerObjectType: "draft",
        data: {
          draftId: sanitizeText(existingDraft.id, 128),
          threadId: input.threadId,
          messageId: sanitizeText(existingDraft.message?.id, 128),
          rfcMessageId: getHeaderValue(existingDraft.message?.payload, "Message-Id"),
          subject: normalizeSubject(getHeaderValue(existingDraft.message?.payload, "Subject")) ?? input.subject ?? null,
          status: "already_exists",
        },
        summary: buildDraftSummary(
          "already_exists",
          normalizeSubject(getHeaderValue(existingDraft.message?.payload, "Subject")) ?? input.subject ?? null
        ),
      };
    }

    const recipient =
      normalizeEmailHeader(getHeaderValue(targetMessage.payload, "Reply-To")) ??
      normalizeEmailHeader(getHeaderValue(targetMessage.payload, "From"));

    if (!recipient) {
      throw new Error("No pude resolver el destinatario para crear el borrador.");
    }

    const subject =
      normalizeSubject(getHeaderValue(targetMessage.payload, "Subject")) ??
      normalizeSubject(input.subject) ??
      "Sin asunto";
    const rfcMessageId = getHeaderValue(targetMessage.payload, "Message-Id");
    const draftResponse = await createGmailDraft(accessToken, organizationId, integrationId, {
      threadId: input.threadId,
      raw: encodeDraftRaw(
        buildDraftReplyMessage({
          to: recipient,
          cc: input.cc,
          bcc: input.bcc,
          subject,
          body: input.body,
          rfcMessageId,
          workflowStepId: workflow.workflowStepId,
        })
      ),
      workflow,
    });

    return {
      action: "create_draft_reply",
      requestId: draftResponse.requestId,
      providerObjectId: sanitizeText(draftResponse.data.id, 128),
      providerObjectType: "draft",
      data: {
        draftId: sanitizeText(draftResponse.data.id, 128),
        threadId: sanitizeText(draftResponse.data.message?.threadId, 128) ?? input.threadId,
        messageId: sanitizeText(draftResponse.data.message?.id, 128),
        rfcMessageId: getHeaderValue(draftResponse.data.message?.payload, "Message-Id"),
        subject,
        status: "created",
      },
      summary: buildDraftSummary("created", subject),
    };
  }

  if (input.action === "send_reply") {
    if (!workflow?.workflowStepId) {
      throw new Error("workflowStepId requerido para trazabilidad de Gmail send.");
    }

    const recipient =
      normalizeEmailHeader(getHeaderValue(targetMessage.payload, "Reply-To")) ??
      normalizeEmailHeader(getHeaderValue(targetMessage.payload, "From"));

    if (!recipient) {
      throw new Error("No pude resolver el destinatario para enviar la respuesta.");
    }

    const subject =
      normalizeSubject(getHeaderValue(targetMessage.payload, "Subject")) ??
      normalizeSubject(input.subject) ??
      "Sin asunto";
    const rfcMessageId = getHeaderValue(targetMessage.payload, "Message-Id");
    const sendResponse = await sendGmailMessage(accessToken, organizationId, integrationId, {
      threadId: input.threadId,
      raw: encodeDraftRaw(
        buildDraftReplyMessage({
          to: recipient,
          cc: input.cc,
          bcc: input.bcc,
          subject,
          body: input.body,
          rfcMessageId,
          workflowStepId: workflow.workflowStepId,
        })
      ),
      workflow,
    });

    return {
      action: "send_reply",
      requestId: sendResponse.requestId,
      providerObjectId: sanitizeText(sendResponse.data.id, 128),
      providerObjectType: "message",
      data: {
        messageId: sanitizeText(sendResponse.data.id, 128),
        threadId: sanitizeText(sendResponse.data.threadId, 128) ?? input.threadId,
        rfcMessageId: getHeaderValue(sendResponse.data.payload, "Message-Id"),
        subject,
        status: "sent",
      },
      summary: `Se envio la respuesta para ${subject ? `"${subject}"` : "ese hilo"}.`,
    };
  }

  if (input.action === "apply_label") {
    const labelsResponse = await listGmailLabels(accessToken, organizationId, integrationId);
    const label = resolveLabelMatch(labelsResponse.data.labels ?? [], input.labelName);

    if (!label) {
      throw new Error(`No existe un label de Gmail llamado "${input.labelName}".`);
    }

    const currentLabels = getThreadLabelIds(threadResponse.data);
    if (currentLabels.includes(label.id)) {
      return {
        action: "apply_label",
        requestId: labelsResponse.requestId,
        providerObjectId: input.threadId,
        providerObjectType: "thread",
        data: {
          threadId: input.threadId,
          messageId: input.messageId,
          labelId: label.id,
          labelName: label.name,
          status: "already_applied",
        },
        summary: `El label "${label.name}" ya estaba aplicado en ese hilo.`,
      };
    }

    const modifyResponse = await modifyGmailThread(
      accessToken,
      organizationId,
      integrationId,
      {
        threadId: input.threadId,
        addLabelIds: [label.id],
        workflow,
      }
    );

    return {
      action: "apply_label",
      requestId: modifyResponse.requestId ?? labelsResponse.requestId,
      providerObjectId: input.threadId,
      providerObjectType: "thread",
      data: {
        threadId: input.threadId,
        messageId: input.messageId,
        labelId: label.id,
        labelName: label.name,
        status: "applied",
      },
      summary: `Se aplico el label "${label.name}" en el hilo.`,
    };
  }

  const currentLabels = getThreadLabelIds(threadResponse.data);
  if (!currentLabels.includes("INBOX")) {
    return {
      action: "archive_thread",
      requestId: threadResponse.requestId,
      providerObjectId: input.threadId,
      providerObjectType: "thread",
      data: {
        threadId: input.threadId,
        messageId: input.messageId,
        status: "already_archived",
      },
      summary: "El hilo ya estaba archivado fuera de Inbox.",
    };
  }

  const modifyResponse = await modifyGmailThread(
    accessToken,
    organizationId,
    integrationId,
    {
      threadId: input.threadId,
      removeLabelIds: ["INBOX"],
      workflow,
    }
  );

  return {
    action: "archive_thread",
    requestId: modifyResponse.requestId,
    providerObjectId: input.threadId,
    providerObjectType: "thread",
    data: {
      threadId: input.threadId,
      messageId: input.messageId,
      status: "archived",
    },
    summary: "Se archivo el hilo de Gmail.",
  };
}

async function refreshGoogleCredentials(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  refreshToken: string;
}): Promise<DbResult<{ accessToken: string }>> {
  try {
    const currentConfigResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );

    if (currentConfigResult.error || !currentConfigResult.data) {
      return {
        data: null,
        error: currentConfigResult.error ?? "No se pudo leer la configuracion de Gmail",
      };
    }
    const currentConfig = currentConfigResult.data;

    const coordination = await coordinateIntegrationRefresh({
      provider: "google",
      integrationId: input.integrationId,
      loadState: async () => {
        const stateResult = await getGoogleRefreshState(
          input.integrationId,
          input.organizationId
        );
        return stateResult.data ?? { tokenGeneration: 0, authStatus: null };
      },
      refresh: async () => {
        const refreshResult = await refreshGoogleAccessToken(input.refreshToken);
        const rotatedResult = await rotateGoogleTokens({
          integrationId: input.integrationId,
          organizationId: input.organizationId,
          userId: input.userId,
          accessToken: refreshResult.accessToken,
          ...(refreshResult.refreshToken !== null
            ? { refreshToken: refreshResult.refreshToken }
            : {}),
          grantedScopes: refreshResult.grantedScopes,
          accessTokenExpiresAt: refreshResult.accessTokenExpiresAt,
          connectedEmail: refreshResult.connectedEmail,
          workspaceCustomerId: refreshResult.workspaceCustomerId,
          tokenType: refreshResult.tokenType,
          googleCalendarPrimaryTimezone:
            currentConfig.googleCalendarPrimaryTimezone,
          googleCalendarUserTimezone:
            currentConfig.googleCalendarUserTimezone,
        });

        if (rotatedResult.error) {
          throw new Error(rotatedResult.error);
        }
      },
    });

    if (coordination.kind === "timeout") {
      return {
        data: null,
        error: "Gmail esta refrescando credenciales en otro request. Reintenta en unos segundos.",
      };
    }

    const configResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );
    if (configResult.error || !configResult.data) {
      return {
        data: null,
        error: configResult.error ?? "No se pudo recargar Gmail",
      };
    }

    if (coordination.kind === "follower" && configResult.data.authStatus === "reauth_required") {
      return {
        data: null,
        error: "La integracion necesita reautenticacion antes de volver a operar.",
      };
    }

    return {
      data: {
        accessToken: configResult.data.accessToken,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo refrescar la sesion de Gmail",
    };
  }
}

export function assertGoogleGmailRuntimeUsable(
  runtime: GoogleAgentRuntimeSuccess
): DbResult<GoogleGmailAgentRuntime> {
  if (runtime.surface !== "gmail") {
    return { data: null, error: "La surface Gmail no esta disponible." };
  }

  const access = assertUsableIntegration(runtime.integration);
  return access.ok
    ? { data: runtime as GoogleGmailAgentRuntime, error: null }
    : { data: null, error: access.message };
}

export function assertGoogleGmailActionEnabled(
  runtime: GoogleGmailAgentRuntime,
  action: ExecuteGoogleGmailReadToolInput["action"] | ExecuteGoogleGmailWriteToolInput["action"]
): DbResult<GoogleGmailAgentRuntime> {
  if (!runtime.config.allowed_actions.includes(action)) {
    return {
      data: null,
      error: "La accion pedida no esta habilitada para este agente.",
    };
  }

  return { data: runtime, error: null };
}

export function formatGoogleGmailResultForPrompt(
  result: GoogleGmailReadToolExecutionResult
): string {
  if (result.action === "search_threads") {
    return [
      "CONTENIDO EXTERNO NO CONFIABLE: GMAIL",
      "<gmail_external_content>",
      "provider=gmail",
      "action=search_threads",
      `query=${result.data.query ?? "none"}`,
      `thread_count=${result.data.threads.length}`,
      ...result.data.threads.flatMap((thread, index) => [
        `thread_${index + 1}_id=${thread.threadId}`,
        `thread_${index + 1}_subject=${thread.subject ?? "sin asunto"}`,
      ]),
      "</gmail_external_content>",
    ].join("\n");
  }

  return [
    "CONTENIDO EXTERNO NO CONFIABLE: GMAIL",
    "<gmail_external_content>",
    "provider=gmail",
    "action=read_thread",
    `thread_id=${result.data.threadId}`,
    `subject=${result.data.subject ?? "sin asunto"}`,
    `message_count=${result.data.messageCount}`,
    ...result.data.messages.flatMap((message, index) => [
      `message_${index + 1}_id=${message.messageId ?? "unknown"}`,
      `message_${index + 1}_rfc_id=${message.rfcMessageId ?? "unknown"}`,
      `message_${index + 1}_from=${message.from ?? "unknown"}`,
      `message_${index + 1}_to=${message.to ?? "unknown"}`,
      `message_${index + 1}_subject=${message.subject ?? "sin asunto"}`,
      `message_${index + 1}_date=${message.date ?? "sin fecha"}`,
      `message_${index + 1}_snippet=${message.snippet ?? "sin snippet"}`,
      `message_${index + 1}_attachment_count=${message.attachmentCount}`,
    ]),
    "</gmail_external_content>",
  ].join("\n");
}

export function createRecentGmailThreadContext(input: {
  threadId: string;
  messageId?: string | null;
  rfcMessageId?: string | null;
  subject: string | null;
}): string {
  return [
    `thread_id=${sanitizeText(input.threadId, 128) ?? input.threadId}`,
    ...(input.messageId
      ? [`message_id=${sanitizeText(input.messageId, 128) ?? input.messageId}`]
      : []),
    ...(input.rfcMessageId
      ? [`rfc_message_id=${sanitizeText(input.rfcMessageId, 255) ?? input.rfcMessageId}`]
      : []),
    `subject=${normalizeSubject(input.subject) ?? "sin asunto"}`,
  ].join("\n");
}

export function createGoogleGmailReadToolExecutor(
  deps: GoogleGmailReadToolExecutorDeps = {
    getGoogleIntegrationConfig,
    markIntegrationReauthRequired,
    refreshGoogleCredentials,
    runGoogleGmailAction,
  }
): (input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleGmailAgentRuntime;
  actionInput: ExecuteGoogleGmailReadToolInput;
}) => Promise<DbResult<GoogleGmailReadToolExecutionResult>> {
  return async function executeGoogleGmailReadToolWithDeps(input) {
    const parsedInput = executeGoogleGmailReadToolSchema.safeParse(input.actionInput);
    if (!parsedInput.success) {
      return { data: null, error: "La consulta de Gmail no es valida." };
    }

    if (!isGmailReadOnlyAction(parsedInput.data.action)) {
      return {
        data: null,
        error: "Gmail v1 solo permite acciones de lectura con metadata segura.",
      };
    }

    const actionEnabled = assertGoogleGmailActionEnabled(
      input.runtime,
      parsedInput.data.action
    );
    if (actionEnabled.error || !actionEnabled.data) {
      return { data: null, error: actionEnabled.error };
    }

    const configResult = await deps.getGoogleIntegrationConfig(
      actionEnabled.data.integration.id,
      input.organizationId
    );
    if (configResult.error || !configResult.data) {
      if (configResult.error) {
        await deps.markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          configResult.error
        );
      }

      return {
        data: null,
        error: "La integracion necesita reautenticacion antes de volver a operar.",
      };
    }

    let accessToken = configResult.data.accessToken;

    try {
      const result = await deps.runGoogleGmailAction(
        parsedInput.data,
        accessToken,
        input.organizationId,
        actionEnabled.data.integration.id
      );
      return { data: result, error: null };
    } catch (error) {
      console.error("gmail.read_tool_api_error", {
        action: parsedInput.data.action,
        organizationId: input.organizationId,
        isProviderError: isProviderRequestError(error),
        statusCode: isProviderRequestError(error) ? error.statusCode : null,
        message: error instanceof Error ? error.message : String(error),
      });

      if (isAuthFailure(error) && configResult.data.refreshToken) {
        const refreshResult = await deps.refreshGoogleCredentials({
          organizationId: input.organizationId,
          userId: input.userId,
          integrationId: actionEnabled.data.integration.id,
          refreshToken: configResult.data.refreshToken,
        });

        if (!refreshResult.error && refreshResult.data) {
          accessToken = refreshResult.data.accessToken;

          try {
            const retried = await deps.runGoogleGmailAction(
              parsedInput.data,
              accessToken,
              input.organizationId,
              actionEnabled.data.integration.id
            );
            return { data: retried, error: null };
          } catch (retryError) {
            console.error("gmail.read_tool_retry_error", {
              action: parsedInput.data.action,
              organizationId: input.organizationId,
              isProviderError: isProviderRequestError(retryError),
              statusCode: isProviderRequestError(retryError) ? retryError.statusCode : null,
              message: retryError instanceof Error ? retryError.message : String(retryError),
            });

            if (isAuthFailure(retryError)) {
              await deps.markIntegrationReauthRequired(
                actionEnabled.data.integration.id,
                input.organizationId,
                retryError.message
              );
            }

            return {
              data: null,
              error: getGmailProviderErrorMessage(
                retryError,
                getExecutionFallback(parsedInput.data.action)
              ),
            };
          }
        }

        if (
          refreshResult.error?.includes("reautenticacion") ||
          refreshResult.error?.includes("refresh")
        ) {
          await deps.markIntegrationReauthRequired(
            actionEnabled.data.integration.id,
            input.organizationId,
            refreshResult.error
          );
        }

        return {
          data: null,
          error: refreshResult.error ?? getExecutionFallback(parsedInput.data.action),
        };
      }

      if (isAuthFailure(error)) {
        await deps.markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          error.message
        );
      }

      return {
        data: null,
        error: getGmailProviderErrorMessage(
          error,
          getExecutionFallback(parsedInput.data.action)
        ),
      };
    }
  };
}

export const executeGoogleGmailReadTool = createGoogleGmailReadToolExecutor();

export async function executeGoogleGmailWriteToolAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleGmailAgentRuntime;
  actionInput: ExecuteGoogleGmailWriteToolInput;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<GoogleGmailWriteToolExecutionResult>> {
  const parsedInput = executeGoogleGmailWriteToolSchema.safeParse(input.actionInput);
  if (!parsedInput.success) {
    return {
      data: null,
      error: "La accion de Gmail no es valida.",
    };
  }

  const actionEnabled = assertGoogleGmailActionEnabled(
    input.runtime,
    parsedInput.data.action
  );
  if (actionEnabled.error || !actionEnabled.data) {
    return { data: null, error: actionEnabled.error };
  }

  const configResult = await getGoogleIntegrationConfig(
    actionEnabled.data.integration.id,
    input.organizationId
  );
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        configResult.error
      );
    }

    return {
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    };
  }

  let accessToken = configResult.data.accessToken;

  try {
    const result = await runGoogleGmailWriteAction(
      parsedInput.data,
      accessToken,
      input.organizationId,
      actionEnabled.data.integration.id,
      input.workflow
    );
    return { data: result, error: null };
  } catch (error) {
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshGoogleCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: actionEnabled.data.integration.id,
        refreshToken: configResult.data.refreshToken,
      });

      if (!refreshResult.error && refreshResult.data) {
        accessToken = refreshResult.data.accessToken;

        try {
          const retried = await runGoogleGmailWriteAction(
            parsedInput.data,
            accessToken,
            input.organizationId,
            actionEnabled.data.integration.id,
            input.workflow
          );
          return { data: retried, error: null };
        } catch (retryError) {
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(
              actionEnabled.data.integration.id,
              input.organizationId,
              retryError.message
            );
          }

          return {
            data: null,
            error: getGmailProviderErrorMessage(
              retryError,
              getWriteExecutionFallback(parsedInput.data.action)
            ),
          };
        }
      }

      if (
        refreshResult.error?.includes("reautenticacion") ||
        refreshResult.error?.includes("refresh")
      ) {
        await markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          refreshResult.error
        );
      }

      return {
        data: null,
        error:
          refreshResult.error ?? getWriteExecutionFallback(parsedInput.data.action),
      };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        error.message
      );
    }

    return {
      data: null,
      error: getGmailProviderErrorMessage(
        error,
        getWriteExecutionFallback(parsedInput.data.action)
      ),
    };
  }
}

export function toGoogleGmailRuntimeSafeError(
  error: string,
  action?: ExecuteGoogleGmailReadToolInput["action"] | ExecuteGoogleGmailWriteToolInput["action"]
): GoogleAgentRuntimeSafeError {
  if (error.includes("reautenticacion")) {
    return {
      ok: false,
      surface: "gmail",
      action,
      code: "integration_unavailable",
      message: "La integracion necesita reautenticacion antes de volver a operar.",
      retryable: false,
    };
  }

  if (error.includes("velocidad") || error.includes("cuota")) {
    return {
      ok: false,
      surface: "gmail",
      action,
      code: "rate_limited",
      message: "Gmail pidio bajar la velocidad. Reintenta en unos minutos.",
      retryable: true,
    };
  }

  if (error.includes("permisos insuficientes") || error.includes("scope")) {
    return {
      ok: false,
      surface: "gmail",
      action,
      code: "integration_unavailable",
      message: error,
      retryable: false,
    };
  }

  if (
    error.includes("no es valida") ||
    error.includes("solo permite") ||
    error.includes("No existe un label") ||
    error.includes("destinatario")
  ) {
    return {
      ok: false,
      surface: "gmail",
      action,
      code: "validation_error",
      message: error,
      retryable: false,
    };
  }

  return {
    ok: false,
    surface: "gmail",
    action,
    code: "provider_error",
    message: error,
    retryable: !error.includes("No encontre ese hilo"),
  };
}
