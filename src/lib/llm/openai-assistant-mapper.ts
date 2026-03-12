import type { CreateAgentInput, UpdateAgentInput } from "@/lib/db/agents";
import type { OpenAIAssistant } from "@/lib/llm/openai-assistants";
import type { Json } from "@/types/database";

export function mapAssistantToCreateAgentInput(
  assistant: OpenAIAssistant,
  status: "draft" | "active" = "active"
): CreateAgentInput {
  return {
    name: assistant.name,
    description: assistant.description,
    systemPrompt: assistant.instructions,
    llmModel: assistant.model,
    llmTemperature: assistant.temperature,
    status,
  };
}

export function mapAssistantToUpdateAgentInput(
  assistant: OpenAIAssistant
): UpdateAgentInput {
  return {
    name: assistant.name,
    description: assistant.description,
    systemPrompt: assistant.instructions,
    llmModel: assistant.model,
    llmTemperature: assistant.temperature,
  };
}

export function buildAssistantConnectionMetadata(assistant: OpenAIAssistant): Json {
  return {
    source: "openai_assistants",
    name: assistant.name,
    model: assistant.model,
    metadata: assistant.metadata,
  };
}
