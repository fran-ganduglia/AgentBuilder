import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type AgentTool = Tables<"agent_tools">;

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
