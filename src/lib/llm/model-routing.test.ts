import assert from "node:assert/strict";
import {
  isModelRoutingEnabledForOrganization,
  resolveModelRoute,
  resolveRuntimeModelRoutePolicy,
  sendRoutedChatCompletion,
  type RoutingSignals,
} from "./model-routing";
import type { ChatCompletionInput, ChatCompletionOutput } from "./litellm-types";

const DEFAULT_SIGNALS: RoutingSignals = {
  hasTools: false,
  toolCount: 0,
  hasRag: false,
  ragChunkCount: 0,
  historySize: 3,
  surfaceCount: 0,
  isAmbiguous: false,
  needsHighQualitySynthesis: false,
  previousFailures: 0,
  channel: "web",
  turnType: "simple_chat",
};

function buildOutput(partial: Partial<ChatCompletionOutput> = {}): ChatCompletionOutput {
  return {
    content: "respuesta",
    tokensInput: 12,
    tokensOutput: 8,
    responseTimeMs: 120,
    model: "gpt-4o-mini",
    status: "success",
    finishReason: "stop",
    ...partial,
  };
}

async function run(): Promise<void> {
  process.env.LLM_ROUTER_ENABLED = "true";
  process.env.LLM_ROUTER_ROLLOUT_PERCENT = "100";
  process.env.LLM_ROUTER_ORG_IDS = "";
  process.env.LITELLM_ROUTER_CHEAP_MODEL = "gpt-4o-mini";
  process.env.LITELLM_ROUTER_STRONG_MODEL = "claude-sonnet-4-6";

  assert.equal(isModelRoutingEnabledForOrganization("org-1"), true);

  const cheapDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: DEFAULT_SIGNALS,
  });
  assert.equal(cheapDecision.selectedModel, "gpt-4o-mini");
  assert.equal(cheapDecision.tier, "cheap");

  const strongDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      hasTools: true,
      toolCount: 9,
      surfaceCount: 2,
      turnType: "tool_chat",
    },
  });
  assert.equal(strongDecision.selectedModel, "gpt-4o");
  assert.equal(strongDecision.tier, "strong");

  const cheapReadToolDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      hasTools: true,
      toolCount: 8,
      readOnlyTools: true,
      toolComplexity: "low",
      historySize: 15,
      surfaceCount: 1,
      turnType: "tool_chat",
    },
  });
  assert.equal(cheapReadToolDecision.selectedModel, "gpt-4o-mini");
  assert.equal(cheapReadToolDecision.tier, "cheap");

  const strongWriteToolDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      hasTools: true,
      toolCount: 8,
      hasSensitiveWrites: true,
      toolComplexity: "medium",
      historySize: 9,
      surfaceCount: 1,
      turnType: "tool_chat",
    },
  });
  assert.equal(strongWriteToolDecision.selectedModel, "gpt-4o");
  assert.equal(strongWriteToolDecision.tier, "strong");

  const strongSynthesisDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      needsHighQualitySynthesis: true,
      turnType: "high_quality_synthesis",
    },
  });
  assert.equal(strongSynthesisDecision.selectedModel, "gpt-4o");
  assert.equal(strongSynthesisDecision.tier, "strong");
  assert.equal(
    strongSynthesisDecision.reasonCodes.includes("direct_strong_high_quality_synthesis"),
    true
  );

  const senderCalls: string[] = [];
  const escalated = await sendRoutedChatCompletion({
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      turnType: "structured_output",
    },
    chatInput: {
      systemPrompt: "Responde JSON",
      messages: [{ role: "user", content: "hazlo" }],
      temperature: 0,
      maxTokens: 100,
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
    },
    evaluateStructuredOutput: () => ({ parseValid: false }),
    sender: async (input: ChatCompletionInput) => {
      senderCalls.push(input.model);
      if (input.model === "gpt-4o-mini") {
        return buildOutput({ model: "gpt-4o-mini", content: "no-json" });
      }
      return buildOutput({ model: "gpt-4o", content: "{\"ok\":true}" });
    },
  });
  assert.deepEqual(senderCalls, ["gpt-4o-mini", "gpt-4o"]);
  assert.equal(escalated.routing.escalated, true);
  assert.equal(escalated.routing.escalationReasonCodes.includes("escalate_parse_invalid"), true);

  const successfulCheap = await sendRoutedChatCompletion({
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: DEFAULT_SIGNALS,
    chatInput: {
      systemPrompt: "Responde breve",
      messages: [{ role: "user", content: "hola" }],
      temperature: 0,
      maxTokens: 100,
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
    },
    sender: async (input: ChatCompletionInput) => buildOutput({ model: input.model }),
  });
  assert.equal(successfulCheap.routing.escalated, false);
  assert.equal(successfulCheap.routing.attempts.length, 1);

  const suppressedEscalation = await sendRoutedChatCompletion({
    requestedModel: "gpt-4o",
    policy: resolveRuntimeModelRoutePolicy("gpt-4o"),
    signals: {
      ...DEFAULT_SIGNALS,
      turnType: "structured_output",
    },
    chatInput: {
      systemPrompt: "Devuelve una tool call",
      messages: [{ role: "user", content: "hazlo" }],
      temperature: 0,
      maxTokens: 100,
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
    },
    expectToolCall: true,
    suppressEscalationReasonCodes: [
      "escalate_expected_tool_missing",
      "escalate_empty_output",
      "escalate_generic_clarification",
    ],
    sender: async (input: ChatCompletionInput) =>
      buildOutput({
        model: input.model,
        content: "Necesito mas contexto para continuar.",
      }),
  });
  assert.equal(suppressedEscalation.routing.escalated, false);
  assert.equal(suppressedEscalation.routing.attempts.length, 1);

  process.env.LLM_ROUTER_ENABLED = "false";
  const disabledDecision = resolveModelRoute({
    organizationId: "org-1",
    requestedModel: "claude-sonnet-4-6",
    policy: resolveRuntimeModelRoutePolicy("claude-sonnet-4-6"),
    signals: DEFAULT_SIGNALS,
  });
  assert.equal(disabledDecision.selectedModel, "claude-sonnet-4-6");
  assert.equal(disabledDecision.allowEscalation, false);

  console.log("model-routing checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
