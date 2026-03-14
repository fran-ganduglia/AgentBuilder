import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  listGoogleIntegrationsForOrganization,
  persistGoogleSecrets,
} from "@/lib/db/google-integrations-shared";
import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type UpsertGoogleIntegrationInput = {
  organizationId: string;
  userId: string;
  name: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string | null;
  metadata: Json;
};

export async function getPrimaryGoogleIntegration(
  organizationId: string
): Promise<DbResult<Integration>> {
  const supabase = await createServerSupabaseClient();
  const integrationsResult = await listGoogleIntegrationsForOrganization(
    supabase,
    organizationId
  );

  if (integrationsResult.error || !integrationsResult.data) {
    return { data: null, error: integrationsResult.error };
  }

  return { data: integrationsResult.data[0] ?? null, error: null };
}

export async function getPrimaryGoogleIntegrationWithServiceRole(
  organizationId: string
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const integrationsResult = await listGoogleIntegrationsForOrganization(
    serviceClient,
    organizationId
  );

  if (integrationsResult.error || !integrationsResult.data) {
    return { data: null, error: integrationsResult.error };
  }

  return { data: integrationsResult.data[0] ?? null, error: null };
}

export async function upsertGoogleIntegration(
  input: UpsertGoogleIntegrationInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const existingResult = await listGoogleIntegrationsForOrganization(
    serviceClient,
    input.organizationId
  );

  if (existingResult.error || !existingResult.data) {
    return { data: null, error: existingResult.error };
  }

  const canonicalIntegration = existingResult.data[0] ?? null;
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
        type: "google",
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

  const secretError = await persistGoogleSecrets({
    integrationId: integration.id,
    organizationId: input.organizationId,
    accessTokenEncrypted: input.accessTokenEncrypted,
    ...(input.refreshTokenEncrypted !== undefined
      ? { refreshTokenEncrypted: input.refreshTokenEncrypted }
      : {}),
  });

  if (secretError) {
    return { data: null, error: secretError };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: integration.id,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: canonicalIntegration ? "google_credentials_rotated" : "google_connected",
  });

  return { data: integration, error: null };
}
