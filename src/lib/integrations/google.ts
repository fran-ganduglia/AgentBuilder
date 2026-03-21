import "server-only";

import { env } from "@/lib/utils/env";
import { hasAllGoogleScopesForSurface } from "@/lib/integrations/google-scopes";
import {
  executeGoogleRequest,
  type GoogleApiEnvelope,
  type GoogleProviderContext,
} from "@/lib/integrations/google-http";

const GOOGLE_OAUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_API_BASE_URL = "https://gmail.googleapis.com";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4";
const GOOGLE_DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_API_BASE_URL = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_PEOPLE_API_BASE_URL = "https://people.googleapis.com/v1";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
};

export type GoogleOauthResult = {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  grantedScopes: string[];
  tokenType: string | null;
  connectedEmail: string | null;
  workspaceCustomerId: string | null;
  googleCalendarPrimaryTimezone: string | null;
  googleCalendarUserTimezone: string | null;
};

function normalizeScopes(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean))].sort();
}

function getAccessTokenExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}


export function getGoogleCallbackUrl(): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function buildGoogleAuthorizeUrl(input: {
  state: string;
  scopes: string[];
  promptConsent: boolean;
}): string {
  const searchParams = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    scope: input.scopes.join(" "),
    state: input.state,
  });

  if (input.promptConsent) {
    searchParams.set("prompt", "consent");
  }

  return `${GOOGLE_OAUTH_BASE_URL}?${searchParams.toString()}`;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
  const response = await executeGoogleRequest<GoogleUserInfoResponse>(
    GOOGLE_USERINFO_URL,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.data;
}

function isValidTimezone(timezone: string | null | undefined): timezone is string {
  if (!timezone || timezone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function getGoogleCalendarTimezones(
  accessToken: string,
  grantedScopes: string[]
): Promise<{
  googleCalendarPrimaryTimezone: string | null;
  googleCalendarUserTimezone: string | null;
}> {
  if (!hasAllGoogleScopesForSurface(grantedScopes, "google_calendar")) {
    return {
      googleCalendarPrimaryTimezone: null,
      googleCalendarUserTimezone: null,
    };
  }

  let googleCalendarPrimaryTimezone: string | null = null;
  let googleCalendarUserTimezone: string | null = null;

  try {
    const primaryResponse = await requestGoogleCalendar<{ timeZone?: string }>(
      accessToken,
      "/users/me/calendarList/primary",
      { method: "GET" }
    );
    googleCalendarPrimaryTimezone = isValidTimezone(primaryResponse.data.timeZone)
      ? primaryResponse.data.timeZone
      : null;
  } catch {
    googleCalendarPrimaryTimezone = null;
  }

  try {
    const settingsResponse = await requestGoogleCalendar<{ value?: string }>(
      accessToken,
      "/users/me/settings/timezone",
      { method: "GET" }
    );
    googleCalendarUserTimezone = isValidTimezone(settingsResponse.data.value)
      ? settingsResponse.data.value
      : null;
  } catch {
    googleCalendarUserTimezone = null;
  }

  return {
    googleCalendarPrimaryTimezone,
    googleCalendarUserTimezone,
  };
}

async function exchangeGoogleToken(body: URLSearchParams): Promise<GoogleOauthResult> {
  const response = await executeGoogleRequest<GoogleTokenResponse>(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  const userInfo = await getGoogleUserInfo(response.data.access_token);
  const grantedScopes = normalizeScopes(response.data.scope);
  const calendarTimezones = await getGoogleCalendarTimezones(
    response.data.access_token,
    grantedScopes
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    accessTokenExpiresAt: getAccessTokenExpiresAt(response.data.expires_in),
    grantedScopes,
    tokenType: response.data.token_type ?? null,
    connectedEmail: userInfo.email?.trim() || null,
    workspaceCustomerId: null,
    googleCalendarPrimaryTimezone: calendarTimezones.googleCalendarPrimaryTimezone,
    googleCalendarUserTimezone: calendarTimezones.googleCalendarUserTimezone,
  };
}

export async function exchangeGoogleCode(code: string): Promise<GoogleOauthResult> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: getGoogleCallbackUrl(),
    grant_type: "authorization_code",
  });

  return exchangeGoogleToken(body);
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleOauthResult> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  return exchangeGoogleToken(body);
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await executeGoogleRequest<Record<string, never>>(
    `${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`,
    { method: "POST" }
  );
}

export async function requestGoogleGmail<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}

export async function requestGoogleCalendar<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_CALENDAR_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}

export async function requestGoogleSheets<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_SHEETS_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}

export async function requestGoogleDrive<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_DRIVE_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}

export async function requestGoogleDriveUpload<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_DRIVE_UPLOAD_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}

export async function requestGooglePeople<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  context?: GoogleProviderContext
): Promise<GoogleApiEnvelope<T>> {
  const nextPath = path.startsWith("/") ? path : `/${path}`;

  return executeGoogleRequest<T>(
    `${GOOGLE_PEOPLE_API_BASE_URL}${nextPath}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
    context
  );
}
