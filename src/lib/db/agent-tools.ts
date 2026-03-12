import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json, Tables, TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;

type UpsertAgentToolInput = {
  agentId: string;
  organizationId: string;
  integrationId: string | null;
  toolType: string;
  isEnabled: boolean;
  config: Json;
};

export async function listAgentTools(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentTool[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_tools")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getAgentToolById(
  agentToolId: string,
  organizationId: string
): Promise<DbResult<AgentTool>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_tools")
    .select("*")
    .eq("id", agentToolId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function upsertAgentTool(
  input: UpsertAgentToolInput
): Promise<DbResult<AgentTool>> {
  const serviceClient = createServiceSupabaseClient();
  let existingQuery = serviceClient
    .from("agent_tools")
    .select("*")
    .eq("agent_id", input.agentId)
    .eq("organization_id", input.organizationId)
    .eq("tool_type", input.toolType)
    .order("created_at", { ascending: true })
    .limit(1);

  existingQuery = input.integrationId
    ? existingQuery.eq("integration_id", input.integrationId)
    : existingQuery.is("integration_id", null);

  const existingResult = await existingQuery.maybeSingle();

  if (existingResult.error) {
    return { data: null, error: existingResult.error.message };
  }

  if (existingResult.data) {
    const updateResult = await serviceClient
      .from("agent_tools")
      .update({
        is_enabled: input.isEnabled,
        config: input.config,
      })
      .eq("id", existingResult.data.id)
      .eq("organization_id", input.organizationId)
      .select("*")
      .single();

    if (updateResult.error) {
      return { data: null, error: updateResult.error.message };
    }

    return { data: updateResult.data, error: null };
  }

  const insertPayload: TablesInsert<"agent_tools"> = {
    agent_id: input.agentId,
    organization_id: input.organizationId,
    integration_id: input.integrationId,
    tool_type: input.toolType,
    is_enabled: input.isEnabled,
    config: input.config,
  };

  const insertResult = await serviceClient
    .from("agent_tools")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertResult.error) {
    return { data: null, error: insertResult.error.message };
  }

  return { data: insertResult.data, error: null };
}

export async function deleteAgentTool(
  agentToolId: string,
  organizationId: string
): Promise<DbResult<AgentTool>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("agent_tools")
    .delete()
    .eq("id", agentToolId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}