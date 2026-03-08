import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Message } from "@/types/app";
import type { TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

const MAX_MESSAGES = 20;

type MessageRole = "user" | "assistant";
type MessageInsert = TablesInsert<"messages">;

export type InsertMessageInput = {
  conversationId: string;
  organizationId: string;
  role: MessageRole;
  content: string;
  llmModel?: string | null;
  responseTimeMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
};

function buildInsertPayload(input: InsertMessageInput): MessageInsert {
  return {
    conversation_id: input.conversationId,
    organization_id: input.organizationId,
    role: input.role,
    content: input.content,
    llm_model: input.llmModel ?? null,
    response_time_ms: input.responseTimeMs ?? null,
    tokens_input: input.tokensInput ?? null,
    tokens_output: input.tokensOutput ?? null,
  };
}

export async function listMessages(
  conversationId: string,
  organizationId: string
): Promise<DbResult<Message[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data.reverse(), error: null };
}

export async function insertMessage(input: InsertMessageInput): Promise<DbResult<Message>> {
  const supabase = await createServerSupabaseClient();
  const insertPayload = buildInsertPayload(input);

  const { data, error } = await supabase
    .from("messages")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function insertMessageWithServiceRole(
  input: InsertMessageInput
): Promise<DbResult<Message>> {
  const supabase = createServiceSupabaseClient();
  const insertPayload = buildInsertPayload(input);

  const { data, error } = await supabase
    .from("messages")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
