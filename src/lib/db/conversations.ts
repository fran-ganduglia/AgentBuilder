import { enqueueEvent } from "@/lib/db/event-queue";
import {
  mergeConversationMetadata,
  resolveConversationChatMode,
  type ChatMode,
  type ConversationMetadata,
} from "@/lib/chat/conversation-metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Channel, Conversation, ConversationStatus } from "@/types/app";
import type { TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null; created?: boolean };
type ConversationInsert = TablesInsert<"conversations">;

type CreateConversationOptions = {
  channel?: Channel;
  status?: ConversationStatus;
  metadata?: ConversationMetadata;
  externalId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  useServiceRole?: boolean;
};

type GetOrCreateConversationOptions = {
  chatMode?: ChatMode;
  channel?: Channel;
  useServiceRole?: boolean;
};

type ConversationQueryOptions = {
  useServiceRole?: boolean;
};

type UpdateConversationMetadataOptions = {
  initiatedBy?: string;
  useServiceRole?: boolean;
};

function matchesChatMode(conversation: Conversation, chatMode?: ChatMode): boolean {
  if (!chatMode) {
    return true;
  }

  return resolveConversationChatMode(conversation) === chatMode;
}

export async function createConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string | null,
  options: CreateConversationOptions = {}
): Promise<DbResult<Conversation>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();
  const insertPayload: ConversationInsert = {
    agent_id: agentId,
    organization_id: organizationId,
    initiated_by: initiatedBy,
    channel: options.channel ?? "web",
    status: options.status ?? "active",
    metadata: options.metadata ?? null,
    external_id: options.externalId ?? null,
    ...(options.startedAt ? { started_at: options.startedAt } : {}),
    ...(options.endedAt ? { ended_at: options.endedAt } : {}),
  };

  const { data, error } = await supabase
    .from("conversations")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message, created: false };
  }

  void enqueueEvent({
    organizationId,
    eventType: "conversation.created",
    entityType: "conversation",
    entityId: data.id,
    idempotencyKey: `conversation.created:${data.id}`,
    payload: {
      conversation_id: data.id,
      agent_id: data.agent_id,
      channel: data.channel,
      initiated_by: data.initiated_by ?? null,
      started_at: data.started_at ?? null,
      status: data.status ?? "active",
    },
  });

  return { data, error: null, created: true };
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
    return { data: null, error: error.message, created: false };
  }

  return { data, error: null, created: false };
}

export async function getConversationByIdWithServiceRole(
  conversationId: string,
  agentId: string,
  organizationId: string
): Promise<DbResult<Conversation>> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message, created: false };
  }

  return { data, error: null, created: false };
}

export async function findConversationByExternalId(
  agentId: string,
  organizationId: string,
  externalId: string,
  channel: Channel = "whatsapp",
  options: ConversationQueryOptions = {}
): Promise<DbResult<Conversation>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message, created: false };
  }

  return { data, error: null, created: false };
}

export async function getOrCreateConversation(
  agentId: string,
  organizationId: string,
  initiatedBy: string,
  options: GetOrCreateConversationOptions = {}
): Promise<DbResult<Conversation>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .eq("initiated_by", initiatedBy)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(20);

  if (selectError) {
    return { data: null, error: selectError.message, created: false };
  }

  const matchedConversation = (existing ?? []).find((conversation) =>
    matchesChatMode(conversation, options.chatMode)
  );

  if (matchedConversation) {
    console.info("conversations.reused", {
      conversationId: matchedConversation.id,
      agentId,
      organizationId,
      initiatedBy,
      chatMode: options.chatMode ?? resolveConversationChatMode(matchedConversation),
    });
    return { data: matchedConversation, error: null, created: false };
  }

  const metadata = options.chatMode
    ? ({ chat_mode: options.chatMode } satisfies ConversationMetadata)
    : undefined;
  const createdConversation = await createConversation(agentId, organizationId, initiatedBy, {
    channel: options.channel ?? "web",
    metadata,
    useServiceRole: options.useServiceRole,
  });

  if (createdConversation.data) {
    console.info("conversations.created", {
      conversationId: createdConversation.data.id,
      agentId,
      organizationId,
      initiatedBy,
      chatMode: options.chatMode ?? resolveConversationChatMode(createdConversation.data),
    });
  }

  return createdConversation;
}

export async function updateConversationMetadata(
  conversationId: string,
  agentId: string,
  organizationId: string,
  patch: ConversationMetadata,
  options: UpdateConversationMetadataOptions = {}
): Promise<DbResult<Conversation>> {
  const currentConversation = options.useServiceRole
    ? await getConversationByIdWithServiceRole(conversationId, agentId, organizationId)
    : await getConversationById(
        conversationId,
        agentId,
        organizationId,
        options.initiatedBy
      );

  if (currentConversation.error || !currentConversation.data) {
    return { data: null, error: currentConversation.error ?? "Conversacion no encontrada" };
  }

  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();
  const mergedMetadata = mergeConversationMetadata(currentConversation.data.metadata, patch);

  const { data, error } = await supabase
    .from("conversations")
    .update({ metadata: mergedMetadata })
    .eq("id", conversationId)
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function listConversations(
  agentId: string,
  organizationId: string,
  options: ConversationQueryOptions = {}
): Promise<DbResult<Conversation[]>> {
  const supabase = options.useServiceRole
    ? createServiceSupabaseClient()
    : await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, created: false };
  }

  return { data, error: null, created: false };
}
