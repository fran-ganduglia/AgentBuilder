import "server-only";

import { getCurrentMonthRuntimeUsageSummary } from "@/lib/db/runtime-usage-events";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeRunRow = Tables<"runtime_runs">;
export type RuntimeRunInsert = TablesInsert<"runtime_runs">;
export type RuntimeRunUpdate = TablesUpdate<"runtime_runs">;

const ACTIVE_RUNTIME_RUN_STATUSES = [
  "running",
  "waiting_approval",
  "waiting_async_execution",
] as const;

export async function insertRuntimeRun(
  input: RuntimeRunInsert
): Promise<DbResult<RuntimeRunRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("runtime_runs")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateRuntimeRun(
  organizationId: string,
  runtimeRunId: string,
  patch: RuntimeRunUpdate
): Promise<DbResult<RuntimeRunRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("runtime_runs")
    .update(patch)
    .eq("id", runtimeRunId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

export async function getRuntimeRunById(
  organizationId: string,
  runtimeRunId: string
): Promise<DbResult<RuntimeRunRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("runtime_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", runtimeRunId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

export async function getRuntimeRunCounts(input: {
  organizationId: string;
  agentId: string;
}): Promise<DbResult<{
  activeOrganizationRuns: number;
  activeAgentRuns: number;
  activeSurfaceRuns: number;
}>> {
  const supabase = createServiceSupabaseClient();

  const organizationQuery = supabase
    .from("runtime_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId)
    .in("status", [...ACTIVE_RUNTIME_RUN_STATUSES]);
  const agentQuery = supabase
    .from("runtime_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId)
    .eq("agent_id", input.agentId)
    .in("status", [...ACTIVE_RUNTIME_RUN_STATUSES]);
  const [
    { count: organizationCount, error: organizationError },
    { count: agentCount, error: agentError },
  ] = await Promise.all([organizationQuery, agentQuery]);

  if (organizationError || agentError) {
    return {
      data: null,
      error:
        organizationError?.message ??
        agentError?.message ??
        "No se pudieron obtener los contadores de runtime runs",
    };
  }

  return {
    data: {
      activeOrganizationRuns: organizationCount ?? 0,
      activeAgentRuns: agentCount ?? 0,
      activeSurfaceRuns: organizationCount ?? 0,
    },
    error: null,
  };
}

export async function getCurrentMonthUsageSummary(
  organizationId: string
): Promise<DbResult<{
  dailyEstimatedCostUsd: number;
  monthlyEstimatedSideEffects: number;
  dailyEstimatedSideEffects: number;
}>> {
  const summary = await getCurrentMonthRuntimeUsageSummary(organizationId);
  if (summary.error || !summary.data) {
    return {
      data: null,
      error: summary.error ?? "No se pudo obtener el resumen de runtime usage",
    };
  }

  return {
    data: {
      dailyEstimatedCostUsd: summary.data.dailyEstimatedCostUsd,
      monthlyEstimatedSideEffects: summary.data.monthlyEstimatedSideEffects,
      dailyEstimatedSideEffects: summary.data.dailyEstimatedSideEffects,
    },
    error: null,
  };
}
