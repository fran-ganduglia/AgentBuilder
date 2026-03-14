import "server-only";

import { env } from "@/lib/utils/env";
import {
  performProviderRequest,
  type ProviderRequestContext,
} from "@/lib/integrations/provider-gateway";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

const HUBSPOT_REQUEST_TIMEOUT_MS = 15000;
const HUBSPOT_API_BASE_URL = "https://api.hubapi.com";
const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";

type HubSpotProviderContext = Omit<ProviderRequestContext, "provider">;

type HubSpotTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  hub_id?: number | string;
  scope?: string;
};

type HubSpotApiEnvelope<T> = {
  data: T;
  requestId: string | null;
};

function normalizeScopes(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function getAccessTokenExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function executeRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  context?: HubSpotProviderContext
): Promise<HubSpotApiEnvelope<T>> {
  const request = async (): Promise<HubSpotApiEnvelope<T>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HUBSPOT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });

      const requestId = response.headers.get("x-hubspot-request-id") ?? response.headers.get("x-request-id");
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let message = `HubSpot respondio con status ${response.status}`;

        try {
          if (contentType.includes("application/json")) {
            const payload = (await response.json()) as {
              message?: string;
              error?: string;
              errors?: Array<{ message?: string }>;
            };
            message = payload.message ?? payload.error ?? payload.errors?.[0]?.message ?? message;
          } else {
            const text = await response.text();
            if (text.trim().length > 0) {
              message = text.trim();
            }
          }
        } catch {
          // Mantener mensaje fallback por status.
        }

        throw new ProviderRequestError({
          provider: "hubspot",
          message,
          statusCode: response.status,
          requestId,
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
          provider: "hubspot",
          message: "HubSpot excedio el tiempo maximo de respuesta",
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
      provider: "hubspot",
      autoMarkReauth: false,
      onBudgetExceededMessage: "Se alcanzo temporalmente el presupuesto operativo configurado para HubSpot.",
    },
    request
  );
}

export type HubSpotCredentials = {
  accessToken: string;
};

export type HubSpotOauthResult = {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  grantedScopes: string[];
  hubId: string | null;
  tokenType: string | null;
};

export type HubSpotRefreshResult = HubSpotOauthResult;

export function getHubSpotCallbackUrl(): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/integrations/hubspot/callback`;
}

export function buildHubSpotAuthorizeUrl(state: string): string {
  const searchParams = new URLSearchParams({
    client_id: env.HUBSPOT_CLIENT_ID,
    redirect_uri: getHubSpotCallbackUrl(),
    scope: env.HUBSPOT_OAUTH_SCOPES,
    state,
  });

  return `${HUBSPOT_AUTHORIZE_URL}?${searchParams.toString()}`;
}

export async function exchangeHubSpotCode(code: string): Promise<HubSpotOauthResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.HUBSPOT_CLIENT_ID,
    client_secret: env.HUBSPOT_CLIENT_SECRET,
    redirect_uri: getHubSpotCallbackUrl(),
    code,
  });

  const response = await executeRequest<HubSpotTokenResponse>(
    `${HUBSPOT_API_BASE_URL}/oauth/v1/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: body.toString(),
    }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    accessTokenExpiresAt: getAccessTokenExpiresAt(response.data.expires_in),
    grantedScopes: normalizeScopes(response.data.scope),
    hubId: response.data.hub_id ? String(response.data.hub_id) : null,
    tokenType: response.data.token_type ?? null,
  };
}

export async function refreshHubSpotAccessToken(
  refreshToken: string
): Promise<HubSpotRefreshResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.HUBSPOT_CLIENT_ID,
    client_secret: env.HUBSPOT_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const response = await executeRequest<HubSpotTokenResponse>(
    `${HUBSPOT_API_BASE_URL}/oauth/v1/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: body.toString(),
    }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    accessTokenExpiresAt: getAccessTokenExpiresAt(response.data.expires_in),
    grantedScopes: normalizeScopes(response.data.scope),
    hubId: response.data.hub_id ? String(response.data.hub_id) : null,
    tokenType: response.data.token_type ?? null,
  };
}

export async function revokeHubSpotToken(input: {
  token: string;
  tokenType: "access" | "refresh";
}): Promise<void> {
  const path = input.tokenType === "refresh"
    ? `/oauth/v1/refresh-tokens/${encodeURIComponent(input.token)}`
    : `/oauth/v1/access-tokens/${encodeURIComponent(input.token)}`;

  await executeRequest<Record<string, never>>(`${HUBSPOT_API_BASE_URL}${path}`, {
    method: "DELETE",
  });
}

export async function requestHubSpot<T>(
  credentials: HubSpotCredentials,
  path: string,
  init?: RequestInit,
  context?: HubSpotProviderContext
): Promise<HubSpotApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeRequest<T>(
    `${HUBSPOT_API_BASE_URL}${nextPath}`,
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
