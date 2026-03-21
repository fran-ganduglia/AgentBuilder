import "server-only";

import type { ModelRoutePolicy, ModelTier } from "@/lib/agents/agent-config";
import { sendChatCompletion } from "@/lib/llm/litellm";
import type { ChatCompletionInput, ChatCompletionOutput } from "@/lib/llm/litellm-types";
import { env } from "@/lib/utils/env";

export type RoutingReasonCode =
  | "feature_flag_disabled"
  | "cheap_default"
  | "classifier_default"
  | "direct_strong_analysis"
  | "direct_strong_high_quality_synthesis"
  | "direct_strong_multi_surface"
  | "direct_strong_rag_plus_tools"
  | "direct_strong_tool_heavy"
  | "direct_strong_ambiguous"
  | "direct_strong_high_history"
  | "escalate_empty_output"
  | "escalate_parse_invalid"
  | "escalate_expected_tool_missing"
  | "escalate_generic_clarification"
  | "escalate_low_confidence";

export type RoutingSignals = {
  hasTools: boolean;
  toolCount: number;
  readOnlyTools?: boolean;
  hasSensitiveWrites?: boolean;
  toolComplexity?: "low" | "medium" | "high";
  hasRag: boolean;
  ragChunkCount: number;
  historySize: number;
  surfaceCount: number;
  isAmbiguous: boolean;
  needsHighQualitySynthesis?: boolean;
  previousFailures: number;
  channel: "web" | "whatsapp" | "api" | "worker";
  turnType:
    | "classifier"
    | "simple_chat"
    | "tool_chat"
    | "tool_loop"
    | "analysis"
    | "structured_output"
    | "high_quality_synthesis";
};

export type RoutingDecision = {
  selectedModel: string;
  tier: ModelTier;
  reasonCodes: RoutingReasonCode[];
  allowEscalation: boolean;
};

export type RoutingAttempt = {
  model: string;
  provider: string;
  tier: ModelTier;
  tokensInput: number;
  tokensOutput: number;
  responseTimeMs: number;
  finishReason: ChatCompletionOutput["finishReason"] | null;
};

export type RoutedCompletionMetadata = {
  requestedModel: string;
  resolvedModel: string;
  modelTier: ModelTier;
  escalated: boolean;
  reasonCodes: RoutingReasonCode[];
  escalationReasonCodes: RoutingReasonCode[];
  attempts: RoutingAttempt[];
};

type StructuredOutputEvaluation = {
  parseValid?: boolean;
  confidence?: number | null;
};

type RoutedCompletionInput = {
  requestedModel: string;
  policy: ModelRoutePolicy;
  signals: RoutingSignals;
  chatInput: Omit<ChatCompletionInput, "model">;
  expectToolCall?: boolean;
  evaluateStructuredOutput?: (output: ChatCompletionOutput) => StructuredOutputEvaluation;
  suppressEscalationReasonCodes?: RoutingReasonCode[];
  sender?: (input: ChatCompletionInput) => Promise<ChatCompletionOutput>;
};

const DEFAULT_CHEAP_MODEL = "gpt-4o-mini";
const DEFAULT_STRONG_MODEL = "gpt-4o";
const DEFAULT_ROUTING_PERCENTAGE = 100;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

function isLowComplexityReadTurn(signals: RoutingSignals): boolean {
  return (
    signals.hasTools &&
    signals.readOnlyTools === true &&
    signals.surfaceCount === 1 &&
    !signals.hasRag &&
    !signals.isAmbiguous &&
    (signals.turnType === "tool_chat" || signals.turnType === "simple_chat")
  );
}

function hashToPercentage(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 10_000;
  }
  return hash % 100;
}

function getOptionalEnvNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isCheapTaggedModel(model: string): boolean {
  return model.endsWith("-mini") || model.includes("haiku");
}

function isStrongTaggedModel(model: string): boolean {
  return model.includes("sonnet") || model.includes("opus") || model === "gpt-4o";
}

function isRoutingExplicitlyEnabled(): boolean {
  const value = String(env.LLM_ROUTER_ENABLED).toLowerCase();
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}

function getRouterAllowlist(): Set<string> {
  const raw = env.LLM_ROUTER_ORG_IDS;
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

export function resolveProviderFromModel(model: string | null): string {
  if (!model) {
    return "unknown";
  }

  if (model.startsWith("gpt-")) {
    return "openai";
  }

  if (model.startsWith("claude-")) {
    return "anthropic";
  }

  if (model.startsWith("gemini-") || model === "gemini-pro") {
    return "gemini";
  }

  return "custom";
}

export function isModelRoutingEnabledForOrganization(organizationId: string): boolean {
  if (!isRoutingExplicitlyEnabled()) {
    return false;
  }

  const allowlist = getRouterAllowlist();
  if (allowlist.has(organizationId)) {
    return true;
  }

  const percentage = Math.max(
    0,
    Math.min(100, getOptionalEnvNumber(env.LLM_ROUTER_ROLLOUT_PERCENT, DEFAULT_ROUTING_PERCENTAGE))
  );

  if (percentage >= 100) {
    return true;
  }

  if (percentage <= 0) {
    return false;
  }

  return hashToPercentage(organizationId) < percentage;
}

export function resolveRuntimeModelRoutePolicy(baseModel: string): ModelRoutePolicy {
  const configuredCheapModel = env.LITELLM_ROUTER_CHEAP_MODEL || DEFAULT_CHEAP_MODEL;
  const configuredStrongModel = env.LITELLM_ROUTER_STRONG_MODEL || DEFAULT_STRONG_MODEL;

  if (isCheapTaggedModel(baseModel)) {
    return {
      primaryModel: baseModel,
      escalationModel: configuredStrongModel,
      maxEscalationsPerTurn: 1,
    };
  }

  if (isStrongTaggedModel(baseModel)) {
    return {
      primaryModel: configuredCheapModel,
      escalationModel: baseModel,
      maxEscalationsPerTurn: 1,
    };
  }

  return {
    primaryModel: configuredCheapModel,
    escalationModel: baseModel || configuredStrongModel,
    maxEscalationsPerTurn: 1,
  };
}

export function resolveModelRoute(input: {
  organizationId: string;
  requestedModel: string;
  policy: ModelRoutePolicy;
  signals: RoutingSignals;
}): RoutingDecision {
  if (!isModelRoutingEnabledForOrganization(input.organizationId)) {
    const tier: ModelTier =
      input.requestedModel === input.policy.primaryModel && input.requestedModel !== input.policy.escalationModel
        ? "cheap"
        : "strong";

    return {
      selectedModel: input.requestedModel,
      tier,
      reasonCodes: ["feature_flag_disabled"],
      allowEscalation: false,
    };
  }

  const strongReasons: RoutingReasonCode[] = [];
  const toolComplexity = input.signals.toolComplexity ?? "medium";
  const hasSensitiveWrites = input.signals.hasSensitiveWrites === true;
  const lowComplexityReadTurn = isLowComplexityReadTurn(input.signals);

  if (input.signals.turnType === "analysis") {
    strongReasons.push("direct_strong_analysis");
  }

  if (input.signals.turnType === "high_quality_synthesis" || input.signals.needsHighQualitySynthesis) {
    strongReasons.push("direct_strong_high_quality_synthesis");
  }

  if (input.signals.hasTools && input.signals.surfaceCount >= 2) {
    strongReasons.push("direct_strong_multi_surface");
  }

  if (input.signals.hasTools && input.signals.hasRag && input.signals.ragChunkCount > 0) {
    strongReasons.push("direct_strong_rag_plus_tools");
  }

  if (
    input.signals.hasTools &&
    input.signals.toolCount >= 8 &&
    !lowComplexityReadTurn &&
    (
      hasSensitiveWrites ||
      toolComplexity === "high" ||
      input.signals.surfaceCount >= 2 ||
      input.signals.isAmbiguous ||
      input.signals.historySize >= 10
    )
  ) {
    strongReasons.push("direct_strong_tool_heavy");
  }

  if (
    input.signals.isAmbiguous &&
    (input.signals.hasTools || input.signals.turnType === "analysis" || input.signals.turnType === "tool_chat")
  ) {
    strongReasons.push("direct_strong_ambiguous");
  }

  if (
    input.signals.historySize >= 14 &&
    (input.signals.hasTools || input.signals.hasRag) &&
    !lowComplexityReadTurn
  ) {
    strongReasons.push("direct_strong_high_history");
  }

  if (strongReasons.length > 0) {
    return {
      selectedModel: input.policy.escalationModel,
      tier: "strong",
      reasonCodes: strongReasons,
      allowEscalation: false,
    };
  }

  const cheapReason: RoutingReasonCode =
    input.signals.turnType === "classifier" ? "classifier_default" : "cheap_default";

  return {
    selectedModel: input.policy.primaryModel,
    tier: "cheap",
    reasonCodes: [cheapReason],
    allowEscalation:
      input.policy.maxEscalationsPerTurn > input.signals.previousFailures &&
      input.policy.primaryModel !== input.policy.escalationModel,
  };
}

function looksLikeGenericClarification(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 220) {
    return false;
  }

  return [
    "puedes aclarar",
    "podrias aclarar",
    "podrias darme",
    "necesito mas contexto",
    "necesito mas detalles",
    "faltan datos",
    "puedes compartir mas",
  ].some((fragment) => normalized.includes(fragment));
}

function getEscalationReasonCodes(input: {
  output: ChatCompletionOutput;
  expectToolCall: boolean;
  evaluateStructuredOutput?: (output: ChatCompletionOutput) => StructuredOutputEvaluation;
}): RoutingReasonCode[] {
  const reasonCodes: RoutingReasonCode[] = [];
  const trimmedContent = input.output.content.trim();

  if (trimmedContent.length === 0) {
    reasonCodes.push("escalate_empty_output");
  }

  const structuredEvaluation = input.evaluateStructuredOutput?.(input.output);
  if (structuredEvaluation?.parseValid === false) {
    reasonCodes.push("escalate_parse_invalid");
  }

  if (
    typeof structuredEvaluation?.confidence === "number" &&
    structuredEvaluation.confidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    reasonCodes.push("escalate_low_confidence");
  }

  if (input.expectToolCall && (!input.output.toolCalls || input.output.toolCalls.length === 0)) {
    reasonCodes.push("escalate_expected_tool_missing");
  }

  if (looksLikeGenericClarification(trimmedContent)) {
    reasonCodes.push("escalate_generic_clarification");
  }

  return Array.from(new Set(reasonCodes));
}

export async function sendRoutedChatCompletion(
  input: RoutedCompletionInput
): Promise<{ output: ChatCompletionOutput; routing: RoutedCompletionMetadata }> {
  const sender = input.sender ?? sendChatCompletion;
  const decision = resolveModelRoute({
    organizationId: input.chatInput.organizationId,
    requestedModel: input.requestedModel,
    policy: input.policy,
    signals: input.signals,
  });

  const firstOutput = await sender({
    ...input.chatInput,
    model: decision.selectedModel,
  });

  const attempts: RoutingAttempt[] = [
    {
      model: firstOutput.model,
      provider: resolveProviderFromModel(firstOutput.model),
      tier: decision.tier,
      tokensInput: firstOutput.tokensInput,
      tokensOutput: firstOutput.tokensOutput,
      responseTimeMs: firstOutput.responseTimeMs,
      finishReason: firstOutput.finishReason ?? null,
    },
  ];

  const escalationReasonCodes =
    decision.tier === "cheap" && decision.allowEscalation
      ? getEscalationReasonCodes({
          output: firstOutput,
          expectToolCall: input.expectToolCall ?? false,
          evaluateStructuredOutput: input.evaluateStructuredOutput,
        }).filter(
          (reasonCode) =>
            !(input.suppressEscalationReasonCodes ?? []).includes(reasonCode)
        )
      : [];

  if (escalationReasonCodes.length === 0) {
    return {
      output: firstOutput,
      routing: {
        requestedModel: input.requestedModel,
        resolvedModel: firstOutput.model,
        modelTier: decision.tier,
        escalated: false,
        reasonCodes: decision.reasonCodes,
        escalationReasonCodes: [],
        attempts,
      },
    };
  }

  const secondOutput = await sender({
    ...input.chatInput,
    model: input.policy.escalationModel,
  });

  attempts.push({
    model: secondOutput.model,
    provider: resolveProviderFromModel(secondOutput.model),
    tier: "strong",
    tokensInput: secondOutput.tokensInput,
    tokensOutput: secondOutput.tokensOutput,
    responseTimeMs: secondOutput.responseTimeMs,
    finishReason: secondOutput.finishReason ?? null,
  });

  return {
    output: secondOutput,
    routing: {
      requestedModel: input.requestedModel,
      resolvedModel: secondOutput.model,
      modelTier: "strong",
      escalated: true,
      reasonCodes: decision.reasonCodes,
      escalationReasonCodes,
      attempts,
    },
  };
}
