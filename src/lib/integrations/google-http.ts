import "server-only";

import {
  performProviderRequest,
  type ProviderRequestContext,
} from "@/lib/integrations/provider-gateway";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const GOOGLE_MAX_RETRIES = 2;

type GoogleProviderContext = Omit<ProviderRequestContext, "provider">;

type GoogleApiEnvelope<T> = {
  data: T;
  requestId: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryAt = new Date(value).getTime();
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function shouldRetry(error: unknown, attempt: number): error is ProviderRequestError {
  if (!(error instanceof ProviderRequestError)) {
    return false;
  }

  if (attempt >= GOOGLE_MAX_RETRIES) {
    return false;
  }

  return error.statusCode === 429 || (error.statusCode !== null && error.statusCode >= 500);
}

function getRetryDelayMs(error: ProviderRequestError, attempt: number): number {
  if (error.retryAfterSeconds && error.retryAfterSeconds > 0) {
    return error.retryAfterSeconds * 1000;
  }

  return Math.min(1500 * 2 ** attempt, 5000);
}

export async function executeGoogleRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const request = async (): Promise<GoogleApiEnvelope<T>> => {
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
          cache: "no-store",
        });

        const requestId =
          response.headers.get("x-request-id") ??
          response.headers.get("x-google-request-id");
        const contentType = response.headers.get("content-type") ?? "";

        if (!response.ok) {
          let message = `Google respondio con status ${response.status}`;

          try {
            if (contentType.includes("application/json")) {
              const payload = (await response.json()) as {
                error?: { message?: string } | string;
              };
              if (typeof payload.error === "string") {
                message = payload.error;
              } else {
                message = payload.error?.message ?? message;
              }
            } else {
              const text = await response.text();
              if (text.trim().length > 0) {
                message = text.trim();
              }
            }
          } catch {
            // Mantener fallback por status.
          }

          throw new ProviderRequestError({
            provider: "google_workspace",
            message,
            statusCode: response.status,
            requestId,
            retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
          });
        }

        if (response.status === 204) {
          return { data: {} as T, requestId };
        }

        const data = contentType.includes("application/json")
          ? ((await response.json()) as T)
          : ({ raw: await response.text() } as T);

        return { data, requestId };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ProviderRequestError({
            provider: "google_workspace",
            message: "Google excedio el tiempo maximo de respuesta",
            statusCode: 504,
          });
        }

        if (shouldRetry(error, attempt)) {
          await sleep(getRetryDelayMs(error, attempt));
          attempt += 1;
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };

  if (!context) {
    return request();
  }

  return performProviderRequest(
    {
      ...context,
      provider: "google_workspace",
      autoMarkReauth: false,
      onBudgetExceededMessage:
        "Se alcanzo temporalmente el presupuesto operativo configurado para Google Workspace.",
    },
    request
  );
}

export type { GoogleApiEnvelope, GoogleProviderContext };

