import assert from "node:assert/strict";
import {
  buildStructuredSemanticMessages,
  resolveSemanticUsageKind,
  resolveStandaloneSemanticTurnPlan,
  resolveStructuredSemanticTurnPlan,
} from "./semantic-turns";
import type { RequestShapingResult } from "@/lib/chat/request-shaping";

function createShapedRequest(
  overrides: Partial<RequestShapingResult>
): RequestShapingResult {
  return {
    systemPrompt: "Base prompt",
    messages: [{ role: "user", content: "hola" }],
    selectedToolDefinitions: [],
    selectedSurfaces: [],
    toolSelectionReason: "knowledge_only",
    ragMode: "off",
    ragMaxChunks: 0,
    ragMaxCharsPerChunk: 0,
    effectiveMaxTokens: 600,
    intent: "general",
    observability: {
      promptVariant: "full",
      systemPromptProfile: "full",
      totalToolDefinitions: 0,
      selectedToolDefinitions: 0,
      selectedSurfaces: [],
      toolSelectionReason: "knowledge_only",
      ragMode: "off",
      effectiveMaxTokens: 600,
      systemPromptChars: 10,
      systemPromptTokensApprox: 3,
      compactCandidateTokensApprox: null,
      promptTokenDeltaApprox: null,
      historyMessages: 1,
      historyTokensApprox: 5,
    },
    ...overrides,
  };
}

function runUsageKindChecks(): void {
  assert.equal(
    resolveSemanticUsageKind("Analiza mis ultimos mails y dime cual es el mas prometedor"),
    "semantic_ranking"
  );
  assert.equal(
    resolveSemanticUsageKind("Compara estas dos opciones"),
    "semantic_comparison"
  );
  assert.equal(
    resolveSemanticUsageKind("Redacta un correo breve para este cliente"),
    "draft_email_body"
  );
  assert.equal(resolveSemanticUsageKind("Hola, ayudame a pensar esto"), "general_consultive_reply");
}

function runStandalonePlanChecks(): void {
  const plan = resolveStandaloneSemanticTurnPlan({
    shapedRequest: createShapedRequest({ intent: "knowledge" }),
    latestUserMessage: "Explica este documento",
  });

  assert.equal(plan.mode, "standalone");
  assert.equal(plan.usageKind, "semantic_summary");
}

function runStructuredPlanChecks(): void {
  const plan = resolveStructuredSemanticTurnPlan({
    latestUserMessage: "Analiza mis ultimos mails y dime cual es el mas prometedor",
    shapedRequest: createShapedRequest({
      intent: "tool_ambiguous",
      selectedSurfaces: ["gmail"],
      toolSelectionReason: "single_surface",
    }),
  });

  assert.equal(plan?.mode, "post_structured");
  assert.equal(plan?.usageKind, "semantic_ranking");

  const noPlan = resolveStructuredSemanticTurnPlan({
    latestUserMessage: "Lee ese hilo",
    shapedRequest: createShapedRequest({
      intent: "tool_ambiguous",
      selectedSurfaces: ["gmail"],
      toolSelectionReason: "single_surface",
    }),
  });

  assert.equal(noPlan, null);
}

function runEvidenceMessageChecks(): void {
  const messages = buildStructuredSemanticMessages({
    latestUserMessage: "Resume esto",
    evidence: "1. Mail A\n2. Mail B",
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0]?.content ?? "", /Evidencia verificada recuperada/);
}

function run(): void {
  runUsageKindChecks();
  runStandalonePlanChecks();
  runStructuredPlanChecks();
  runEvidenceMessageChecks();
  console.log("semantic-turns checks passed");
}

run();
