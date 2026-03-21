import "server-only";

import type { ModelRoutePolicy } from "@/lib/agents/agent-config";
import {
  sendRoutedChatCompletion,
  type RoutedCompletionMetadata,
  type RoutingSignals,
} from "@/lib/llm/model-routing";
import type {
  ChatCompletionInput,
  ChatCompletionOutput,
  ChatMessage,
} from "@/lib/llm/litellm-types";

export type SemanticLlmUsageKind =
  | "general_consultive_reply"
  | "draft_email_body"
  | "draft_reply_body"
  | "draft_internal_update"
  | "semantic_summary"
  | "semantic_ranking"
  | "semantic_comparison"
  | "next_step_advice"
  | "qa_prompt_proposal";

type StructuredOutputEvaluation = {
  parseValid?: boolean;
  confidence?: number | null;
};

type SemanticChatInput = Omit<
  ChatCompletionInput,
  "model" | "tools" | "toolChoice"
>;

type SemanticCompletionInput = {
  usageKind: SemanticLlmUsageKind;
  requestedModel: string;
  policy: ModelRoutePolicy;
  chatInput: SemanticChatInput;
  evaluateStructuredOutput?: (
    output: ChatCompletionOutput
  ) => StructuredOutputEvaluation;
  sender?: (input: ChatCompletionInput) => Promise<ChatCompletionOutput>;
};

function isDraftUsageKind(usageKind: SemanticLlmUsageKind): boolean {
  return (
    usageKind === "draft_email_body" ||
    usageKind === "draft_reply_body" ||
    usageKind === "draft_internal_update"
  );
}

export function resolveSemanticLlmRoutingSignals(input: {
  usageKind: SemanticLlmUsageKind;
  historySize: number;
}): RoutingSignals {
  const turnType = isDraftUsageKind(input.usageKind)
    ? "high_quality_synthesis"
    : "analysis";

  return {
    hasTools: false,
    toolCount: 0,
    hasRag: false,
    ragChunkCount: 0,
    historySize: input.historySize,
    surfaceCount: 0,
    isAmbiguous: false,
    needsHighQualitySynthesis: turnType === "high_quality_synthesis",
    previousFailures: 0,
    channel: "api",
    turnType,
  };
}

export async function sendSemanticCompletion(
  input: SemanticCompletionInput
): Promise<{
  usageKind: SemanticLlmUsageKind;
  output: ChatCompletionOutput;
  routing: RoutedCompletionMetadata;
}> {
  const messages: ChatMessage[] = input.chatInput.messages.map((message) => {
    if (message.role === "assistant" && "tool_calls" in message) {
      return {
        role: "assistant" as const,
        content: message.content ?? "",
      };
    }

    return message;
  });

  const routed = await sendRoutedChatCompletion({
    requestedModel: input.requestedModel,
    policy: input.policy,
    signals: resolveSemanticLlmRoutingSignals({
      usageKind: input.usageKind,
      historySize: messages.length,
    }),
    chatInput: {
      ...input.chatInput,
      messages,
    },
    evaluateStructuredOutput: input.evaluateStructuredOutput,
    sender: input.sender,
  });

  return {
    usageKind: input.usageKind,
    output: routed.output,
    routing: routed.routing,
  };
}
