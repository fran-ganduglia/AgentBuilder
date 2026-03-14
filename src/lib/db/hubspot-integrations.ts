import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  buildConnectedIntegrationMetadata,
  getMetadataString,
  getMetadataStringArray,
} from "@/lib/integrations/metadata";
import { selectMostRecentByCreatedAt } from "@/lib/integrations/salesforce-selection";
import { decryptSecret, encryptSecret } from "@/lib/utils/secrets";
import type { Integration } from "@/types/app";
import type { Database, Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type DatabaseClient = SupabaseClient<Database>;

type UpsertHubSpotIntegrationInput = {
  organizationId: string;
  userId: string;
  name: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  metadata: Json;
};

type RotateHubSpotTokensInput = {
  integrationId: string;
  organizationId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  grantedScopes: string[];
  accessTokenExpiresAt: string | null;
  hubId: string | null;
  tokenType: string | null;
};

export type HubSpotIntegrationConfig = {
  integration: Integration;
  accessToken: string;
  refreshToken: string | null;
  grantedScopes: string[];
  hubId: string | null;
  tokenGeneration: number;
  accessTokenExpiresAt: string | null;
  authStatus: string | null;
};

export type HubSpotRefreshState = {
  tokenGeneration: number;
  authStatus: string | null;
};

function getCredentialValue(credentials: Json | null | undefined, key: string): string | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const value = Reflect.get(credentials, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getMetadataNumber(metadata: Json | null | undefined, key: string): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return 0;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function persistHubSpotSecrets(input: {
  integrationId: string;
  organizationId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
}): Promise<string | null> {
  const serviceClient = createServiceSupabaseClient();
  const secretResult = await serviceClient
    .from("integration_secrets")
    .select("id, credentials")
    .eq("integration_id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (secretResult.error) {
    return secretResult.error.message;
  }

  const credentials = {
    ...(secretResult.data?.credentials && typeof secretResult.data.credentials === "object" && !Array.isArray(secretResult.data.credentials)
      ? secretResult.data.credentials
      : {}),
    access_token_encrypted: input.accessTokenEncrypted,
    refresh_token_encrypted: input.refreshTokenEncrypted,
  } as Json;

  if (secretResult.data?.id) {
    const updateResult = await serviceClient
      .from("integration_secrets")
      .update({ credentials })
      .eq("id", secretResult.data.id)
      .eq("organization_id", input.organizationId);

    return updateResult.error?.message ?? null;
  }

  const insertResult = await serviceClient
    .from("integration_secrets")
    .insert({
      integration_id: input.integrationId,
      organization_id: input.organizationId,
      credentials,
    });

  return insertResult.error?.message ?? null;
}

async function listHubSpotIntegrationsForOrganization(
  client: DatabaseClient,
  organizationId: string
): Promise<DbResult<Integration[]>> {
  const { data, error } = await client
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "hubspot")
    .is("deleted_at", null);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getPrimaryHubSpotIntegration(
  organizationId: string
): Promise<DbResult<Integration>> {
  const supabase = await createServerSupabaseClient();
  const integrationsResult = await listHubSpotIntegrationsForOrganization(
    supabase,
    organizationId
  );

  if (integrationsResult.error || !integrationsResult.data) {
    return { data: null, error: integrationsResult.error };
  }

  return {
    data: selectMostRecentByCreatedAt(integrationsResult.data),
    error: null,
  };
}

export async function upsertHubSpotIntegration(
  input: UpsertHubSpotIntegrationInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const existingResult = await listHubSpotIntegrationsForOrganization(
    serviceClient,
    input.organizationId
  );

  if (existingResult.error || !existingResult.data) {
    return { data: null, error: existingResult.error };
  }

  const canonicalIntegration = selectMostRecentByCreatedAt(existingResult.data);
  let integration: Integration | null = null;

  if (canonicalIntegration) {
    const updateResult = await serviceClient
      .from("integrations")
      .update({
        name: input.name,
        is_active: true,
        metadata: input.metadata,
        last_used: new Date().toISOString(),
      })
      .eq("id", canonicalIntegration.id)
      .eq("organization_id", input.organizationId)
      .select("*")
      .single();

    if (updateResult.error) {
      return { data: null, error: updateResult.error.message };
    }

    integration = updateResult.data;
  } else {
    const insertResult = await serviceClient
      .from("integrations")
      .insert({
        organization_id: input.organizationId,
        type: "hubspot",
        name: input.name,
        is_active: true,
        metadata: input.metadata,
      })
      .select("*")
      .single();

    if (insertResult.error) {
      return { data: null, error: insertResult.error.message };
    }

    integration = insertResult.data;
  }

  const secretError = await persistHubSpotSecrets({
    integrationId: integration.id,
    organizationId: input.organizationId,
    accessTokenEncrypted: input.accessTokenEncrypted,
    refreshTokenEncrypted: input.refreshTokenEncrypted,
  });

  if (secretError) {
    return { data: null, error: secretError };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: integration.id,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: canonicalIntegration ? "hubspot_credentials_rotated" : "hubspot_connected",
  });

  return { data: integration, error: null };
}

export async function rotateHubSpotTokens(
  input: RotateHubSpotTokensInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const integrationResult = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .eq("type", "hubspot")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error.message };
  }

  if (!integrationResult.data) {
    return { data: null, error: "Integracion HubSpot no encontrada" };
  }

  const nextTokenGeneration =
    getMetadataNumber(integrationResult.data.metadata, "token_generation") + 1;
  const lastRefreshedAt = new Date().toISOString();
  const metadata = buildConnectedIntegrationMetadata({
    current: integrationResult.data.metadata,
    grantedScopes: input.grantedScopes,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    providerMetadata: {
      provider: "hubspot",
      hub_id: input.hubId,
      token_type: input.tokenType,
      token_generation: nextTokenGeneration,
      last_refreshed_at: lastRefreshedAt,
      reauth_required_at: null,
      revoked_at: null,
      last_auth_error: null,
    },
  });

  const updateIntegrationResult = await serviceClient
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

  if (updateIntegrationResult.error) {
    return { data: null, error: updateIntegrationResult.error.message };
  }

  const secretError = await persistHubSpotSecrets({
    integrationId: input.integrationId,
    organizationId: input.organizationId,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    refreshTokenEncrypted: encryptSecret(input.refreshToken),
  });

  if (secretError) {
    return { data: null, error: secretError };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: input.integrationId,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: "hubspot_access_token_refreshed",
  });

  return { data: updateIntegrationResult.data, error: null };
}

export async function getHubSpotIntegrationConfig(
  integrationId: string,
  organizationId: string
): Promise<DbResult<HubSpotIntegrationConfig>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "hubspot")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  if (!integration) {
    return { data: null, error: "Integracion HubSpot no encontrada" };
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
    return { data: null, error: "La integracion HubSpot no tiene access token valido" };
  }

  try {
    const encryptedRefreshToken = getCredentialValue(
      secretData?.credentials ?? null,
      "refresh_token_encrypted"
    );

    return {
      data: {
        integration,
        accessToken: decryptSecret(encryptedAccessToken),
        refreshToken: encryptedRefreshToken ? decryptSecret(encryptedRefreshToken) : null,
        grantedScopes: getMetadataStringArray(integration.metadata, "granted_scopes"),
        hubId: getMetadataString(integration.metadata, "hub_id"),
        tokenGeneration: getMetadataNumber(integration.metadata, "token_generation"),
        accessTokenExpiresAt: getMetadataString(integration.metadata, "access_token_expires_at"),
        authStatus: getMetadataString(integration.metadata, "auth_status"),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "No se pudo leer la configuracion de HubSpot",
    };
  }
}

export async function getHubSpotRefreshState(
  integrationId: string,
  organizationId: string
): Promise<DbResult<HubSpotRefreshState>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .select("metadata")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "hubspot")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      tokenGeneration: getMetadataNumber(data?.metadata, "token_generation"),
      authStatus: getMetadataString(data?.metadata, "auth_status"),
    },
    error: null,
  };
}
