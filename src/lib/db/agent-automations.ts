import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

export type AutomationTriggerType = "schedule" | "webhook" | "event";
export type AutomationActionType = "agent_message" | "integration_call" | "workflow";
export type AutomationRunStatus = "success" | "failed" | "skipped";

export type AgentAutomation = {
  id: string;
  organization_id: string;
  agent_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  condition_config: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: AutomationRunStatus | null;
  created_at: string;
  updated_at: string;
};

export type CreateAutomationInput = {
  agentId: string;
  organizationId: string;
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  conditionConfig?: Record<string, unknown>;
};

export type UpdateAutomationInput = Partial<{
  name: string;
  description: string | null;
  isEnabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  conditionConfig: Record<string, unknown>;
}>;

type DbResult<T> = { data: T | null; error: string | null };

export async function listAutomations(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentAutomation[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_automations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as AgentAutomation[], error: null };
}

export async function getAutomationById(
  automationId: string,
  organizationId: string
): Promise<DbResult<AgentAutomation>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_automations")
    .select("*")
    .eq("id", automationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentAutomation, error: null };
}

export async function createAutomation(
  input: CreateAutomationInput
): Promise<DbResult<AgentAutomation>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_automations")
    .insert({
      agent_id: input.agentId,
      organization_id: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      trigger_type: input.triggerType,
      trigger_config: input.triggerConfig as unknown as Json,
      action_type: input.actionType,
      action_config: input.actionConfig as unknown as Json,
      condition_config: (input.conditionConfig ?? {}) as unknown as Json,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentAutomation, error: null };
}

export async function updateAutomation(
  automationId: string,
  organizationId: string,
  input: UpdateAutomationInput
): Promise<DbResult<AgentAutomation>> {
  const supabase = await createServerSupabaseClient();
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.isEnabled !== undefined) patch.is_enabled = input.isEnabled;
  if (input.triggerType !== undefined) patch.trigger_type = input.triggerType;
  if (input.triggerConfig !== undefined) patch.trigger_config = input.triggerConfig;
  if (input.actionType !== undefined) patch.action_type = input.actionType;
  if (input.actionConfig !== undefined) patch.action_config = input.actionConfig;
  if (input.conditionConfig !== undefined) patch.condition_config = input.conditionConfig;

  const { data, error } = await supabase
    .from("agent_automations")
    .update(patch)
    .eq("id", automationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentAutomation, error: null };
}

export async function softDeleteAutomation(
  automationId: string,
  organizationId: string
): Promise<DbResult<true>> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("agent_automations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) return { data: null, error: error.message };
  return { data: true, error: null };
}

export async function listScheduledAutomationsForWorker(): Promise<
  DbResult<AgentAutomation[]>
> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("agent_automations")
    .select("*")
    .eq("trigger_type", "schedule")
    .eq("is_enabled", true)
    .is("deleted_at", null);

  if (error) return { data: null, error: error.message };
  return { data: data as AgentAutomation[], error: null };
}

export async function markAutomationRun(
  automationId: string,
  status: AutomationRunStatus
): Promise<DbResult<true>> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("agent_automations")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
    })
    .eq("id", automationId);

  if (error) return { data: null, error: error.message };
  return { data: true, error: null };
}
