import type {
  ExecuteGoogleGmailToolInput,
  GmailAgentToolConfig,
} from "@/lib/integrations/google-agent-tools";
import { extractGmailIntent } from "@/lib/chat/gmail-intent-extractor";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GmailRecentThreadContext = {
  threadId: string | null;
  messageId: string | null;
  rfcMessageId: string | null;
  subject: string | null;
};

export type PlanGoogleGmailToolActionResult =
  | {
      kind: "search";
      input: {
        action: "search_threads";
        query: string | null;
        maxResults: number;
      };
    }
  | {
      kind: "read";
      input: {
        action: "read_thread";
        threadId: string;
      };
    }
  | {
      kind: "write";
      requiresConfirmation: true;
      input:
        | Extract<ExecuteGoogleGmailToolInput, { action: "create_draft_reply" }>
        | Extract<ExecuteGoogleGmailToolInput, { action: "send_reply" }>
        | Extract<ExecuteGoogleGmailToolInput, { action: "apply_label" }>
        | Extract<ExecuteGoogleGmailToolInput, { action: "archive_thread" }>;
    }
  | {
      kind: "write_standalone";
      requiresConfirmation: true;
      input:
        | {
            action: "create_draft_email";
            to: string[];
            cc?: string[];
            bcc?: string[];
            subject?: string;
            body: string;
          }
        | {
            action: "send_email";
            to: string[];
            cc?: string[];
            bcc?: string[];
            subject?: string;
            body: string;
          };
    }
  | {
      kind: "resolve_thread_for_write";
      readInput: {
        action: "read_thread";
        threadId: string;
      };
      writeAction:
        | {
            action: "create_draft_reply";
            body: string;
            subject?: string | null;
            rfcMessageId?: string | null;
            cc?: string[];
            bcc?: string[];
          }
        | {
            action: "send_reply";
            body: string;
            subject?: string | null;
            rfcMessageId?: string | null;
            cc?: string[];
            bcc?: string[];
          }
        | {
            action: "apply_label";
            labelName: string;
            subject?: string | null;
            rfcMessageId?: string | null;
          }
        | {
            action: "archive_thread";
            subject?: string | null;
            rfcMessageId?: string | null;
          };
    }
  | {
      kind: "missing_data";
      message: string;
    }
  | {
      kind: "denied";
      message: string;
    }
  | {
      kind: "respond";
      useRecentThreadContext: boolean;
    };

const THREAD_ID_PATTERN = /\b([a-f0-9]{12,})\b/i;
const SEARCH_TRIGGER_PATTERN =
  /\b(busca(?:me|r)?|buscar|inbox|correo(?:s)?|email(?:s)?|mail(?:s)?|hilo(?:s)?|thread(?:s)?|bandeja)\b/i;
const READ_TRIGGER_PATTERN =
  /\b(lee(?:r)?|abrime|abri|abre|mostra(?:me)?|muestra(?:me)?|ver)\b/i;
const RECENT_THREAD_REFERENCE_PATTERN =
  /\b(ese|este|ultimo|último|anterior)\s+(?:hilo|thread|mail|email|correo)\b/i;
const INBOX_ONLY_PATTERN =
  /\b(ultimos|recientes|nuevos|nuevas)\b/i;
const SEARCH_STOPWORDS = new Set([
  "busca",
  "buscar",
  "buscame",
  "gmail",
  "correo",
  "correos",
  "email",
  "emails",
  "mail",
  "mails",
  "hilo",
  "hilos",
  "thread",
  "threads",
  "inbox",
  "bandeja",
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "por",
  "favor",
  "en",
  "mi",
  "mis",
  "que",
  "qué",
  "me",
  "mostra",
  "mostrame",
  "muestra",
  "leer",
  "lee",
  "abre",
  "abrime",
  "abri",
  "ver",
]);
const DRAFT_TRIGGER_PATTERN =
  /\b(borrador|draft)\b/i;
const REPLY_TRIGGER_PATTERN =
  /\b(responde(?:r|le)?|contest(?:a|ar|ale|arle)|reply)\b/i;
const SEND_TRIGGER_PATTERN =
  /\b(envi(?:a|ar|ale|arle)|manda(?:r|le)?|send)\b/i;
const ARCHIVE_TRIGGER_PATTERN =
  /\b(archiva(?:r|lo)?|saca(?:lo)?\s+de\s+inbox|quitar?\s+de\s+bandeja)\b/i;
const LABEL_TRIGGER_PATTERN =
  /\b(etiqueta(?:r|le)?|label|marca(?:lo)?\s+con)\b/i;

const DENYLIST_PATTERNS = [
  { pattern: /\b(adjunt(?:o|a|ar|os|as)|attach(?:ment)?|archivo\s+adjunt)\b/i, message: "Adjuntos no estan soportados todavia. Podes crear un borrador con texto plano y agregar adjuntos manualmente desde Gmail." },
  { pattern: /\b(html|formato|rich\s+text|negrita|cursiva|bold|italic)\b/i, message: "Solo soporto texto plano por ahora. El formato se puede ajustar manualmente en Gmail despues de crear el borrador." },
  { pattern: /\b(reenviar?|forward|fwd)\b/i, message: "Reenvio de emails no esta soportado todavia. Podes crear un email nuevo con el contenido que necesites." },
  { pattern: /\b(alias|desde\s+otra\s+cuenta|from\s+custom|send\s+as)\b/i, message: "Envio desde alias o cuentas alternativas no esta soportado. El email se envia desde la cuenta conectada." },
  { pattern: /\b(programar?|schedule|enviar?\s+(?:a\s+las|manana|mañana|despues))\b/i, message: "Envio programado no esta soportado todavia. El email se envia inmediatamente tras la aprobacion." },
  { pattern: /\b(masivo|bulk|campana|campaign|newsletter)\b/i, message: "Envio masivo o campanas no estan soportados. Este agente opera email a email con aprobacion individual." },
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN);
  if (!matches) {
    return [];
  }
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

function extractThreadId(text: string): string | null {
  const match = text.match(THREAD_ID_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractQuotedText(text: string): string | null {
  const quoted = text.match(/["""']([^"""']{2,8000})["""']/);
  return quoted?.[1]?.trim() ?? null;
}

function parseRecentThreadContext(recentToolContext?: string): GmailRecentThreadContext {
  if (!recentToolContext) {
    return {
      threadId: null,
      messageId: null,
      rfcMessageId: null,
      subject: null,
    };
  }

  const lines = recentToolContext.split("\n");
  const findValue = (prefix: string) =>
    lines.find((entry) => entry.toLowerCase().startsWith(prefix))?.slice(prefix.length).trim() ??
    null;

  return {
    threadId: findValue("thread_id="),
    messageId: findValue("message_id="),
    rfcMessageId: findValue("rfc_message_id="),
    subject: findValue("subject="),
  };
}

function buildSearchQuery(latestUserMessage: string): string | null {
  const quotedQuery = extractQuotedText(latestUserMessage);
  if (quotedQuery) {
    return quotedQuery.slice(0, 120);
  }

  const normalized = latestUserMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (INBOX_ONLY_PATTERN.test(normalized)) {
    return null;
  }

  const tokens = normalized
    .split(/[^a-z0-9@._-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !SEARCH_STOPWORDS.has(token));

  if (tokens.length === 0) {
    return null;
  }

  return tokens.join(" ").slice(0, 120);
}

function shouldReadThread(latestUserMessage: string): boolean {
  return READ_TRIGGER_PATTERN.test(latestUserMessage);
}

function shouldSearchThreads(
  latestUserMessage: string,
  recentMessages: ChatMessage[]
): boolean {
  if (SEARCH_TRIGGER_PATTERN.test(latestUserMessage)) {
    return true;
  }

  const lastAssistantMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "assistant");

  return Boolean(
    lastAssistantMessage &&
      /gmail|correo|email|mail|hilo|thread/i.test(lastAssistantMessage.content) &&
      /\b(busca|buscar|mostra|muestra|ultimos|últimos|recientes)\b/i.test(
        latestUserMessage
      )
  );
}

function extractLabelName(text: string): string | null {
  const quoted = extractQuotedText(text);
  if (quoted) {
    return quoted.slice(0, 225);
  }

  const match = text.match(
    /\b(?:label|etiqueta)\s+(?:de\s+gmail\s+)?(?::|llamada\s+)?([a-z0-9 _./-]{2,225})$/i
  );
  return match?.[1]?.trim() ?? null;
}

function extractDraftBody(text: string): string | null {
  const quoted = extractQuotedText(text);
  if (quoted) {
    return quoted;
  }

  const match = text.match(/\b(?:que\s+diga|diciendo|con\s+este\s+texto)\s*[:：]?\s*(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function extractSubjectFromText(text: string): string | null {
  const match = text.match(/\b(?:asunto|subject)\s*[:：]\s*[""]?([^"""\n]{1,160})[""]?/i);
  return match?.[1]?.trim() ?? null;
}

function buildThreadReference(
  latestUserMessage: string,
  recentToolContext?: string
): {
  threadId: string | null;
  messageId: string | null;
  rfcMessageId: string | null;
  subject: string | null;
} {
  const explicitThreadId = extractThreadId(latestUserMessage);
  const recent = parseRecentThreadContext(recentToolContext);

  return {
    threadId: explicitThreadId ?? recent.threadId,
    messageId: recent.messageId,
    rfcMessageId: recent.rfcMessageId,
    subject: recent.subject,
  };
}

function checkDenylist(text: string): { denied: true; message: string } | null {
  for (const entry of DENYLIST_PATTERNS) {
    if (entry.pattern.test(text)) {
      return { denied: true, message: entry.message };
    }
  }
  return null;
}

function hasReplyContext(
  latestUserMessage: string,
  recentToolContext?: string
): boolean {
  if (REPLY_TRIGGER_PATTERN.test(latestUserMessage)) {
    return true;
  }
  if (RECENT_THREAD_REFERENCE_PATTERN.test(latestUserMessage)) {
    return true;
  }
  const recent = parseRecentThreadContext(recentToolContext);
  if (recent.threadId && !extractEmails(latestUserMessage).length) {
    return true;
  }
  return false;
}

export async function planGoogleGmailToolAction(input: {
  config: GmailAgentToolConfig;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
  recentToolContext?: string;
}): Promise<PlanGoogleGmailToolActionResult> {
  const recent = parseRecentThreadContext(input.recentToolContext);
  const explicitThreadId = extractThreadId(input.latestUserMessage);

  if (explicitThreadId) {
    return {
      kind: "read",
      input: {
        action: "read_thread",
        threadId: explicitThreadId,
      },
    };
  }

  // --- Denylist check ---
  const denied = checkDenylist(input.latestUserMessage);
  if (denied) {
    return { kind: "denied", message: denied.message };
  }

  const threadReference = buildThreadReference(
    input.latestUserMessage,
    input.recentToolContext
  );

  const regexLabel = LABEL_TRIGGER_PATTERN.test(input.latestUserMessage);
  const regexArchive = ARCHIVE_TRIGGER_PATTERN.test(input.latestUserMessage);
  const regexDraft = DRAFT_TRIGGER_PATTERN.test(input.latestUserMessage);
  const regexReply = REPLY_TRIGGER_PATTERN.test(input.latestUserMessage);
  const regexSend = SEND_TRIGGER_PATTERN.test(input.latestUserMessage);
  const regexRead = shouldReadThread(input.latestUserMessage);
  const regexSearch = shouldSearchThreads(input.latestUserMessage, input.recentMessages);

  const needsLlmFallback = !regexLabel && !regexArchive && !regexDraft && !regexReply && !regexSend && !regexRead && !regexSearch;
  const intent = needsLlmFallback
    ? await extractGmailIntent(input.latestUserMessage)
    : { action: "none" as const };

  // --- Apply label ---
  const wantsApplyLabel =
    intent.action === "apply_label" || regexLabel;

  if (wantsApplyLabel) {
    if (!threadReference.threadId) {
      return {
        kind: "missing_data",
        message:
          "Primero necesito leer el hilo real de Gmail para tener `thread_id` y `message_id` estables antes de aplicar un label.",
      };
    }

    const labelName = extractLabelName(input.latestUserMessage);
    if (!labelName) {
      return {
        kind: "missing_data",
        message:
          'Decime que label de Gmail quieres aplicar, por ejemplo: `aplica el label "Pagado"`.',
      };
    }

    if (!threadReference.messageId) {
      return {
        kind: "resolve_thread_for_write",
        readInput: {
          action: "read_thread",
          threadId: threadReference.threadId,
        },
        writeAction: {
          action: "apply_label",
          labelName,
          ...(threadReference.rfcMessageId
            ? { rfcMessageId: threadReference.rfcMessageId }
            : {}),
          ...(threadReference.subject ? { subject: threadReference.subject } : {}),
        },
      };
    }

    return {
      kind: "write",
      requiresConfirmation: true,
      input: {
        action: "apply_label",
        threadId: threadReference.threadId,
        messageId: threadReference.messageId,
        ...(threadReference.rfcMessageId
          ? { rfcMessageId: threadReference.rfcMessageId }
          : {}),
        ...(threadReference.subject ? { subject: threadReference.subject } : {}),
        labelName,
      },
    };
  }

  // --- Archive ---
  const wantsArchive =
    intent.action === "archive_thread" || regexArchive;

  if (wantsArchive) {
    if (!threadReference.threadId) {
      return {
        kind: "missing_data",
        message:
          "Primero necesito leer el hilo real de Gmail para tener `thread_id` y `message_id` estables antes de archivarlo.",
      };
    }

    if (!threadReference.messageId) {
      return {
        kind: "resolve_thread_for_write",
        readInput: {
          action: "read_thread",
          threadId: threadReference.threadId,
        },
        writeAction: {
          action: "archive_thread",
          ...(threadReference.rfcMessageId
            ? { rfcMessageId: threadReference.rfcMessageId }
            : {}),
          ...(threadReference.subject ? { subject: threadReference.subject } : {}),
        },
      };
    }

    return {
      kind: "write",
      requiresConfirmation: true,
      input: {
        action: "archive_thread",
        threadId: threadReference.threadId,
        messageId: threadReference.messageId,
        ...(threadReference.rfcMessageId
          ? { rfcMessageId: threadReference.rfcMessageId }
          : {}),
        ...(threadReference.subject ? { subject: threadReference.subject } : {}),
      },
    };
  }

  // --- Standalone email (draft or send) ---
  // Detect standalone intent: explicit emails + no reply context,
  // or LLM classified as standalone
  const extractedEmails = extractEmails(input.latestUserMessage);
  const isStandaloneIntent =
    intent.action === "create_draft_email" ||
    intent.action === "send_email" ||
    (extractedEmails.length > 0 && !hasReplyContext(input.latestUserMessage, input.recentToolContext));

  if (isStandaloneIntent) {
    if (extractedEmails.length === 0) {
      return {
        kind: "missing_data",
        message: "Necesito al menos un destinatario (email) para crear el email. Por ejemplo: `manda un email a juan@ejemplo.com que diga \"Hola\"`.",
      };
    }

    const body = extractDraftBody(input.latestUserMessage);
    if (!body) {
      return {
        kind: "missing_data",
        message: 'Decime el texto del email, por ejemplo: `enviale a juan@ejemplo.com que diga "Hola, te paso la info"`.',
      };
    }

    const subject = extractSubjectFromText(input.latestUserMessage);

    // Decide between draft and send:
    // - If user explicitly says "borrador/draft" → draft
    // - If LLM says create_draft_email → draft
    // - Otherwise → send
    const wantsDraftStandalone =
      regexDraft || intent.action === "create_draft_email";
    const standaloneAction: "create_draft_email" | "send_email" =
      wantsDraftStandalone ? "create_draft_email" : "send_email";

    if (!input.config.allowed_actions.includes(standaloneAction)) {
      const fallback = standaloneAction === "send_email" ? "create_draft_email" : "send_email";
      if (input.config.allowed_actions.includes(fallback)) {
        return {
          kind: "write_standalone",
          requiresConfirmation: true,
          input: {
            action: fallback,
            to: extractedEmails,
            ...(subject ? { subject } : {}),
            body,
          },
        };
      }
      return {
        kind: "missing_data",
        message: `La accion "${standaloneAction}" no esta habilitada para este agente. Pedi al admin que la habilite en la configuracion de Gmail.`,
      };
    }

    return {
      kind: "write_standalone",
      requiresConfirmation: true,
      input: {
        action: standaloneAction,
        to: extractedEmails,
        ...(subject ? { subject } : {}),
        body,
      },
    };
  }

  // --- Reply (draft or send) ---
  const wantsReplyDraft =
    intent.action === "create_draft_reply" || (regexDraft && !isStandaloneIntent);
  const wantsSendReply =
    intent.action === "send_reply" || (regexSend && regexReply);
  const wantsReply = wantsReplyDraft || wantsSendReply || regexReply;

  if (wantsReply) {
    if (!threadReference.threadId) {
      return {
        kind: "missing_data",
        message:
          "Primero necesito leer el hilo real de Gmail para tener `thread_id` y `message_id` estables antes de crear la respuesta.",
      };
    }

    const body = extractDraftBody(input.latestUserMessage);
    if (!body) {
      return {
        kind: "missing_data",
        message:
          'Decime el texto de la respuesta, por ejemplo: `responde este mail que diga "Gracias, lo reviso hoy"`.',
      };
    }

    // Decide action: send_reply or create_draft_reply
    const replyAction: "create_draft_reply" | "send_reply" =
      wantsSendReply ? "send_reply" : "create_draft_reply";

    if (!threadReference.messageId) {
      return {
        kind: "resolve_thread_for_write",
        readInput: {
          action: "read_thread",
          threadId: threadReference.threadId,
        },
        writeAction: {
          action: replyAction,
          body,
          ...(threadReference.rfcMessageId
            ? { rfcMessageId: threadReference.rfcMessageId }
            : {}),
          ...(threadReference.subject ? { subject: threadReference.subject } : {}),
        },
      };
    }

    return {
      kind: "write",
      requiresConfirmation: true,
      input: {
        action: replyAction,
        threadId: threadReference.threadId,
        messageId: threadReference.messageId,
        ...(threadReference.rfcMessageId
          ? { rfcMessageId: threadReference.rfcMessageId }
          : {}),
        ...(threadReference.subject ? { subject: threadReference.subject } : {}),
        body,
      },
    };
  }

  // --- Send without explicit reply context (standalone via regex) ---
  if (regexSend && !regexReply) {
    const body = extractDraftBody(input.latestUserMessage);
    if (extractedEmails.length === 0) {
      return {
        kind: "missing_data",
        message: "Necesito al menos un destinatario (email) para enviar el email. Por ejemplo: `enviale a juan@ejemplo.com que diga \"Hola\"`.",
      };
    }
    if (!body) {
      return {
        kind: "missing_data",
        message: 'Decime el texto del email, por ejemplo: `enviale a juan@ejemplo.com que diga "Hola, te paso la info"`.',
      };
    }

    const subject = extractSubjectFromText(input.latestUserMessage);
    return {
      kind: "write_standalone",
      requiresConfirmation: true,
      input: {
        action: "send_email",
        to: extractedEmails,
        ...(subject ? { subject } : {}),
        body,
      },
    };
  }

  // --- Read ---
  const wantsReadThread =
    intent.action === "read_thread" || regexRead;

  if (wantsReadThread && recent.threadId) {
    return {
      kind: "read",
      input: {
        action: "read_thread",
        threadId: recent.threadId,
      },
    };
  }

  // --- Search ---
  const wantsSearchThreads =
    intent.action === "search_threads" || regexSearch;

  if (wantsSearchThreads) {
    return {
      kind: "search",
      input: {
        action: "search_threads",
        query: buildSearchQuery(input.latestUserMessage),
        maxResults: 5,
      },
    };
  }

  return {
    kind: "respond",
    useRecentThreadContext:
      Boolean(recent.threadId) &&
      RECENT_THREAD_REFERENCE_PATTERN.test(input.latestUserMessage),
  };
}
