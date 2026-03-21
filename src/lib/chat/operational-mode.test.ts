import assert from "node:assert/strict";
import { resolveOperationalModeDecision } from "./operational-mode";
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

function runConsultiveChecks(): void {
  const decision = resolveOperationalModeDecision({
    shapedRequest: createShapedRequest({
      intent: "knowledge",
    }),
  });

  assert.deepEqual(decision, { kind: "allow_consultive_llm" });
}

function runSupportedOperationalChecks(): void {
  const decision = resolveOperationalModeDecision({
    shapedRequest: createShapedRequest({
      intent: "tool_ambiguous",
      selectedSurfaces: ["gmail"],
      toolSelectionReason: "single_surface",
    }),
  });

  assert.equal(decision.kind, "clarify_with_ui");
  assert.match(decision.message, /capacidad operativa soportada/i);
}

function runUnsupportedOperationalChecks(): void {
  const decision = resolveOperationalModeDecision({
    shapedRequest: createShapedRequest({
      intent: "tool_ambiguous",
      selectedSurfaces: ["salesforce", "gmail"],
      toolSelectionReason: "multi_surface",
    }),
  });

  assert.equal(decision.kind, "reject_unsupported");
  assert.deepEqual(decision.unsupportedSurfaces, ["salesforce"]);
  assert.match(decision.message, /Salesforce/);
}

function run(): void {
  runConsultiveChecks();
  runSupportedOperationalChecks();
  runUnsupportedOperationalChecks();
  console.log("operational-mode checks passed");
}

run();
