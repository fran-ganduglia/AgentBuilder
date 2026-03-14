import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

const EXPIRING_SOON_WINDOW_MS = 1000 * 60 * 60 * 72;

type JsonRecord = Record<string, Json | undefined>;

export type IntegrationOperationalStatus =
  | "disconnected"
  | "connected"
  | "expiring_soon"
  | "reauth_required"
  | "compromised"
  | "revoked"
  | "error";

export type IntegrationStatusTone = "emerald" | "amber" | "rose" | "slate";

export type IntegrationOperationalView = {
  integrationId: string | null;
  provider: string | null;
  isConfigured: boolean;
  isActive: boolean;
  status: IntegrationOperationalStatus;
  tone: IntegrationStatusTone;
  label: string;
  summary: string;
  detail: string | null;
  lastAuthError: string | null;
  grantedScopes: string[];
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  reauthRequiredAt: string | null;
  compromisedAt: string | null;
  revokedAt: string | null;
};

function asJsonRecord(metadata: Json | null | undefined): JsonRecord {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...metadata } as JsonRecord;
}

export function getMetadataString(
  metadata: Json | null | undefined,
  key: string
): string | null {
  const value = asJsonRecord(metadata)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataDate(
  metadata: Json | null | undefined,
  key: string
): string | null {
  const value = getMetadataString(metadata, key);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function getMetadataStringArray(
  metadata: Json | null | undefined,
  key: string
): string[] {
  const value = asJsonRecord(metadata)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

export type GoogleCalendarTimezoneMetadata = {
  primaryTimezone: string | null;
  userTimezone: string | null;
  detectedTimezone: string | null;
};

export function getGoogleCalendarTimezoneMetadata(
  metadata: Json | null | undefined
): GoogleCalendarTimezoneMetadata {
  const primaryTimezone = getMetadataString(
    metadata,
    "google_calendar_primary_timezone"
  );
  const userTimezone = getMetadataString(
    metadata,
    "google_calendar_user_timezone"
  );

  return {
    primaryTimezone: isValidTimezone(primaryTimezone) ? primaryTimezone : null,
    userTimezone: isValidTimezone(userTimezone) ? userTimezone : null,
    detectedTimezone: isValidTimezone(primaryTimezone)
      ? primaryTimezone
      : isValidTimezone(userTimezone)
        ? userTimezone
        : null,
  };
}

function isExpiringSoon(value: string | null, now: number): boolean {
  if (!value) {
    return false;
  }

  const expirationTime = new Date(value).getTime();
  return !Number.isNaN(expirationTime) && expirationTime > now && expirationTime - now <= EXPIRING_SOON_WINDOW_MS;
}

export function mergeIntegrationMetadata(
  current: Json | null | undefined,
  patch: JsonRecord
): Json {
  return {
    ...asJsonRecord(current),
    ...patch,
  } as Json;
}

export function buildConnectedIntegrationMetadata(input: {
  current: Json | null | undefined;
  validatedAtKey?: string;
  grantedScopes?: string[];
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  providerMetadata?: JsonRecord;
}): Json {
  const validatedAtKey = input.validatedAtKey ?? "validated_at";

  return mergeIntegrationMetadata(input.current, {
    ...(input.providerMetadata ?? {}),
    auth_status: "connected",
    granted_scopes: input.grantedScopes ?? getMetadataStringArray(input.current, "granted_scopes"),
    access_token_expires_at: input.accessTokenExpiresAt ?? null,
    refresh_token_expires_at: input.refreshTokenExpiresAt ?? null,
    last_auth_error: null,
    reauth_required_at: null,
    compromised_at: null,
    revoked_at: null,
    revoked_reason: null,
    [validatedAtKey]: new Date().toISOString(),
  });
}

export function buildReauthRequiredIntegrationMetadata(
  current: Json | null | undefined,
  reason: string
): Json {
  return mergeIntegrationMetadata(current, {
    auth_status: "reauth_required",
    last_auth_error: reason,
    reauth_required_at: new Date().toISOString(),
  });
}

export function buildErroredIntegrationMetadata(
  current: Json | null | undefined,
  reason: string
): Json {
  return mergeIntegrationMetadata(current, {
    auth_status: "error",
    last_auth_error: reason,
  });
}

export function buildRevokedIntegrationMetadata(
  current: Json | null | undefined,
  input: { reason: string; compromised: boolean }
): Json {
  const revokedAt = new Date().toISOString();

  return mergeIntegrationMetadata(current, {
    auth_status: "revoked",
    last_auth_error: input.reason,
    revoked_at: revokedAt,
    revoked_reason: input.reason,
    reauth_required_at: revokedAt,
    compromised_at: input.compromised ? revokedAt : getMetadataDate(current, "compromised_at"),
  });
}

export function getIntegrationOperationalView(
  integration: Integration | null | undefined
): IntegrationOperationalView {
  if (!integration) {
    return {
      integrationId: null,
      provider: null,
      isConfigured: false,
      isActive: false,
      status: "disconnected",
      tone: "slate",
      label: "Desconectado",
      summary: "Sin integracion configurada",
      detail: "Todavia no hay credenciales validadas para este proveedor.",
      lastAuthError: null,
      grantedScopes: [],
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      reauthRequiredAt: null,
      compromisedAt: null,
      revokedAt: null,
    };
  }

  const now = Date.now();
  const lastAuthError = getMetadataString(integration.metadata, "last_auth_error");
  const grantedScopes = getMetadataStringArray(integration.metadata, "granted_scopes");
  const accessTokenExpiresAt = getMetadataDate(integration.metadata, "access_token_expires_at");
  const refreshTokenExpiresAt = getMetadataDate(integration.metadata, "refresh_token_expires_at");
  const reauthRequiredAt = getMetadataDate(integration.metadata, "reauth_required_at");
  const compromisedAt = getMetadataDate(integration.metadata, "compromised_at");
  const revokedAt = getMetadataDate(integration.metadata, "revoked_at");
  const authStatus = getMetadataString(integration.metadata, "auth_status");

  let status: IntegrationOperationalStatus = "connected";
  let tone: IntegrationStatusTone = "emerald";
  let label = "Conectado";
  let summary = "Credenciales activas y listas para operar";
  let detail: string | null = null;

  if (integration.is_active === false || revokedAt || authStatus === "revoked") {
    status = "revoked";
    tone = "slate";
    label = "Revocado";
    summary = "La integracion fue desactivada";
    detail = "Debes reconectar este proveedor antes de volver a usarlo.";
  } else if (compromisedAt || authStatus === "compromised") {
    status = "compromised";
    tone = "rose";
    label = "Comprometido";
    summary = "Se detecto un incidente de seguridad";
    detail = "La integracion debe revocarse o reconectarse antes de continuar.";
  } else if (reauthRequiredAt || authStatus === "reauth_required") {
    status = "reauth_required";
    tone = "rose";
    label = "Reautenticacion requerida";
    summary = "Las credenciales ya no son validas";
    detail = "Reconecta la integracion para volver a operar sin errores silenciosos.";
  } else if (authStatus === "error") {
    status = "error";
    tone = "rose";
    label = "Con error";
    summary = "La ultima validacion del proveedor fallo";
    detail = lastAuthError ?? "Revisa la configuracion antes de seguir operando.";
  } else if (isExpiringSoon(accessTokenExpiresAt, now) || isExpiringSoon(refreshTokenExpiresAt, now)) {
    status = "expiring_soon";
    tone = "amber";
    label = "Expira pronto";
    summary = "La sesion del proveedor necesita atencion";
    detail = "Conviene refrescar o reautenticar antes de que impacte en los agentes.";
  }

  return {
    integrationId: integration.id,
    provider: integration.type,
    isConfigured: true,
    isActive: Boolean(integration.is_active),
    status,
    tone,
    label,
    summary,
    detail,
    lastAuthError,
    grantedScopes,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    reauthRequiredAt,
    compromisedAt,
    revokedAt,
  };
}

export function isIntegrationOperationalViewUsable(
  view: Pick<IntegrationOperationalView, "status">
): boolean {
  return view.status === "connected" || view.status === "expiring_soon";
}

export function isIntegrationUsable(
  integration: Integration | null | undefined
): boolean {
  const view = getIntegrationOperationalView(integration);
  return isIntegrationOperationalViewUsable(view);
}

export function getIntegrationUnavailableMessage(
  integration: Integration | null | undefined
): string {
  const view = getIntegrationOperationalView(integration);

  if (view.status === "revoked") {
    return "La integracion fue revocada y debe reconectarse antes de volver a usarla.";
  }

  if (view.status === "compromised") {
    return "La integracion esta marcada como comprometida y permanece bloqueada hasta reconectarla.";
  }

  if (view.status === "reauth_required") {
    return "La integracion necesita reautenticacion antes de volver a operar.";
  }

  if (view.status === "error") {
    return view.lastAuthError ?? "La integracion tiene un error operativo y no se puede usar ahora.";
  }

  return "La integracion no esta disponible en este momento.";
}


