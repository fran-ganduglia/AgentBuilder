import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Integration } from "@/types/app";
import type { Database, Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export type DatabaseClient = SupabaseClient<Database>;

export function getJsonStringValue(
  metadata: Json | null | undefined,
  key: string
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getJsonNumberValue(
  metadata: Json | null | undefined,
  key: string
): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return 0;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getCredentialValue(
  credentials: Json | null | undefined,
  key: string
): string | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const value = Reflect.get(credentials, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function listGoogleIntegrationsForOrganization(
  client: DatabaseClient,
  organizationId: string
): Promise<DbResult<Integration[]>> {
  const { data, error } = await client
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "google")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function persistGoogleSecrets(input: {
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
    ...(secretResult.data?.credentials &&
    typeof secretResult.data.credentials === "object" &&
    !Array.isArray(secretResult.data.credentials)
      ? secretResult.data.credentials
      : {}),
    access_token_encrypted: input.accessTokenEncrypted,
    ...(input.refreshTokenEncrypted !== undefined
      ? { refresh_token_encrypted: input.refreshTokenEncrypted }
      : {}),
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

