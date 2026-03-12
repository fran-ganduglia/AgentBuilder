import "server-only";

import { decryptSecret } from "@/lib/utils/secrets";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type UpsertOpenAIIntegrationInput = {
  organizationId: string;
  name: string;
  encryptedApiKey: string;
  userId: string;
  metadata?: Json;
};

export async function listOpenAIIntegrations(
  organizationId: string
): Promise<DbResult<Integration[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "openai")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getOpenAIIntegrationById(
  integrationId: string,
  organizationId: string
): Promise<DbResult<Integration>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "openai")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getPrimaryOpenAIIntegration(
  organizationId: string
): Promise<DbResult<Integration>> {
  const integrations = await listOpenAIIntegrations(organizationId);

  if (integrations.error || !integrations.data) {
    return { data: null, error: integrations.error };
  }

  return { data: integrations.data[0] ?? null, error: null };
}

export async function upsertOpenAIIntegration(
  input: UpsertOpenAIIntegrationInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const existingResult = await serviceClient
    .from("integrations")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("type", "openai")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    return { data: null, error: existingResult.error.message };
  }

  const metadata = (input.metadata ?? {}) as Json;

  let integration: Integration | null = null;

  if (existingResult.data) {
    const updateResult = await serviceClient
      .from("integrations")
      .update({
        name: input.name,
        is_active: true,
        metadata,
      })
      .eq("id", existingResult.data.id)
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
        type: "openai",
        name: input.name,
        is_active: true,
        metadata,
      })
      .select("*")
      .single();

    if (insertResult.error) {
      return { data: null, error: insertResult.error.message };
    }

    integration = insertResult.data;
  }

  const credentialsResult = await serviceClient
    .from("integration_secrets")
    .select("id")
    .eq("integration_id", integration.id)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (credentialsResult.error) {
    return { data: null, error: credentialsResult.error.message };
  }

  const credentials = {
    api_key_encrypted: input.encryptedApiKey,
  } satisfies Record<string, string>;

  if (credentialsResult.data) {
    const updateSecretResult = await serviceClient
      .from("integration_secrets")
      .update({ credentials })
      .eq("id", credentialsResult.data.id)
      .eq("organization_id", input.organizationId);

    if (updateSecretResult.error) {
      return { data: null, error: updateSecretResult.error.message };
    }
  } else {
    const insertSecretResult = await serviceClient
      .from("integration_secrets")
      .insert({
        integration_id: integration.id,
        organization_id: input.organizationId,
        credentials,
      });

    if (insertSecretResult.error) {
      return { data: null, error: insertSecretResult.error.message };
    }
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: integration.id,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: existingResult.data ? "openai_credentials_rotated" : "openai_connected",
  });

  return { data: integration, error: null };
}

export async function getOpenAIIntegrationApiKey(
  integrationId: string,
  organizationId: string
): Promise<DbResult<string>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integration_secrets")
    .select("credentials")
    .eq("integration_id", integrationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  const encryptedApiKey = data?.credentials && typeof data.credentials === "object"
    ? Reflect.get(data.credentials, "api_key_encrypted")
    : null;

  if (typeof encryptedApiKey !== "string" || encryptedApiKey.length === 0) {
    return { data: null, error: "La integracion no tiene una API key valida" };
  }

  try {
    return { data: decryptSecret(encryptedApiKey), error: null };
  } catch (decryptError) {
    return {
      data: null,
      error: decryptError instanceof Error ? decryptError.message : "No se pudo descifrar la API key",
    };
  }
}
