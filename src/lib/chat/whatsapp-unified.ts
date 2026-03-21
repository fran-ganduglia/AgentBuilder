import {
  buildOutOfScopeResponse,
  type AgentScope,
} from "@/lib/agents/agent-scope";
import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { getAgentTemplateById } from "@/lib/agents/agent-templates";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import type { ConversationMetadata } from "@/lib/chat/conversation-metadata";
import {
  classifyWhatsAppIntentHeuristically,
  normalizeWhatsAppIntentClassification,
  resolveWhatsAppIntentRoute,
} from "@/lib/chat/whatsapp-intent-router";
import {
  WHATSAPP_INTENT_LABELS,
  type WhatsAppKnownIntent,
} from "@/lib/chat/whatsapp-intents";
import { LiteLLMError } from "@/lib/llm/litellm";
import {
  resolveRuntimeModelRoutePolicy,
  sendRoutedChatCompletion,
} from "@/lib/llm/model-routing";
import type { Agent, Conversation } from "@/types/app";

const ROUTING_OBSERVABILITY_WINDOW = 50;
const ROUTING_FALLBACK_ALERT_THRESHOLD = 0.3;
const CLASSIFIER_MAX_TOKENS = 120;

const routingFallbackWindow: boolean[] = [];

const WHATSAPP_INTENT_SCOPE_MAP: Record<WhatsAppKnownIntent, AgentScope> = {
  support: "support",
  sales: "sales",
  appointment_booking: "operations",
  reminder_follow_up: "operations",
};

export type PreparedWhatsAppUnifiedTurn =
  | {
      kind: "respond_now";
      content: string;
      conversationMetadataPatch: ConversationMetadata;
    }
  | {
      kind: "prompt_ready";
      systemPrompt: string;
      conversationMetadataPatch: ConversationMetadata;
    };

function buildClarificationMenu(): string {
  return [
    "Te ayudo por este WhatsApp. Decime que necesitas:",
    "1. Soporte",
    "2. Ventas",
    "3. Reservar o reprogramar un turno",
    "4. Recordatorio o seguimiento",
    "Puedes responder con el numero o con una frase corta.",
  ].join("\n");
}

export function buildWhatsAppActivePlaybook(intent: WhatsAppKnownIntent): string {
  const templateIdByIntent: Record<WhatsAppKnownIntent, "whatsapp_support" | "whatsapp_sales" | "whatsapp_appointment_booking" | "whatsapp_reminder_follow_up"> = {
    support: "whatsapp_support",
    sales: "whatsapp_sales",
    appointment_booking: "whatsapp_appointment_booking",
    reminder_follow_up: "whatsapp_reminder_follow_up",
  };
  const template = getAgentTemplateById(templateIdByIntent[intent]);
  const draft = template.builderDefaults;

  return [
    `Intento activo: ${WHATSAPP_INTENT_LABELS[intent]}.`,
    `Objetivo operativo: ${draft.objective}`,
    `Tareas permitidas en este playbook: ${draft.allowedTasks}`,
    `Restricciones especificas: ${draft.restrictions}`,
    `Regla de handoff: ${draft.humanHandoff}`,
    "Usa solo este playbook activo para responder este turno.",
    "No mezcles instrucciones de otros playbooks ni menciones categorias internas al usuario.",
  ].join("\n");
}

export function buildWhatsAppUnifiedSystemPrompt(basePrompt: string, activeIntent: WhatsAppKnownIntent): string {
  return [
    basePrompt,
    "PLAYBOOK_ACTIVO\n<active_playbook>\n" + buildWhatsAppActivePlaybook(activeIntent) + "\n</active_playbook>",
    "AISLAMIENTO_DE_INTENCION\nCambia de playbook solo si la senal del turno actual es claramente fuerte. Si no lo es, mantente en el playbook actual o pide aclaracion con menu.",
  ].join("\n\n");
}

export function resolveScopeForWhatsAppIntent(intent: WhatsAppKnownIntent): AgentScope {
  return WHATSAPP_INTENT_SCOPE_MAP[intent];
}

function buildIntentMetadataPatch(input: {
  currentMetadata: ConversationMetadata;
  activeIntent: WhatsAppKnownIntent | null;
  confidence: number | null;
  source: "heuristic" | "llm" | "carryover";
  needsClarification: boolean;
  switchedIntent: boolean;
}): ConversationMetadata {
  const patch: ConversationMetadata = {
    needs_clarification: input.needsClarification,
  };

  if (input.activeIntent !== input.currentMetadata.active_intent) {
    patch.active_intent = input.activeIntent;
  }

  if (input.confidence !== null) {
    patch.intent_confidence = input.confidence;
  }

  if (input.source !== "carryover") {
    patch.intent_source = input.source;
  }

  if (
    input.switchedIntent ||
    input.source !== "carryover" ||
    input.currentMetadata.needs_clarification !== input.needsClarification
  ) {
    patch.intent_updated_at = new Date().toISOString();
  }

  return patch;
}

async function classifyIntentWithLlm(input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  latestUserMessage: string;
  currentActiveIntent: WhatsAppKnownIntent | null;
}): Promise<ReturnType<typeof normalizeWhatsAppIntentClassification>> {
  const routed = await sendRoutedChatCompletion({
    requestedModel: input.agent.llm_model,
    policy: resolveRuntimeModelRoutePolicy(input.agent.llm_model),
    signals: {
      hasTools: false,
      toolCount: 0,
      hasRag: false,
      ragChunkCount: 0,
      historySize: input.currentActiveIntent ? 1 : 0,
      surfaceCount: 0,
      isAmbiguous: false,
      previousFailures: 0,
      channel: "whatsapp",
      turnType: "classifier",
    },
    chatInput: {
      systemPrompt: [
        "Clasifica la intencion de un mensaje entrante de WhatsApp.",
        "Responde solo JSON valido con las claves intent y confidence.",
        "Valores permitidos para intent: support, sales, appointment_booking, reminder_follow_up, unknown.",
        "Usa unknown si la senal no es suficientemente clara.",
        input.currentActiveIntent
          ? `Intento activo actual: ${input.currentActiveIntent}.`
          : "No hay intento activo actual.",
      ].join("\n"),
      messages: [{ role: "user", content: input.latestUserMessage }],
      temperature: 0,
      maxTokens: CLASSIFIER_MAX_TOKENS,
      organizationId: input.organizationId,
      agentId: input.agent.id,
      conversationId: input.conversation.id,
    },
    evaluateStructuredOutput: (output) => {
      try {
        const parsed = JSON.parse(output.content) as { confidence?: number | null };
        return {
          parseValid: true,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        };
      } catch {
        return { parseValid: false };
      }
    },
  });
  const completion = routed.output;

  try {
    return normalizeWhatsAppIntentClassification(JSON.parse(completion.content) as {
      intent: string;
      confidence?: number | null;
      source?: string | null;
    });
  } catch {
    return null;
  }
}

function recordRoutingObservation(input: {
  organizationId: string;
  agentId: string;
  conversationId: string;
  usedLlmFallback: boolean;
  activeIntent: WhatsAppKnownIntent | null;
  source: "heuristic" | "llm" | "carryover";
  needsClarification: boolean;
  switchedIntent: boolean;
  confidence: number | null;
}): void {
  routingFallbackWindow.push(input.usedLlmFallback);
  if (routingFallbackWindow.length > ROUTING_OBSERVABILITY_WINDOW) {
    routingFallbackWindow.shift();
  }

  const fallbackRatio =
    routingFallbackWindow.filter(Boolean).length / routingFallbackWindow.length;

  console.info("whatsapp.intent_routing", {
    organizationId: input.organizationId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    activeIntent: input.activeIntent,
    source: input.source,
    confidence: input.confidence,
    usedLlmFallback: input.usedLlmFallback,
    needsClarification: input.needsClarification,
    switchedIntent: input.switchedIntent,
    fallbackRatio,
    sampleSize: routingFallbackWindow.length,
  });

  if (routingFallbackWindow.length >= 10 && fallbackRatio > ROUTING_FALLBACK_ALERT_THRESHOLD) {
    console.warn("whatsapp.intent_routing_fallback_ratio_high", {
      organizationId: input.organizationId,
      agentId: input.agentId,
      fallbackRatio,
      threshold: ROUTING_FALLBACK_ALERT_THRESHOLD,
      sampleSize: routingFallbackWindow.length,
    });
  }
}

export async function prepareWhatsAppUnifiedTurn(input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  latestUserMessage: string;
  currentMetadata: ConversationMetadata;
}): Promise<PreparedWhatsAppUnifiedTurn> {
  const setupState = readAgentSetupState(input.agent);
  if (!setupState || setupState.template_id !== "whatsapp_unified") {
    throw new Error("whatsapp_unified_setup_state_missing");
  }

  const heuristic = classifyWhatsAppIntentHeuristically(input.latestUserMessage);
  let llmFallback = null;

  if (!heuristic) {
    try {
      llmFallback = await classifyIntentWithLlm({
        agent: input.agent,
        conversation: input.conversation,
        organizationId: input.organizationId,
        latestUserMessage: input.latestUserMessage,
        currentActiveIntent: input.currentMetadata.active_intent ?? null,
      });
    } catch (error) {
      if (!(error instanceof LiteLLMError)) {
        throw error;
      }
    }
  }

  const decision = resolveWhatsAppIntentRoute({
    currentActiveIntent: input.currentMetadata.active_intent ?? null,
    heuristic,
    llmFallback,
  });

  recordRoutingObservation({
    organizationId: input.organizationId,
    agentId: input.agent.id,
    conversationId: input.conversation.id,
    usedLlmFallback: !heuristic,
    activeIntent: decision.activeIntent,
    source: decision.source,
    confidence: decision.confidence,
    needsClarification: decision.needsClarification,
    switchedIntent: decision.switchedIntent,
  });

  const conversationMetadataPatch = buildIntentMetadataPatch({
    currentMetadata: input.currentMetadata,
    activeIntent: decision.activeIntent,
    confidence: decision.confidence,
    source: decision.source,
    needsClarification: decision.needsClarification,
    switchedIntent: decision.switchedIntent,
  });

  if (decision.shouldReplyWithMenu || !decision.activeIntent) {
    return {
      kind: "respond_now",
      content: buildClarificationMenu(),
      conversationMetadataPatch,
    };
  }

  const targetScope = resolveScopeForWhatsAppIntent(decision.activeIntent);
  if (targetScope !== setupState.agentScope) {
    return {
      kind: "respond_now",
      content: buildOutOfScopeResponse({
        agentScope: setupState.agentScope,
        targetScope,
      }),
      conversationMetadataPatch,
    };
  }

  const promptResolution = resolveEffectiveAgentPrompt({
    savedPrompt: input.agent.system_prompt,
    setupState,
  });

  return {
    kind: "prompt_ready",
    systemPrompt: buildWhatsAppUnifiedSystemPrompt(
      promptResolution.effectivePrompt,
      decision.activeIntent
    ),
    conversationMetadataPatch,
  };
}
