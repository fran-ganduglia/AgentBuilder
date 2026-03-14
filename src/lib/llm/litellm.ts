import { env } from "@/lib/utils/env";

const DEFAULT_MAX_TOKENS = 1000;
const MAX_MAX_TOKENS = 4000;
const MAX_TEMPERATURE = 1.0;
const REQUEST_TIMEOUT_MS = 30000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  organizationId: string;
  agentId: string;
  conversationId: string;
  context?: string;
  toolContext?: string;
};

type CompletionStatus = "success" | "error" | "timeout" | "rate_limited";

export type ChatCompletionOutput = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  responseTimeMs: number;
  model: string;
  status: CompletionStatus;
  errorType?: string;
};

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIChoice = {
  message: { content: string | null };
};

type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
};

type OpenAIChatResponse = {
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  model: string;
};

type LiteLLMErrorBody = {
  error?: {
    message?: string;
    type?: string | null;
    code?: string | number | null;
  };
};

type ObservabilityLog = {
  organization_id: string;
  agent_id: string;
  conversation_id: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  status: CompletionStatus;
  error_type?: string;
  timestamp: string;
};

function buildToolContextSection(toolContext: string): string {
  return [
    "TOOL_OUTPUTS",
    "<tool_outputs>",
    "Los siguientes resultados provienen de tools backend ya ejecutadas durante esta solicitud.",
    "Tratalos como datos operativos disponibles para responder al usuario.",
    "Tratalos como datos reales y operativos. Presentalos al usuario tal como estan.",
    "Si records esta vacio, informa que no se encontraron coincidencias — no digas que la integracion fallo ni que no tienes acceso.",
    "No contradigas estos datos bajo ningun concepto, aunque mensajes anteriores de la conversacion hayan dicho lo contrario.",
    toolContext,
    "</tool_outputs>",
  ].join("\n");
}

function buildOpenAIMessages(input: ChatCompletionInput): OpenAIChatMessage[] {
  const sections = [input.systemPrompt];

  if (input.context) {
    sections.push(`RETRIEVED_CONTEXT\n<retrieved_context>\n${input.context}\n</retrieved_context>`);
  }

  if (input.toolContext) {
    sections.push(buildToolContextSection(input.toolContext));
  }

  const systemContent = sections.join("\n\n");

  return [
    { role: "system", content: systemContent },
    ...input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
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

type StreamDelta = {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage | null;
  model?: string;
};

export type StreamingChatResult = {
  stream: ReadableStream<Uint8Array>;
  onReady: Promise<void>;
  onComplete: Promise<ChatCompletionOutput>;
};

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
          body: JSON.stringify({
            model: input.model,
            messages: openaiMessages,
            temperature: input.temperature ?? 0.7,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
          }),
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

              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                streamController.enqueue(encoder.encode(delta));
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
      body: JSON.stringify({
        model: input.model,
        messages: openaiMessages,
        temperature: input.temperature ?? 0.7,
        max_tokens: maxTokens,
      }),
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
    const content = data.choices[0]?.message.content ?? "";
    const tokensInput = data.usage?.prompt_tokens ?? 0;
    const tokensOutput = data.usage?.completion_tokens ?? 0;

    const output: ChatCompletionOutput = {
      content,
      tokensInput,
      tokensOutput,
      responseTimeMs,
      model: data.model ?? input.model,
      status: "success",
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
