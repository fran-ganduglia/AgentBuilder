import "server-only";

import { performProviderRequest, type ProviderRequestContext } from "@/lib/integrations/provider-gateway";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

const OPENAI_ASSISTANTS_URL = "https://api.openai.com/v1/assistants";
const OPENAI_ASSISTANTS_TIMEOUT_MS = 15000;

type OpenAIAssistantApiResponse = {
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  model: string;
  temperature: number | null;
  metadata: Record<string, string> | null;
  created_at: number | null;
};

type OpenAIListAssistantsResponse = {
  data?: OpenAIAssistantApiResponse[];
};

type OpenAIProviderContext = Omit<ProviderRequestContext, "provider">;

type ProviderJsonResponse<T> = {
  data: T;
  requestId: string | null;
};

export type OpenAIAssistant = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  temperature: number;
  metadata: Record<string, string>;
  remoteUpdatedAt: string | null;
  providerRequestId: string | null;
};

export type UpsertOpenAIAssistantInput = {
  name: string;
  description?: string;
  instructions: string;
  model: string;
  temperature: number;
};

function mapAssistant(
  assistant: OpenAIAssistantApiResponse,
  requestId: string | null
): OpenAIAssistant {
  return {
    id: assistant.id,
    name: assistant.name?.trim() || "Assistant sin nombre",
    description: assistant.description?.trim() || "",
    instructions: assistant.instructions?.trim() || "Sos un asistente util.",
    model: assistant.model,
    temperature: assistant.temperature ?? 0.7,
    metadata: assistant.metadata ?? {},
    remoteUpdatedAt: assistant.created_at
      ? new Date(assistant.created_at * 1000).toISOString()
      : null,
    providerRequestId: requestId,
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

async function requestOpenAI<T>(
  apiKey: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  context?: OpenAIProviderContext
): Promise<ProviderJsonResponse<T>> {
  const executeRequest = async (): Promise<ProviderJsonResponse<T>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_ASSISTANTS_TIMEOUT_MS);

    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });

      const requestId = response.headers.get("x-request-id");
      if (!response.ok) {
        let message = `OpenAI respondio con status ${response.status}`;

        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          message = payload.error?.message ?? message;
        } catch {
          // Use fallback message when the provider does not return JSON.
        }

        throw new ProviderRequestError({
          provider: "openai",
          message,
          statusCode: response.status,
          requestId,
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        });
      }

      if (response.status === 204) {
        return {
          data: {} as T,
          requestId,
        };
      }

      return {
        data: (await response.json()) as T,
        requestId,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError({
          provider: "openai",
          message: "OpenAI excedio el tiempo maximo de respuesta",
          statusCode: 504,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!context) {
    return executeRequest();
  }

  return performProviderRequest(
    {
      ...context,
      provider: "openai",
      onBudgetExceededMessage: "Se alcanzo temporalmente el presupuesto operativo configurado para OpenAI.",
    },
    executeRequest
  );
}

export async function validateOpenAIApiKey(
  apiKey: string,
  context?: OpenAIProviderContext
): Promise<void> {
  await listOpenAIAssistants(apiKey, 1, context);
}

export async function listOpenAIAssistants(
  apiKey: string,
  limit = 100,
  context?: OpenAIProviderContext
): Promise<OpenAIAssistant[]> {
  const url = `${OPENAI_ASSISTANTS_URL}?order=desc&limit=${Math.min(Math.max(limit, 1), 100)}`;
  const response = await requestOpenAI<OpenAIListAssistantsResponse>(apiKey, url, {
    method: "GET",
  }, context);

  return (response.data.data ?? []).map((assistant) => mapAssistant(assistant, response.requestId));
}

export async function getOpenAIAssistant(
  apiKey: string,
  assistantId: string,
  context?: OpenAIProviderContext
): Promise<OpenAIAssistant> {
  const response = await requestOpenAI<OpenAIAssistantApiResponse>(
    apiKey,
    `${OPENAI_ASSISTANTS_URL}/${assistantId}`,
    { method: "GET" },
    context
  );

  return mapAssistant(response.data, response.requestId);
}

export async function createOpenAIAssistant(
  apiKey: string,
  input: UpsertOpenAIAssistantInput,
  context?: OpenAIProviderContext
): Promise<OpenAIAssistant> {
  const response = await requestOpenAI<OpenAIAssistantApiResponse>(apiKey, OPENAI_ASSISTANTS_URL, {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      name: input.name,
      description: input.description || null,
      instructions: input.instructions,
      temperature: input.temperature,
    }),
  }, context);

  return mapAssistant(response.data, response.requestId);
}

export async function updateOpenAIAssistant(
  apiKey: string,
  assistantId: string,
  input: UpsertOpenAIAssistantInput,
  context?: OpenAIProviderContext
): Promise<OpenAIAssistant> {
  const response = await requestOpenAI<OpenAIAssistantApiResponse>(
    apiKey,
    `${OPENAI_ASSISTANTS_URL}/${assistantId}`,
    {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        name: input.name,
        description: input.description || null,
        instructions: input.instructions,
        temperature: input.temperature,
      }),
    },
    context
  );

  return mapAssistant(response.data, response.requestId);
}

export async function deleteOpenAIAssistant(
  apiKey: string,
  assistantId: string,
  context?: OpenAIProviderContext
): Promise<void> {
  await requestOpenAI<Record<string, never>>(apiKey, `${OPENAI_ASSISTANTS_URL}/${assistantId}`, {
    method: "DELETE",
  }, context);
}
