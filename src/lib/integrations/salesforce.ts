import "server-only";

import { env } from "@/lib/utils/env";
import { performProviderRequest, type ProviderRequestContext } from "@/lib/integrations/provider-gateway";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

const SALESFORCE_REQUEST_TIMEOUT_MS = 15000;

type SalesforceProviderContext = Omit<ProviderRequestContext, "provider">;

type SalesforceTokenResponse = {
  access_token: string;
  refresh_token?: string;
  instance_url?: string;
  id?: string;
  scope?: string;
  token_type?: string;
  issued_at?: string;
  signature?: string;
};

type SalesforceApiEnvelope<T> = {
  data: T;
  requestId: string | null;
};

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

function sanitizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function buildTokenEndpoint(baseUrl: string): string {
  return `${sanitizeBaseUrl(baseUrl)}/services/oauth2/token`;
}

function buildRevokeEndpoint(baseUrl: string, token: string): string {
  return `${sanitizeBaseUrl(baseUrl)}/services/oauth2/revoke?token=${encodeURIComponent(token)}`;
}

function normalizeScopes(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function normalizeIssuedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function executeRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  context?: SalesforceProviderContext
): Promise<SalesforceApiEnvelope<T>> {
  const request = async (): Promise<SalesforceApiEnvelope<T>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SALESFORCE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });

      const requestId = response.headers.get("sforce-limit-info") ?? response.headers.get("x-request-id");
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let message = `Salesforce respondio con status ${response.status}`;

        try {
          if (contentType.includes("application/json")) {
            const payload = (await response.json()) as Array<{ message?: string }> | { message?: string; error_description?: string };
            if (Array.isArray(payload)) {
              message = payload[0]?.message ?? message;
            } else {
              message = payload.error_description ?? payload.message ?? message;
            }
          } else {
            const text = await response.text();
            if (text.trim().length > 0) {
              message = text.trim();
            }
          }
        } catch {
          // Use fallback status message.
        }

        throw new ProviderRequestError({
          provider: "salesforce",
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
        ? (await response.json()) as T
        : ({ raw: await response.text() } as T);

      return { data, requestId };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError({
          provider: "salesforce",
          message: "Salesforce excedio el tiempo maximo de respuesta",
          statusCode: 504,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!context) {
    return request();
  }

  return performProviderRequest(
    {
      ...context,
      provider: "salesforce",
      autoMarkReauth: false,
      onBudgetExceededMessage: "Se alcanzo temporalmente el presupuesto operativo configurado para Salesforce.",
    },
    request
  );
}

export type SalesforceCredentials = {
  accessToken: string;
  instanceUrl: string;
};

export type SalesforceOauthResult = {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
  grantedScopes: string[];
  identityUrl: string | null;
  tokenType: string | null;
  issuedAt: string | null;
};

export type SalesforceRefreshResult = {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string | null;
  grantedScopes: string[];
  identityUrl: string | null;
  tokenType: string | null;
  issuedAt: string | null;
};

export function getSalesforceCallbackUrl(): string {
  return `${sanitizeBaseUrl(env.APP_BASE_URL)}/api/integrations/salesforce/callback`;
}

export function buildSalesforceAuthorizeUrl(state: string): string {
  const baseUrl = sanitizeBaseUrl(env.SALESFORCE_LOGIN_URL);
  const searchParams = new URLSearchParams({
    response_type: "code",
    client_id: env.SALESFORCE_CLIENT_ID,
    redirect_uri: getSalesforceCallbackUrl(),
    scope: env.SALESFORCE_OAUTH_SCOPES,
    state,
    prompt: "login consent",
  });

  return `${baseUrl}/services/oauth2/authorize?${searchParams.toString()}`;
}

export async function exchangeSalesforceCode(
  code: string
): Promise<SalesforceOauthResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.SALESFORCE_CLIENT_ID,
    client_secret: env.SALESFORCE_CLIENT_SECRET,
    redirect_uri: getSalesforceCallbackUrl(),
  });

  const response = await executeRequest<SalesforceTokenResponse>(
    buildTokenEndpoint(env.SALESFORCE_LOGIN_URL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    instanceUrl: response.data.instance_url ?? sanitizeBaseUrl(env.SALESFORCE_LOGIN_URL),
    grantedScopes: normalizeScopes(response.data.scope),
    identityUrl: response.data.id ?? null,
    tokenType: response.data.token_type ?? null,
    issuedAt: normalizeIssuedAt(response.data.issued_at),
  };
}

export async function refreshSalesforceAccessToken(
  refreshToken: string
): Promise<SalesforceRefreshResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.SALESFORCE_CLIENT_ID,
    client_secret: env.SALESFORCE_CLIENT_SECRET,
  });

  const response = await executeRequest<SalesforceTokenResponse>(
    buildTokenEndpoint(env.SALESFORCE_LOGIN_URL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    instanceUrl: response.data.instance_url ?? null,
    grantedScopes: normalizeScopes(response.data.scope),
    identityUrl: response.data.id ?? null,
    tokenType: response.data.token_type ?? null,
    issuedAt: normalizeIssuedAt(response.data.issued_at),
  };
}

export async function revokeSalesforceToken(input: {
  instanceUrl: string;
  token: string;
}): Promise<void> {
  await executeRequest<Record<string, never>>(
    buildRevokeEndpoint(input.instanceUrl, input.token),
    { method: "POST" }
  );
}

export async function requestSalesforce<T>(
  credentials: SalesforceCredentials,
  path: string,
  init?: RequestInit,
  context?: SalesforceProviderContext
): Promise<SalesforceApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = `${sanitizeBaseUrl(credentials.instanceUrl)}/services/data/${env.SALESFORCE_API_VERSION}`;

  return executeRequest<T>(
    `${baseUrl}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}
