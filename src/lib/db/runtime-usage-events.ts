import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json, Tables, TablesInsert } from "@/types/database";
import type { RuntimeUsageEventV1 } from "@/lib/runtime/types";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeUsageEventRow = Tables<"runtime_usage_events">;
export type RuntimeUsageEventInsert = TablesInsert<"runtime_usage_events">;

function getCurrentPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

function toJsonRecord(value: Record<string, unknown> | undefined): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)
  ) as Record<string, Json>;
}

export function buildRuntimeUsageEventInsert(
  input: RuntimeUsageEventV1
): RuntimeUsageEventInsert {
  return {
    organization_id: input.organizationId,
    agent_id: input.agentId,
    runtime_run_id: input.runtimeRunId,
    action_type: input.actionType ?? null,
    provider: input.provider ?? null,
    usage_kind: input.usageKind,
    quantity: input.quantity,
    tokens_input: input.tokensInput,
    tokens_output: input.tokensOutput,
    estimated_cost_usd: input.estimatedCostUsd,
    surface: input.surface ?? null,
    approval_item_id: input.approvalItemId ?? null,
    workflow_run_id: input.workflowRunId ?? null,
    workflow_step_id: input.workflowStepId ?? null,
    provider_request_id: input.providerRequestId ?? null,
    metadata: toJsonRecord(input.metadata),
    occurred_at: input.occurredAt,
  };
}

export async function insertRuntimeUsageEvents(
  input: RuntimeUsageEventInsert[]
): Promise<DbResult<RuntimeUsageEventRow[]>> {
  if (input.length === 0) {
    return { data: [], error: null };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("runtime_usage_events")
    .insert(input)
    .select("*");

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getCurrentMonthRuntimeUsageSummary(
  organizationId: string
): Promise<DbResult<{
  dailyEstimatedCostUsd: number;
  monthlyEstimatedSideEffects: number;
  dailyEstimatedSideEffects: number;
  monthlyTotalCostUsd: number;
}>> {
  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const { periodStart, periodEnd } = getCurrentPeriod();

  const { data, error } = await supabase
    .from("runtime_usage_events")
    .select("usage_kind, quantity, estimated_cost_usd")
    .eq("organization_id", organizationId)
    .gte("occurred_at", periodStart)
    .lt("occurred_at", periodEnd);

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = (data ?? []) as Array<{
    usage_kind: RuntimeUsageEventV1["usageKind"];
    quantity: number | null;
    estimated_cost_usd: number | null;
  }>;
  const monthlyLlmCostUsd = rows.reduce((sum, row) => {
    if (
      row.usage_kind !== "llm_planner_call" &&
      row.usage_kind !== "llm_repair_call" &&
      row.usage_kind !== "llm_postprocess_call"
    ) {
      return sum;
    }

    return sum + (row.estimated_cost_usd ?? 0);
  }, 0);
  const monthlyTotalCostUsd = rows.reduce(
    (sum, row) => sum + (row.estimated_cost_usd ?? 0),
    0
  );
  const monthlySideEffects = rows.reduce((sum, row) => {
    if (row.usage_kind !== "side_effect_write") {
      return sum;
    }

    return sum + (row.quantity ?? 0);
  }, 0);
  const dayOfMonth = Math.max(now.getDate(), 1);

  return {
    data: {
      dailyEstimatedCostUsd: Number((monthlyLlmCostUsd / dayOfMonth).toFixed(6)),
      monthlyEstimatedSideEffects: monthlySideEffects,
      dailyEstimatedSideEffects: Math.round(monthlySideEffects / dayOfMonth),
      monthlyTotalCostUsd: Number(monthlyTotalCostUsd.toFixed(6)),
    },
    error: null,
  };
}
