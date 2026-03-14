import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

export type WorkflowStepRow = Tables<"workflow_steps">;
export type WorkflowStepInsert = TablesInsert<"workflow_steps">;
export type WorkflowStepUpdate = TablesUpdate<"workflow_steps">;
export type WorkflowStepStatus = WorkflowStepRow["status"];

export async function getWorkflowStepById(
  organizationId: string,
  workflowStepId: string
): Promise<DbResult<WorkflowStepRow>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("id", workflowStepId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

export async function listWorkflowStepsByRun(
  organizationId: string,
  workflowRunId: string
): Promise<DbResult<WorkflowStepRow[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("workflow_run_id", workflowRunId)
    .order("step_index", { ascending: true })
    .order("attempt", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function insertWorkflowStep(
  input: WorkflowStepInsert
): Promise<DbResult<WorkflowStepRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_steps")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateWorkflowStep(
  organizationId: string,
  workflowStepId: string,
  patch: WorkflowStepUpdate
): Promise<DbResult<WorkflowStepRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_steps")
    .update(patch)
    .eq("id", workflowStepId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

