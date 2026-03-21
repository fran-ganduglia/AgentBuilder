import assert from "node:assert/strict";
import {
  resolveSemanticLlmRoutingSignals,
  sendSemanticCompletion,
} from "./semantic-generation";

async function run(): Promise<void> {
  const draftSignals = resolveSemanticLlmRoutingSignals({
    usageKind: "draft_email_body",
    historySize: 2,
  });
  assert.equal(draftSignals.turnType, "high_quality_synthesis");
  assert.equal(draftSignals.needsHighQualitySynthesis, true);
  assert.equal(draftSignals.hasTools, false);

  const analysisSignals = resolveSemanticLlmRoutingSignals({
    usageKind: "qa_prompt_proposal",
    historySize: 5,
  });
  assert.equal(analysisSignals.turnType, "analysis");
  assert.equal(analysisSignals.needsHighQualitySynthesis, false);
  assert.equal(analysisSignals.hasTools, false);

  let senderCalls = 0;
  const completion = await sendSemanticCompletion({
    usageKind: "semantic_summary",
    requestedModel: "gpt-4o",
    policy: {
      primaryModel: "gpt-4o-mini",
      escalationModel: "gpt-4o",
      maxEscalationsPerTurn: 1,
    },
    chatInput: {
      systemPrompt: "Resume evidencia validada.",
      messages: [
        { role: "user", content: "{\"items\":[\"uno\",\"dos\"]}" },
      ],
      temperature: 0.1,
      maxTokens: 200,
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
    },
    sender: async (input) => {
      senderCalls += 1;
      assert.equal(input.tools, undefined);
      assert.equal(input.toolChoice, undefined);
      assert.equal(input.messages.length, 1);
      assert.equal(input.systemPrompt, "Resume evidencia validada.");

      return {
        content: "Resumen listo",
        tokensInput: 10,
        tokensOutput: 5,
        responseTimeMs: 42,
        model: input.model,
        status: "success",
        finishReason: "stop",
      };
    },
  });

  assert.equal(senderCalls, 1);
  assert.equal(completion.usageKind, "semantic_summary");
  assert.equal(completion.output.content, "Resumen listo");

  console.log("semantic-generation checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
