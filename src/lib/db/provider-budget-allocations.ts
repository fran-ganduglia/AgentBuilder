import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export type ProviderBudgetAllocationRow = Tables<"provider_budget_allocations">;
export type ProviderBudgetAllocationInsert = TablesInsert<"provider_budget_allocations">;
export type ProviderBudgetAllocationUpdate = TablesUpdate<"provider_budget_allocations">;

export async function listProviderBudgetAllocationsByRun(
  organizationId: string,
  workflowRunId: string
): Promise<DbResult<ProviderBudgetAllocationRow[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_budget_allocations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("workflow_run_id", workflowRunId)
    .order("reserved_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function insertProviderBudgetAllocation(
  input: ProviderBudgetAllocationInsert
): Promise<DbResult<ProviderBudgetAllocationRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("provider_budget_allocations")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateProviderBudgetAllocation(
  organizationId: string,
  allocationId: string,
  patch: ProviderBudgetAllocationUpdate
): Promise<DbResult<ProviderBudgetAllocationRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("provider_budget_allocations")
    .update(patch)
    .eq("id", allocationId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

