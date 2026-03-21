import { env } from "@/lib/utils/env";
import type {
  ChatCompletionInput,
  ChatCompletionOutput,
  CompletionStatus,
  LiteLLMErrorBody,
  ObservabilityLog,
  OpenAIChatMessage,
  OpenAIChatResponse,
  StreamDelta,
  StreamingChatResult,
  ToolCallPart,
} from "@/lib/llm/litellm-types";

export type { ChatCompletionInput, ChatCompletionOutput, ChatMessage, StreamingChatResult } from "@/lib/llm/litellm-types";
export type { ToolDefinition, ToolCallPart } from "@/lib/llm/litellm-types";

const DEFAULT_MAX_TOKENS = 1000;
const MAX_MAX_TOKENS = 4000;
const MAX_TEMPERATURE = 1.0;
const REQUEST_TIMEOUT_MS = 30000;

function buildOpenAIMessages(input: ChatCompletionInput): OpenAIChatMessage[] {
  const sections = [input.systemPrompt];

  if (input.context) {
    sections.push(`RETRIEVED_CONTEXT\n<retrieved_context>\n${input.context}\n</retrieved_context>`);
  }

  const systemContent = sections.join("\n\n");
  const result: OpenAIChatMessage[] = [{ role: "system", content: systemContent }];

  for (const message of input.messages) {
    if (message.role === "tool") {
      result.push({ role: "tool", tool_call_id: message.tool_call_id, content: message.content });
    } else if (message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0) {
      result.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });
    } else if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content ?? "" });
    } else {
      result.push({ role: "user", content: message.content });
    }
  }

  return result;
}

function logObservability(entry: ObservabilityLog): void {
  console.log(JSON.stringify(entry));
}

function resolveStatus(error: unknown): {
  status: CompletionStatus;
  errorType: string;
} {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { status: "timeout", errorType: "request_timeout" };
  }

  if (error instanceof LiteLLMError) {
    return { status: error.status, errorType: error.errorType };
  }

  return { status: "error", errorType: "unknown" };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as LiteLLMErrorBody;
    return json.error?.message ?? `LiteLLM respondio con status ${response.status}`;
  } catch {
    return `LiteLLM respondio con status ${response.status}`;
  }
}

function classifyProviderErrorType(statusCode: number, message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (statusCode === 404) {
    return "model_not_available";
  }

  if (
    normalizedMessage.includes("credit balance is too low") ||
    normalizedMessage.includes("billing") ||
    normalizedMessage.includes("insufficient credits")
  ) {
    return "provider_billing";
  }

  if (
    statusCode === 401 ||
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("authentication") ||
    normalizedMessage.includes("unauthorized")
  ) {
    return "provider_auth";
  }

  return `http_${statusCode}`;
}

export class LiteLLMError extends Error {
  readonly status: CompletionStatus;
  readonly errorType: string;

  constructor(message: string, status: CompletionStatus, errorType: string) {
    super(message);
    this.name = "LiteLLMError";
    this.status = status;
    this.errorType = errorType;
  }
}

function buildRequestBody(
  input: ChatCompletionInput,
  openaiMessages: OpenAIChatMessage[],
  maxTokens: number,
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: openaiMessages,
    temperature: input.temperature ?? 0.7,
    max_tokens: maxTokens,
  };

  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
    if (input.toolChoice) {
      body.tool_choice = input.toolChoice;
    }
  }

  if (input.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  return body;
}

export function sendStreamingChatCompletion(
  input: ChatCompletionInput
): StreamingChatResult {
  if (input.temperature !== undefined && input.temperature > MAX_TEMPERATURE) {
    throw new LiteLLMError(
      `La temperatura no puede superar ${MAX_TEMPERATURE}`,
      "error",
      "invalid_temperature"
    );
  }

  const maxTokens = Math.min(input.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_MAX_TOKENS);
  const openaiMessages = buildOpenAIMessages(input);

  const controller = new AbortController();
  const requestTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startTime = Date.now();
  const encoder = new TextEncoder();

  let resolveComplete: (output: ChatCompletionOutput) => void;
  let rejectComplete: (error: Error) => void;
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;

  const onComplete = new Promise<ChatCompletionOutput>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });

  const onReady = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        const response = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.LITELLM_API_KEY}`,
          },
          body: JSON.stringify(buildRequestBody(input, openaiMessages, maxTokens, true)),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const providerMessage = await parseErrorMessage(response);
          const responseTimeMs = Date.now() - startTime;

          logObservability({
            organization_id: input.organizationId,
            agent_id: input.agentId,
            conversation_id: input.conversationId,
            model: input.model,
            tokens_input: 0,
            tokens_output: 0,
            latency_ms: responseTimeMs,
            status: "rate_limited",
            error_type: "provider_rate_limit",
            timestamp: new Date().toISOString(),
          });

          const err = new LiteLLMError(providerMessage, "rate_limited", "provider_rate_limit");
          rejectReady(err);
          rejectComplete(err);
          streamController.close();
          return;
        }

        if (!response.ok) {
          const providerMessage = await parseErrorMessage(response);
          const errorType = classifyProviderErrorType(response.status, providerMessage);
          const responseTimeMs = Date.now() - startTime;

          logObservability({
            organization_id: input.organizationId,
            agent_id: input.agentId,
            conversation_id: input.conversationId,
            model: input.model,
            tokens_input: 0,
            tokens_output: 0,
            latency_ms: responseTimeMs,
            status: "error",
            error_type: errorType,
            timestamp: new Date().toISOString(),
          });

          const err = new LiteLLMError(providerMessage, "error", errorType);
          rejectReady(err);
          rejectComplete(err);
          streamController.close();
          return;
        }

        if (!response.body) {
          const err = new LiteLLMError("No se recibio stream del proveedor", "error", "no_stream_body");
          rejectReady(err);
          rejectComplete(err);
          streamController.close();
          return;
        }

        resolveReady();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let tokensInput = 0;
        let tokensOutput = 0;
        let resolvedModel = input.model;
        let finishReason: string | null = null;
        const accumulatedToolCalls = new Map<number, { id: string; name: string; arguments: string }>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;

            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const chunk = JSON.parse(jsonStr) as StreamDelta;

              if (chunk.model) {
                resolvedModel = chunk.model;
              }

              const choice = chunk.choices?.[0];
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }

              const delta = choice?.delta?.content;
              if (delta) {
                fullContent += delta;
                streamController.enqueue(encoder.encode(delta));
              }

              const toolCallDeltas = choice?.delta?.tool_calls;
              if (toolCallDeltas) {
                for (const tc of toolCallDeltas) {
                  const existing = accumulatedToolCalls.get(tc.index);
                  if (!existing) {
                    accumulatedToolCalls.set(tc.index, {
                      id: tc.id ?? "",
                      name: tc.function?.name ?? "",
                      arguments: tc.function?.arguments ?? "",
                    });
                  } else {
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name += tc.function.name;
                    if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                  }
                }
              }

              if (chunk.usage) {
                tokensInput = chunk.usage.prompt_tokens ?? 0;
                tokensOutput = chunk.usage.completion_tokens ?? 0;
              }
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }

        const responseTimeMs = Date.now() - startTime;
        const toolCalls: ToolCallPart[] | undefined =
          accumulatedToolCalls.size > 0
            ? Array.from(accumulatedToolCalls.values()).map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              }))
            : undefined;

        logObservability({
          organization_id: input.organizationId,
          agent_id: input.agentId,
          conversation_id: input.conversationId,
          model: resolvedModel,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          latency_ms: responseTimeMs,
          status: "success",
          timestamp: new Date().toISOString(),
        });

        resolveComplete({
          content: fullContent,
          tokensInput,
          tokensOutput,
          responseTimeMs,
          model: resolvedModel,
          status: "success",
          toolCalls,
          finishReason: finishReason === "tool_calls" ? "tool_calls" : "stop",
        });

        streamController.close();
      } catch (error) {
        const responseTimeMs = Date.now() - startTime;

        if (error instanceof LiteLLMError) {
          rejectReady(error);
          rejectComplete(error);
          streamController.close();
          return;
        }

        const { status, errorType } = resolveStatus(error);

        logObservability({
          organization_id: input.organizationId,
          agent_id: input.agentId,
          conversation_id: input.conversationId,
          model: input.model,
          tokens_input: 0,
          tokens_output: 0,
          latency_ms: responseTimeMs,
          status,
          error_type: errorType,
          timestamp: new Date().toISOString(),
        });

        const llmError = new LiteLLMError(
          error instanceof Error ? error.message : "Error desconocido en LiteLLM",
          status,
          errorType
        );
        rejectReady(llmError);
        rejectComplete(llmError);
        streamController.close();
      } finally {
        clearTimeout(requestTimer);
      }
    },
    cancel() {
      controller.abort();
      clearTimeout(requestTimer);
    },
  });

  return { stream, onReady, onComplete };
}

export async function sendChatCompletion(
  input: ChatCompletionInput
): Promise<ChatCompletionOutput> {
  if (input.temperature !== undefined && input.temperature > MAX_TEMPERATURE) {
    throw new LiteLLMError(
      `La temperatura no puede superar ${MAX_TEMPERATURE}`,
      "error",
      "invalid_temperature"
    );
  }

  const maxTokens = Math.min(input.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_MAX_TOKENS);
  const openaiMessages = buildOpenAIMessages(input);

  const controller = new AbortController();
  const requestTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const response = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LITELLM_API_KEY}`,
      },
      body: JSON.stringify(buildRequestBody(input, openaiMessages, maxTokens, false)),
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - startTime;

    if (response.status === 429) {
      const providerMessage = await parseErrorMessage(response);

      logObservability({
        organization_id: input.organizationId,
        agent_id: input.agentId,
        conversation_id: input.conversationId,
        model: input.model,
        tokens_input: 0,
        tokens_output: 0,
        latency_ms: responseTimeMs,
        status: "rate_limited",
        error_type: "provider_rate_limit",
        timestamp: new Date().toISOString(),
      });

      throw new LiteLLMError(providerMessage, "rate_limited", "provider_rate_limit");
    }

    if (!response.ok) {
      const providerMessage = await parseErrorMessage(response);
      const errorType = classifyProviderErrorType(response.status, providerMessage);

      logObservability({
        organization_id: input.organizationId,
        agent_id: input.agentId,
        conversation_id: input.conversationId,
        model: input.model,
        tokens_input: 0,
        tokens_output: 0,
        latency_ms: responseTimeMs,
        status: "error",
        error_type: errorType,
        timestamp: new Date().toISOString(),
      });

      throw new LiteLLMError(providerMessage, "error", errorType);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const choice = data.choices[0];
    const content = choice?.message.content ?? "";
    const tokensInput = data.usage?.prompt_tokens ?? 0;
    const tokensOutput = data.usage?.completion_tokens ?? 0;
    const toolCalls = choice?.message.tool_calls;
    const rawFinishReason = choice?.finish_reason;

    const output: ChatCompletionOutput = {
      content,
      tokensInput,
      tokensOutput,
      responseTimeMs,
      model: data.model ?? input.model,
      status: "success",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: rawFinishReason === "tool_calls" ? "tool_calls" : "stop",
    };

    logObservability({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      conversation_id: input.conversationId,
      model: output.model,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      latency_ms: responseTimeMs,
      status: "success",
      timestamp: new Date().toISOString(),
    });

    return output;
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    if (error instanceof LiteLLMError) {
      throw error;
    }

    const { status, errorType } = resolveStatus(error);

    logObservability({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      conversation_id: input.conversationId,
      model: input.model,
      tokens_input: 0,
      tokens_output: 0,
      latency_ms: responseTimeMs,
      status,
      error_type: errorType,
      timestamp: new Date().toISOString(),
    });

    throw new LiteLLMError(
      error instanceof Error ? error.message : "Error desconocido en LiteLLM",
      status,
      errorType
    );
  } finally {
    clearTimeout(requestTimer);
  }
}
