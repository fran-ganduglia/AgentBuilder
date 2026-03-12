import "server-only";

import { decryptSecret } from "@/lib/utils/secrets";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type UpsertWhatsAppIntegrationInput = {
  organizationId: string;
  name: string;
  accessTokenEncrypted: string;
  appSecretEncrypted: string;
  verifyTokenEncrypted: string;
  wabaId: string;
  userId: string;
  metadata?: Json;
};

export type WhatsAppIntegrationConfig = {
  integration: Integration;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  wabaId: string;
};

type IntegrationSecretRow = {
  integration_id: string;
  organization_id: string;
  credentials: Json;
};

function getJsonStringValue(metadata: Json | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "string" ? value : null;
}

function readEncryptedCredential(credentials: Json, key: string): string | null {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    return null;
  }

  const value = Reflect.get(credentials, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function decryptCredential(credentials: Json, key: string, label: string): string {
  const encryptedValue = readEncryptedCredential(credentials, key);

  if (!encryptedValue) {
    throw new Error(`La integracion no tiene ${label} valido`);
  }

  return decryptSecret(encryptedValue);
}

export async function listWhatsAppIntegrations(
  organizationId: string
): Promise<DbResult<Integration[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getWhatsAppIntegrationById(
  integrationId: string,
  organizationId: string
): Promise<DbResult<Integration>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getPrimaryWhatsAppIntegration(
  organizationId: string
): Promise<DbResult<Integration>> {
  const integrations = await listWhatsAppIntegrations(organizationId);

  if (integrations.error || !integrations.data) {
    return { data: null, error: integrations.error };
  }

  return { data: integrations.data[0] ?? null, error: null };
}

export async function upsertWhatsAppIntegration(
  input: UpsertWhatsAppIntegrationInput
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const existingResult = await serviceClient
    .from("integrations")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    return { data: null, error: existingResult.error.message };
  }

  const metadata = {
    ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {}),
    waba_id: input.wabaId,
  } as Json;

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
        type: "whatsapp",
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
    access_token_encrypted: input.accessTokenEncrypted,
    app_secret_encrypted: input.appSecretEncrypted,
    verify_token_encrypted: input.verifyTokenEncrypted,
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
    change_reason: existingResult.data ? "whatsapp_credentials_rotated" : "whatsapp_connected",
  });

  return { data: integration, error: null };
}

export async function getWhatsAppIntegrationConfig(
  integrationId: string,
  organizationId: string
): Promise<DbResult<WhatsAppIntegrationConfig>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integrationData, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  if (!integrationData) {
    return { data: null, error: "Integracion WhatsApp no encontrada" };
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

  const wabaId = getJsonStringValue(integrationData.metadata, "waba_id");
  if (!wabaId) {
    return { data: null, error: "La integracion WhatsApp no tiene WABA ID configurado" };
  }

  try {
    return {
      data: {
        integration: integrationData,
        accessToken: decryptCredential(secretData?.credentials ?? null, "access_token_encrypted", "access token"),
        appSecret: decryptCredential(secretData?.credentials ?? null, "app_secret_encrypted", "app secret"),
        verifyToken: decryptCredential(secretData?.credentials ?? null, "verify_token_encrypted", "verify token"),
        wabaId,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "No se pudo leer la configuracion de WhatsApp",
    };
  }
}

export async function findWhatsAppIntegrationByVerifyToken(
  verifyToken: string
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integrations, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .eq("is_active", true);

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  const integrationRows = integrations ?? [];
  if (integrationRows.length === 0) {
    return { data: null, error: null };
  }

  const { data: secrets, error: secretError } = await serviceClient
    .from("integration_secrets")
    .select("integration_id, organization_id, credentials")
    .in(
      "integration_id",
      integrationRows.map((integration) => integration.id)
    );

  if (secretError) {
    return { data: null, error: secretError.message };
  }

  const secretByIntegrationId = new Map(
    ((secrets ?? []) as IntegrationSecretRow[]).map((secret) => [secret.integration_id, secret])
  );

  for (const integration of integrationRows) {
    const secret = secretByIntegrationId.get(integration.id);
    if (!secret) {
      continue;
    }

    try {
      const candidate = decryptCredential(secret.credentials, "verify_token_encrypted", "verify token");
      if (candidate === verifyToken) {
        return { data: integration, error: null };
      }
    } catch {
      continue;
    }
  }

  return { data: null, error: null };
}
