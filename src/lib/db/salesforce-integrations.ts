import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { buildConnectedIntegrationMetadata, getMetadataStringArray } from "@/lib/integrations/metadata";
import { selectMostRecentByCreatedAt } from "@/lib/integrations/salesforce-selection";
import { decryptSecret, encryptSecret } from "@/lib/utils/secrets";
import type { Integration } from "@/types/app";
import type { Database, Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type UpsertSalesforceIntegrationInput = {
  organizationId: string;
  userId: string;
  name: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  metadata: Json;
};

type RotateSalesforceTokensInput = {
  integrationId: string;
  organizationId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  instanceUrl?: string | null;
  grantedScopes?: string[];
  identityUrl?: string | null;
  tokenType?: string | null;
  issuedAt?: string | null;
};

export type SalesforceIntegrationConfig = {
  integration: Integration;
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
  grantedScopes: string[];
};

type DatabaseClient = SupabaseClient<Database>;

function getJsonStringValue(metadata: Json | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getCredentialValue(credentials: Json | null | undefined, key: string): string | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const value = Reflect.get(credentials, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function persistSalesforceSecrets(input: {
  integrationId: string;
  organizationId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string | null;
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
    ...(input.refreshTokenEncrypted !== undefined
      ? { refresh_token_encrypted: input.refreshTokenEncrypted }
      : {}),
  } as Json;

  if (secretResult.data?.id) {
    const updateSecretResult = await serviceClient
      .from("integration_secrets")
      .update({ credentials })
      .eq("id", secretResult.data.id)
      .eq("organization_id", input.organizationId);

    return updateSecretResult.error?.message ?? null;
  }

  const insertSecretResult = await serviceClient
    .from("integration_secrets")
    .insert({
      integration_id: input.integrationId,
      organization_id: input.organizationId,
      credentials,
    });

  return insertSecretResult.error?.message ?? null;
}

async function listSalesforceIntegrationsForOrganization(
  client: DatabaseClient,
  organizationId: string
): Promise<DbResult<Integration[]>> {
  const { data, error } = await client
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "salesforce")
    .is("deleted_at", null);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getPrimarySalesforceIntegration(
  organizationId: string
): Promise<DbResult<Integration>> {
  const supabase = await createServerSupabaseClient();
  const integrationsResult = await listSalesforceIntegrationsForOrganization(
    supabase,
    organizationId
  );

  if (integrationsResult.error || !integrationsResult.data) {
    return { data: null, error: integrationsResult.error };
  }

  return { data: selectMostRecentByCreatedAt(integrationsResult.data), error: null };
}

export async function upsertSalesforceIntegration(
  input: UpsertSalesforceIntegrationInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const existingResult = await listSalesforceIntegrationsForOrganization(
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
        type: "salesforce",
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

  const secretError = await persistSalesforceSecrets({
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
    change_reason: canonicalIntegration ? "salesforce_credentials_rotated" : "salesforce_connected",
  });

  return { data: integration, error: null };
}

export async function rotateSalesforceTokens(
  input: RotateSalesforceTokensInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const integrationResult = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .eq("type", "salesforce")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationResult.error) {
    return { data: null, error: integrationResult.error.message };
  }

  if (!integrationResult.data) {
    return { data: null, error: "Integracion Salesforce no encontrada" };
  }

  const metadata = buildConnectedIntegrationMetadata({
    current: integrationResult.data.metadata,
    grantedScopes: input.grantedScopes && input.grantedScopes.length > 0
      ? input.grantedScopes
      : getMetadataStringArray(integrationResult.data.metadata, "granted_scopes"),
    providerMetadata: {
      instance_url: input.instanceUrl ?? getJsonStringValue(integrationResult.data.metadata, "instance_url"),
      identity_url: input.identityUrl ?? getJsonStringValue(integrationResult.data.metadata, "identity_url"),
      token_type: input.tokenType ?? getJsonStringValue(integrationResult.data.metadata, "token_type"),
      issued_at: input.issuedAt ?? getJsonStringValue(integrationResult.data.metadata, "issued_at"),
    },
  });

  const updateIntegrationResult = await serviceClient
    .from("integrations")
    .update({
      is_active: true,
      metadata,
      last_used: new Date().toISOString(),
    })
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .single();

  if (updateIntegrationResult.error) {
    return { data: null, error: updateIntegrationResult.error.message };
  }

  const secretError = await persistSalesforceSecrets({
    integrationId: input.integrationId,
    organizationId: input.organizationId,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    ...(input.refreshToken !== undefined
      ? { refreshTokenEncrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null }
      : {}),
  });

  if (secretError) {
    return { data: null, error: secretError };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: input.integrationId,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: "salesforce_access_token_refreshed",
  });

  return { data: updateIntegrationResult.data, error: null };
}

export async function getSalesforceIntegrationConfig(
  integrationId: string,
  organizationId: string
): Promise<DbResult<SalesforceIntegrationConfig>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "salesforce")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  if (!integration) {
    return { data: null, error: "Integracion Salesforce no encontrada" };
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

  const instanceUrl = getJsonStringValue(integration.metadata, "instance_url");
  if (!instanceUrl) {
    return { data: null, error: "La integracion Salesforce no tiene instance_url configurado" };
  }

  const encryptedAccessToken = getCredentialValue(secretData?.credentials ?? null, "access_token_encrypted");
  if (!encryptedAccessToken) {
    return { data: null, error: "La integracion Salesforce no tiene access token valido" };
  }

  try {
    return {
      data: {
        integration,
        accessToken: decryptSecret(encryptedAccessToken),
        refreshToken: (() => {
          const encryptedRefreshToken = getCredentialValue(secretData?.credentials ?? null, "refresh_token_encrypted");
          return encryptedRefreshToken ? decryptSecret(encryptedRefreshToken) : null;
        })(),
        instanceUrl,
        grantedScopes: getMetadataStringArray(integration.metadata, "granted_scopes"),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "No se pudo leer la configuracion de Salesforce",
    };
  }
}






