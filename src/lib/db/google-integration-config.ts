import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  getCredentialValue,
  getJsonNumberValue,
} from "@/lib/db/google-integrations-shared";
import {
  getGoogleCalendarTimezoneMetadata,
  getMetadataString,
  getMetadataStringArray,
} from "@/lib/integrations/metadata";
import { decryptSecret, encryptSecret } from "@/lib/utils/secrets";
import type { Integration } from "@/types/app";

type DbResult<T> = { data: T | null; error: string | null };

export type GoogleIntegrationConfig = {
  integration: Integration;
  accessToken: string;
  refreshToken: string | null;
  grantedScopes: string[];
  connectedEmail: string | null;
  tokenGeneration: number;
  accessTokenExpiresAt: string | null;
  authStatus: string | null;
  googleCalendarPrimaryTimezone: string | null;
  googleCalendarUserTimezone: string | null;
  googleCalendarDetectedTimezone: string | null;
};

export type GoogleRefreshState = {
  tokenGeneration: number;
  authStatus: string | null;
};

export async function rotateGoogleTokens(input: {
  integrationId: string;
  organizationId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  grantedScopes: string[];
  accessTokenExpiresAt: string | null;
  connectedEmail?: string | null;
  workspaceCustomerId?: string | null;
  tokenType?: string | null;
  googleCalendarPrimaryTimezone?: string | null;
  googleCalendarUserTimezone?: string | null;
}): Promise<DbResult<Integration>> {
  const {
    buildConnectedIntegrationMetadata,
  } = await import("@/lib/integrations/metadata");
  const {
    getJsonStringValue,
    persistGoogleSecrets,
  } = await import("@/lib/db/google-integrations-shared");
  const serviceClient = createServiceSupabaseClient();
  const integrationResult = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .eq("type", "google")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error.message };
  }

  if (!integrationResult.data) {
    return { data: null, error: "Integracion Google no encontrada" };
  }

  const nextTokenGeneration =
    getJsonNumberValue(integrationResult.data.metadata, "token_generation") + 1;
  const lastRefreshedAt = new Date().toISOString();
  const metadata = buildConnectedIntegrationMetadata({
    current: integrationResult.data.metadata,
    grantedScopes: input.grantedScopes,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    providerMetadata: {
      provider: "google",
      token_type: input.tokenType ?? getJsonStringValue(integrationResult.data.metadata, "token_type"),
      token_generation: nextTokenGeneration,
      last_refreshed_at: lastRefreshedAt,
      connected_email:
        input.connectedEmail ??
        getJsonStringValue(integrationResult.data.metadata, "connected_email"),
      workspace_customer_id:
        input.workspaceCustomerId ??
        getJsonStringValue(integrationResult.data.metadata, "workspace_customer_id"),
      google_calendar_primary_timezone:
        input.googleCalendarPrimaryTimezone ??
        getJsonStringValue(
          integrationResult.data.metadata,
          "google_calendar_primary_timezone"
        ),
      google_calendar_user_timezone:
        input.googleCalendarUserTimezone ??
        getJsonStringValue(
          integrationResult.data.metadata,
          "google_calendar_user_timezone"
        ),
    },
  });

  const updateResult = await serviceClient
    .from("integrations")
    .update({
      is_active: true,
      metadata,
      last_used: lastRefreshedAt,
    })
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .single();

  if (updateResult.error) {
    return { data: null, error: updateResult.error.message };
  }

  const secretError = await persistGoogleSecrets({
    integrationId: input.integrationId,
    organizationId: input.organizationId,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    ...(input.refreshToken !== undefined
      ? {
          refreshTokenEncrypted: input.refreshToken
            ? encryptSecret(input.refreshToken)
            : null,
        }
      : {}),
  });

  if (secretError) {
    return { data: null, error: secretError };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: input.integrationId,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: "google_access_token_refreshed",
  });

  return { data: updateResult.data, error: null };
}

export async function getGoogleIntegrationConfig(
  integrationId: string,
  organizationId: string
): Promise<DbResult<GoogleIntegrationConfig>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "google")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  if (!integration) {
    return { data: null, error: "Integracion Google no encontrada" };
  }

  const { data: secretData, error: secretError } = await serviceClient
    .from("integration_secrets")
    .select("credentials")
    .eq("integration_id", integrationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (secretError) {
    return { data: null, error: secretError.message };
  }

  const encryptedAccessToken = getCredentialValue(
    secretData?.credentials ?? null,
    "access_token_encrypted"
  );

  if (!encryptedAccessToken) {
    return { data: null, error: "La integracion Google no tiene access token valido" };
  }

  try {
    const encryptedRefreshToken = getCredentialValue(
      secretData?.credentials ?? null,
      "refresh_token_encrypted"
    );
    const timezoneMetadata = getGoogleCalendarTimezoneMetadata(integration.metadata);

    return {
      data: {
        integration,
        accessToken: decryptSecret(encryptedAccessToken),
        refreshToken: encryptedRefreshToken ? decryptSecret(encryptedRefreshToken) : null,
        grantedScopes: getMetadataStringArray(integration.metadata, "granted_scopes"),
        connectedEmail: getMetadataString(integration.metadata, "connected_email"),
        tokenGeneration: getJsonNumberValue(integration.metadata, "token_generation"),
        accessTokenExpiresAt: getMetadataString(integration.metadata, "access_token_expires_at"),
        authStatus: getMetadataString(integration.metadata, "auth_status"),
        googleCalendarPrimaryTimezone: timezoneMetadata.primaryTimezone,
        googleCalendarUserTimezone: timezoneMetadata.userTimezone,
        googleCalendarDetectedTimezone: timezoneMetadata.detectedTimezone,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo leer la configuracion de Google",
    };
  }
}

export async function getGoogleRefreshState(
  integrationId: string,
  organizationId: string
): Promise<DbResult<GoogleRefreshState>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .select("metadata")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "google")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      tokenGeneration: getJsonNumberValue(data?.metadata, "token_generation"),
      authStatus: getMetadataString(data?.metadata, "auth_status"),
    },
    error: null,
  };
}
