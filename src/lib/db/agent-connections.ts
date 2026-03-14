import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { AgentConnection } from "@/types/app";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentConnectionInsert = TablesInsert<"agent_connections">;
type AgentConnectionUpdate = TablesUpdate<"agent_connections">;

type AgentConnectionIdRow = Pick<AgentConnection, "agent_id">;
export type AgentConnectionSummaryRow = Pick<AgentConnection, "agent_id" | "provider_type">;

type TimestampedProviderRow = {
  provider_type: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type AgentConnectionSummaryQueryRow = AgentConnectionSummaryRow & {
  created_at: string | null;
  updated_at: string | null;
};

function getProviderPriority(providerType: string): number {
  if (providerType === "whatsapp") {
    return 2;
  }

  if (providerType === "openai") {
    return 1;
  }

  return 0;
}

function getConnectionTimestamp(row: Pick<TimestampedProviderRow, "created_at" | "updated_at">): number {
  const timestamp = row.updated_at ?? row.created_at;
  return timestamp ? new Date(timestamp).getTime() : 0;
}

function pickPreferredConnection<T extends TimestampedProviderRow>(
  rows: T[],
  context: string
): T | null {
  if (rows.length === 0) {
    return null;
  }

  const preferred = [...rows].sort((left, right) => {
    const providerPriority = getProviderPriority(right.provider_type) - getProviderPriority(left.provider_type);
    if (providerPriority !== 0) {
      return providerPriority;
    }

    return getConnectionTimestamp(right) - getConnectionTimestamp(left);
  })[0] ?? null;

  if (rows.length > 1) {
    console.warn("agent_connections.multiple_rows_detected", {
      context,
      providerTypes: rows.map((row) => row.provider_type),
    });
  }

  return preferred;
}

function groupPreferredSummaries(rows: AgentConnectionSummaryQueryRow[]): AgentConnectionSummaryRow[] {
  const rowsByAgentId = new Map<string, AgentConnectionSummaryQueryRow[]>();

  for (const row of rows) {
    const existing = rowsByAgentId.get(row.agent_id) ?? [];
    existing.push(row);
    rowsByAgentId.set(row.agent_id, existing);
  }

  const summaries: AgentConnectionSummaryRow[] = [];

  for (const [agentId, agentRows] of rowsByAgentId.entries()) {
    const preferred = pickPreferredConnection(agentRows, `list:${agentId}`);
    if (!preferred) {
      continue;
    }

    summaries.push({
      agent_id: agentId,
      provider_type: preferred.provider_type,
    });
  }

  return summaries;
}

export async function listAgentConnections(
  organizationId: string
): Promise<DbResult<AgentConnection[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function listAgentConnectionSummaries(
  organizationId: string
): Promise<DbResult<AgentConnectionSummaryRow[]>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("agent_id, provider_type, created_at, updated_at")
    .eq("organization_id", organizationId);

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = (data ?? []) as AgentConnectionSummaryQueryRow[];
  return { data: groupPreferredSummaries(rows), error: null };
}

export async function listConnectedAgentIds(
  organizationId: string
): Promise<DbResult<string[]>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("agent_id")
    .eq("organization_id", organizationId);

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: [...new Set(((data ?? []) as AgentConnectionIdRow[]).map((connection) => connection.agent_id))],
    error: null,
  };
}

export async function hasAgentConnection(
  agentId: string,
  organizationId: string
): Promise<DbResult<boolean>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("id")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []).length > 0, error: null };
}

export async function getAgentConnectionSummaryByAgentId(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentConnectionSummaryRow>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("agent_id, provider_type, created_at, updated_at")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId);

  if (error) {
    return { data: null, error: error.message };
  }

  const preferred = pickPreferredConnection(
    (data ?? []) as AgentConnectionSummaryQueryRow[],
    `summary:${agentId}`
  );

  if (!preferred) {
    return { data: null, error: null };
  }

  return {
    data: {
      agent_id: preferred.agent_id,
      provider_type: preferred.provider_type,
    },
    error: null,
  };
}

export async function getAgentConnectionByAgentId(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentConnection>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_connections")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId);

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: pickPreferredConnection((data ?? []) as AgentConnection[], `server:${agentId}`),
    error: null,
  };
}

export async function getServiceRoleAgentConnectionByAgentId(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId);

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: pickPreferredConnection((data ?? []) as AgentConnection[], `service:${agentId}`),
    error: null,
  };
}

export async function createAgentConnection(
  input: AgentConnectionInsert
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getAgentConnectionByIdWithServiceRole(
  connectionId: string,
  organizationId: string
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getAgentConnectionByProviderAgentId(
  integrationId: string,
  organizationId: string,
  providerAgentId: string
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("*")
    .eq("integration_id", integrationId)
    .eq("organization_id", organizationId)
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getAgentConnectionByProviderTypeAndAgentId(
  providerType: string,
  providerAgentId: string,
  organizationId: string
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("*")
    .eq("provider_type", providerType)
    .eq("provider_agent_id", providerAgentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getAgentConnectionByProviderTypeAndAgentIdAcrossOrganizations(
  providerType: string,
  providerAgentId: string
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .select("*")
    .eq("provider_type", providerType)
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateAgentConnection(
  connectionId: string,
  organizationId: string,
  input: AgentConnectionUpdate
): Promise<DbResult<AgentConnection>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_connections")
    .update(input)
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function markAgentConnectionSynced(
  connectionId: string,
  organizationId: string,
  remoteUpdatedAt: string | null,
  metadata?: Json
): Promise<void> {
  await updateAgentConnection(connectionId, organizationId, {
    sync_status: "connected",
    last_synced_at: new Date().toISOString(),
    last_sync_error: null,
    remote_updated_at: remoteUpdatedAt,
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

export async function markAgentConnectionError(
  connectionId: string,
  organizationId: string,
  message: string
): Promise<void> {
  await updateAgentConnection(connectionId, organizationId, {
    sync_status: "error",
    last_sync_error: message,
  });
}