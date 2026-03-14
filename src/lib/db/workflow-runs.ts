import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export type WorkflowRunRow = Tables<"workflow_runs">;
export type WorkflowRunInsert = TablesInsert<"workflow_runs">;
export type WorkflowRunUpdate = TablesUpdate<"workflow_runs">;
export type WorkflowRunStatus = WorkflowRunRow["status"];

export async function getWorkflowRunById(
  organizationId: string,
  workflowRunId: string
): Promise<DbResult<WorkflowRunRow>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", workflowRunId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

export async function listWorkflowRunsByAgent(
  organizationId: string,
  agentId: string,
  limit = 20
): Promise<DbResult<WorkflowRunRow[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function insertWorkflowRun(
  input: WorkflowRunInsert
): Promise<DbResult<WorkflowRunRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateWorkflowRun(
  organizationId: string,
  workflowRunId: string,
  patch: WorkflowRunUpdate
): Promise<DbResult<WorkflowRunRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({
      ...patch,
      last_transition_at: patch.last_transition_at ?? new Date().toISOString(),
    })
    .eq("id", workflowRunId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

