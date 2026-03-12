import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Message } from "@/types/app";
import type { TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

const MAX_MESSAGES = 20;

type MessageRole = "user" | "assistant";
type MessageInsert = TablesInsert<"messages">;

type FindMessageByFingerprintOptions = {
  useServiceRole?: boolean;
};

export type InsertMessageInput = {
  agentId?: string;
  conversationId: string;
  organizationId: string;
  role: MessageRole;
  content: string;
  llmModel?: string | null;
  responseTimeMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  createdAt?: string | null;
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
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  };
}

function enqueueMessageCreatedEvent(message: Message, input: InsertMessageInput): void {
  void enqueueEvent({
    organizationId: input.organizationId,
    eventType: "message.created",
    entityType: "message",
    entityId: message.id,
    idempotencyKey: `message.created:${message.id}`,
    payload: {
      message_id: message.id,
      conversation_id: message.conversation_id,
      agent_id: input.agentId ?? null,
      role: message.role,
      content: message.content,
      llm_model: message.llm_model ?? null,
      created_at: message.created_at,
    },
  });
}

export async function listMessages(
  conversationId: string,
  organizationId: string,
  limit = MAX_MESSAGES
): Promise<DbResult<Message[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data.reverse(), error: null };
}

export async function findMessageByFingerprint(
  conversationId: string,
  organizationId: string,
  role: MessageRole,
  content: string,
  createdAt: string,
  options: FindMessageByFingerprintOptions = {}
): Promise<DbResult<Message>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .eq("role", role)
    .eq("content", content)
    .eq("created_at", createdAt)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
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

  enqueueMessageCreatedEvent(data, input);

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

  enqueueMessageCreatedEvent(data, input);

  return { data, error: null };
}
