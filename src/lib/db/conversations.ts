import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Channel, Conversation } from "@/types/app";
import type { TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type ConversationInsert = TablesInsert<"conversations">;

export async function createConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string,
  channel: Channel = "web"
): Promise<DbResult<Conversation>> {
  const supabase = await createServerSupabaseClient();
  const insertPayload: ConversationInsert = {
    agent_id: agentId,
    organization_id: organizationId,
    initiated_by: initiatedBy,
    channel,
    status: "active",
  };

  const { data, error } = await supabase
    .from("conversations")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getConversationById(
  conversationId: string,
  agentId: string,
  organizationId: string,
  initiatedBy?: string
): Promise<DbResult<Conversation>> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId);

  if (initiatedBy) {
    query = query.eq("initiated_by", initiatedBy);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getOrCreateConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string
): Promise<DbResult<Conversation>> {
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .eq("initiated_by", initiatedBy)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: selectError.message };
  }

  if (existing) {
    console.info("conversations.reused", {
      conversationId: existing.id,
      agentId,
      organizationId,
      initiatedBy,
    });
    return { data: existing, error: null };
  }

  const createdConversation = await createConversation(
    agentId,
    organizationId,
    initiatedBy
  );

  if (createdConversation.data) {
    console.info("conversations.created", {
      conversationId: createdConversation.data.id,
      agentId,
      organizationId,
      initiatedBy,
    });
  }

  return createdConversation;
}

export async function listConversations(
  agentId: string,
  organizationId: string
): Promise<DbResult<Conversation[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
