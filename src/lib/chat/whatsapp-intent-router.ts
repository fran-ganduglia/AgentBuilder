import {
  WHATSAPP_KNOWN_INTENTS,
  type WhatsAppIntent,
  type WhatsAppIntentSource,
  type WhatsAppKnownIntent,
} from "@/lib/chat/whatsapp-intents";

export type WhatsAppIntentClassification = {
  intent: WhatsAppIntent;
  confidence: number;
  source: Exclude<WhatsAppIntentSource, "carryover">;
  strongSignal: boolean;
  matchedSignals: string[];
};

export type WhatsAppIntentRouteDecision = {
  activeIntent: WhatsAppKnownIntent | null;
  confidence: number | null;
  source: WhatsAppIntentSource;
  needsClarification: boolean;
  shouldReplyWithMenu: boolean;
  switchedIntent: boolean;
};

type ScoredIntent = {
  intent: WhatsAppKnownIntent;
  score: number;
  matchedSignals: string[];
};

const SIGNALS: Record<WhatsAppKnownIntent, RegExp[]> = {
  support: [
    /ayuda/i,
    /soporte/i,
    /problema/i,
    /error/i,
    /no funciona/i,
    /reclamo/i,
    /estado del pedido/i,
    /devolucion/i,
  ],
  sales: [
    /precio/i,
    /plan(es)?/i,
    /presupuesto/i,
    /cotizacion/i,
    /demo/i,
    /comprar/i,
    /contratar/i,
    /informacion comercial/i,
  ],
  appointment_booking: [
    /turno/i,
    /reserva/i,
    /agendar/i,
    /agenda/i,
    /reprogram/i,
    /disponibilidad/i,
    /horario/i,
    /cita/i,
  ],
  reminder_follow_up: [
    /recordatorio/i,
    /seguimiento/i,
    /seguimos/i,
    /retomar/i,
    /volv(er|emos)/i,
    /pendiente/i,
    /confirm(ar|acion)/i,
    /avisame/i,
  ],
};

const STRONG_THRESHOLD = 2;
const MEDIUM_THRESHOLD = 1;
const HIGH_CONFIDENCE = 0.92;
const MEDIUM_CONFIDENCE = 0.68;

function scoreIntent(message: string, intent: WhatsAppKnownIntent): ScoredIntent {
  const matchedSignals = SIGNALS[intent]
    .filter((pattern) => pattern.test(message))
    .map((pattern) => pattern.source);

  return {
    intent,
    score: matchedSignals.length,
    matchedSignals,
  };
}

function pickBestScore(scores: ScoredIntent[]): ScoredIntent | null {
  const ordered = [...scores].sort((left, right) => right.score - left.score);
  return ordered[0] ?? null;
}

function isAmbiguous(best: ScoredIntent, scores: ScoredIntent[]): boolean {
  const contenders = scores.filter((score) => score.score === best.score && score.score > 0);
  return contenders.length > 1;
}

export function classifyWhatsAppIntentHeuristically(
  message: string
): WhatsAppIntentClassification | null {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return null;
  }

  const scores = WHATSAPP_KNOWN_INTENTS.map((intent) => scoreIntent(trimmedMessage, intent));
  const best = pickBestScore(scores);

  if (!best || best.score < MEDIUM_THRESHOLD || isAmbiguous(best, scores)) {
    return null;
  }

  return {
    intent: best.intent,
    confidence: best.score >= STRONG_THRESHOLD ? HIGH_CONFIDENCE : MEDIUM_CONFIDENCE,
    source: "heuristic",
    strongSignal: best.score >= STRONG_THRESHOLD,
    matchedSignals: best.matchedSignals,
  };
}

export function normalizeWhatsAppIntentClassification(
  value: {
    intent: string;
    confidence?: number | null;
    source?: string | null;
  } | null | undefined
): WhatsAppIntentClassification | null {
  if (!value) {
    return null;
  }

  const intent = WHATSAPP_KNOWN_INTENTS.find((item) => item === value.intent);
  if (!intent) {
    return null;
  }

  const confidence = Number(value.confidence ?? 0);
  const safeConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : MEDIUM_CONFIDENCE;
  const source = value.source === "llm" ? "llm" : "heuristic";

  return {
    intent,
    confidence: safeConfidence,
    source,
    strongSignal: safeConfidence >= 0.8,
    matchedSignals: [],
  };
}

export function resolveWhatsAppIntentRoute(input: {
  currentActiveIntent: WhatsAppKnownIntent | null;
  heuristic: WhatsAppIntentClassification | null;
  llmFallback?: WhatsAppIntentClassification | null;
}): WhatsAppIntentRouteDecision {
  const candidate = input.heuristic ?? input.llmFallback ?? null;

  if (!candidate) {
    return {
      activeIntent: input.currentActiveIntent,
      confidence: null,
      source: input.currentActiveIntent ? "carryover" : "heuristic",
      needsClarification: !input.currentActiveIntent,
      shouldReplyWithMenu: !input.currentActiveIntent,
      switchedIntent: false,
    };
  }

  if (candidate.intent === "unknown") {
    return {
      activeIntent: input.currentActiveIntent,
      confidence: candidate.confidence,
      source: candidate.source,
      needsClarification: true,
      shouldReplyWithMenu: true,
      switchedIntent: false,
    };
  }

  if (!input.currentActiveIntent) {
    return {
      activeIntent: candidate.intent,
      confidence: candidate.confidence,
      source: candidate.source,
      needsClarification: !candidate.strongSignal,
      shouldReplyWithMenu: !candidate.strongSignal,
      switchedIntent: false,
    };
  }

  if (candidate.intent === input.currentActiveIntent) {
    return {
      activeIntent: input.currentActiveIntent,
      confidence: candidate.confidence,
      source: candidate.source,
      needsClarification: false,
      shouldReplyWithMenu: false,
      switchedIntent: false,
    };
  }

  if (candidate.strongSignal) {
    return {
      activeIntent: candidate.intent,
      confidence: candidate.confidence,
      source: candidate.source,
      needsClarification: false,
      shouldReplyWithMenu: false,
      switchedIntent: true,
    };
  }

  return {
    activeIntent: input.currentActiveIntent,
    confidence: candidate.confidence,
    source: candidate.source,
    needsClarification: true,
    shouldReplyWithMenu: true,
    switchedIntent: false,
  };
}
