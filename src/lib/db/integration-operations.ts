import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  buildErroredIntegrationMetadata,
  buildReauthRequiredIntegrationMetadata,
  buildRevokedIntegrationMetadata,
  mergeIntegrationMetadata,
} from "@/lib/integrations/metadata";
import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type ListIntegrationsOptions = {
  includeInactive?: boolean;
  includeDeleted?: boolean;
  useServiceRole?: boolean;
};

export type RevokedIntegrationResult = {
  integration: Integration;
  disabledToolsCount: number;
  disconnectedConnectionsCount: number;
};

function mergeJson(
  current: Json | null | undefined,
  patch: Record<string, Json | undefined>
): Json {
  return mergeIntegrationMetadata(current, patch);
}

export async function listIntegrationsByOrganization(
  organizationId: string,
  options: ListIntegrationsOptions = {}
): Promise<DbResult<Integration[]>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();

  let query = supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (!options.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function listAllIntegrationsForHealth(): Promise<DbResult<Integration[]>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getLatestIntegrationByType(
  integrationType: string,
  organizationId: string
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", integrationType)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getIntegrationById(
  integrationId: string,
  organizationId: string
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
export async function updateIntegrationMetadata(
  integrationId: string,
  organizationId: string,
  metadata: Json
): Promise<DbResult<Integration>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integrations")
    .update({ metadata })
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function markIntegrationReauthRequired(
  integrationId: string,
  organizationId: string,
  reason: string
): Promise<void> {
  const serviceClient = createServiceSupabaseClient();
  const { data } = await serviceClient
    .from("integrations")
    .select("metadata")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const metadata = buildReauthRequiredIntegrationMetadata(data?.metadata ?? null, reason);
  await updateIntegrationMetadata(integrationId, organizationId, metadata);
}

export async function markIntegrationOperationalError(
  integrationId: string,
  organizationId: string,
  reason: string
): Promise<void> {
  const serviceClient = createServiceSupabaseClient();
  const { data } = await serviceClient
    .from("integrations")
    .select("metadata")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const metadata = buildErroredIntegrationMetadata(data?.metadata ?? null, reason);
  await updateIntegrationMetadata(integrationId, organizationId, metadata);
}

export async function hasIntegrationSecrets(
  integrationId: string,
  organizationId: string
): Promise<DbResult<boolean>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("integration_secrets")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []).length > 0, error: null };
}

export async function revokeIntegration(input: {
  integrationId: string;
  organizationId: string;
  userId: string;
  reason: string;
  compromised: boolean;
}): Promise<DbResult<RevokedIntegrationResult>> {
  const serviceClient = createServiceSupabaseClient();
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (integrationError) {
    return { data: null, error: integrationError.message };
  }

  if (!integration) {
    return { data: null, error: null };
  }

  const metadata = buildRevokedIntegrationMetadata(integration.metadata, {
    reason: input.reason,
    compromised: input.compromised,
  });

  const integrationUpdate = await serviceClient
    .from("integrations")
    .update({
      is_active: false,
      metadata,
      last_used: new Date().toISOString(),
    })
    .eq("id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .single();

  if (integrationUpdate.error || !integrationUpdate.data) {
    return { data: null, error: integrationUpdate.error?.message ?? "No se pudo revocar la integracion" };
  }

  const secretsDelete = await serviceClient
    .from("integration_secrets")
    .delete()
    .eq("integration_id", input.integrationId)
    .eq("organization_id", input.organizationId);

  if (secretsDelete.error) {
    return { data: null, error: secretsDelete.error.message };
  }

  const disconnectedAt = new Date().toISOString();
  const connectionsResult = await serviceClient
    .from("agent_connections")
    .select("id, metadata")
    .eq("integration_id", input.integrationId)
    .eq("organization_id", input.organizationId);

  if (connectionsResult.error) {
    return { data: null, error: connectionsResult.error.message };
  }

  let disconnectedConnectionsCount = 0;
  for (const connection of connectionsResult.data ?? []) {
    const updateResult = await serviceClient
      .from("agent_connections")
      .update({
        sync_status: "disconnected",
        last_sync_error: "integration_revoked",
        last_synced_at: disconnectedAt,
        metadata: mergeJson(connection.metadata, {
          integration_revoked_at: disconnectedAt,
          reauth_required_at: disconnectedAt,
        }),
      })
      .eq("id", connection.id)
      .eq("organization_id", input.organizationId);

    if (!updateResult.error) {
      disconnectedConnectionsCount += 1;
    }
  }

  const toolsUpdate = await serviceClient
    .from("agent_tools")
    .update({ is_enabled: false })
    .eq("integration_id", input.integrationId)
    .eq("organization_id", input.organizationId)
    .select("id");

  if (toolsUpdate.error) {
    return { data: null, error: toolsUpdate.error.message };
  }

  await serviceClient.from("integration_credentials_history").insert({
    integration_id: input.integrationId,
    organization_id: input.organizationId,
    changed_by: input.userId,
    change_reason: input.compromised ? "integration_revoked_compromised" : "integration_revoked",
  });

  return {
    data: {
      integration: integrationUpdate.data,
      disabledToolsCount: toolsUpdate.data?.length ?? 0,
      disconnectedConnectionsCount,
    },
    error: null,
  };
}

