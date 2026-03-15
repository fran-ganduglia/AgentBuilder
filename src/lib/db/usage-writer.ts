import "server-only";

import { getOrganizationPlan } from "@/lib/db/organization-plans";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert } from "@/types/database";

type RecordUsageInput = {
  organizationId: string;
  agentId: string;
  tokensInput: number;
  tokensOutput: number;
  llmProvider: string;
};

type RecordUsageResult = {
  currentUsage: number;
  planLimit: number | null;
};

type AssistantUsageMessageRow = Pick<
  Tables<"messages">,
  "conversation_id" | "created_at" | "llm_model" | "tokens_input" | "tokens_output"
>;

type ConversationAgentRow = Pick<Tables<"conversations">, "id" | "agent_id">;
type UsageRecordInsert = TablesInsert<"usage_records">;
type UsageRecordTimestampRow = Pick<Tables<"usage_records">, "updated_at">;
type MessageTimestampRow = Pick<Tables<"messages">, "created_at">;

type AggregatedUsageRecord = {
  agentId: string;
  llmProvider: string;
  periodStart: string;
  periodEnd: string;
  totalMessages: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalConversations: number;
};

function getCurrentPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

function getBackfillRange(months: number): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString();
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { startDate, endDate };
}

function getMonthPeriod(createdAt: string): { periodStart: string; periodEnd: string } {
  const date = new Date(createdAt);
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

function estimateTokenCost(tokensInput: number, tokensOutput: number): number {
  return (tokensInput * 0.003 + tokensOutput * 0.006) / 1000;
}

function resolveProviderFromModel(model: string | null): string {
  if (!model) {
    return "unknown";
  }

  if (model.startsWith("gpt-")) {
    return "openai";
  }

  if (model.startsWith("claude-")) {
    return "anthropic";
  }

  if (model.startsWith("gemini-") || model === "gemini-pro") {
    return "gemini";
  }

  return "custom";
}

async function buildAggregatedUsageRecords(
  organizationId: string,
  months: number
): Promise<AggregatedUsageRecord[]> {
  const serviceClient = createServiceSupabaseClient();
  const { startDate, endDate } = getBackfillRange(months);

  const { data: conversations, error: conversationsError } = await serviceClient
    .from("conversations")
    .select("id, agent_id")
    .eq("organization_id", organizationId);

  if (conversationsError) {
    throw new Error(conversationsError.message);
  }

  const conversationRows = (conversations ?? []) as ConversationAgentRow[];
  if (conversationRows.length === 0) {
    return [];
  }

  const conversationMap = new Map<string, string>();
  const conversationIds: string[] = [];

  for (const row of conversationRows) {
    if (!row.agent_id) {
      continue;
    }

    conversationMap.set(row.id, row.agent_id);
    conversationIds.push(row.id);
  }

  if (conversationIds.length === 0) {
    return [];
  }

  const { data: messageData, error: messageError } = await serviceClient
    .from("messages")
    .select("conversation_id, created_at, llm_model, tokens_input, tokens_output")
    .eq("organization_id", organizationId)
    .in("conversation_id", conversationIds)
    .eq("role", "assistant")
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (messageError) {
    throw new Error(messageError.message);
  }

  const grouped = new Map<
    string,
    AggregatedUsageRecord & { conversationIds: Set<string> }
  >();

  for (const row of (messageData ?? []) as AssistantUsageMessageRow[]) {
    const agentId = conversationMap.get(row.conversation_id);

    if (!agentId) {
      continue;
    }

    const provider = resolveProviderFromModel(row.llm_model);
    const { periodStart, periodEnd } = getMonthPeriod(row.created_at);
    const key = `${agentId}:${provider}:${periodStart}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.totalMessages += 1;
      existing.totalTokensInput += row.tokens_input ?? 0;
      existing.totalTokensOutput += row.tokens_output ?? 0;
      existing.conversationIds.add(row.conversation_id);
      continue;
    }

    grouped.set(key, {
      agentId,
      llmProvider: provider,
      periodStart,
      periodEnd,
      totalMessages: 1,
      totalTokensInput: row.tokens_input ?? 0,
      totalTokensOutput: row.tokens_output ?? 0,
      totalConversations: 0,
      conversationIds: new Set([row.conversation_id]),
    });
  }

  return Array.from(grouped.values()).map((row) => ({
    agentId: row.agentId,
    llmProvider: row.llmProvider,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    totalMessages: row.totalMessages,
    totalTokensInput: row.totalTokensInput,
    totalTokensOutput: row.totalTokensOutput,
    totalConversations: row.conversationIds.size,
  }));
}

async function getLatestAssistantMessageCreatedAt(
  organizationId: string,
  months: number
): Promise<string | null> {
  const serviceClient = createServiceSupabaseClient();
  const { startDate, endDate } = getBackfillRange(months);

  const { data, error } = await serviceClient
    .from("messages")
    .select("created_at")
    .eq("organization_id", organizationId)
    .eq("role", "assistant")
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as MessageTimestampRow | null)?.created_at ?? null;
}

async function getLatestUsageRecordUpdatedAt(
  organizationId: string,
  months: number
): Promise<string | null> {
  const serviceClient = createServiceSupabaseClient();
  const { startDate, endDate } = getBackfillRange(months);

  const { data, error } = await serviceClient
    .from("usage_records")
    .select("updated_at")
    .eq("organization_id", organizationId)
    .gte("period_start", startDate)
    .lt("period_start", endDate)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UsageRecordTimestampRow | null)?.updated_at ?? null;
}

export async function ensureUsageRecordsCurrentForOrganization(
  organizationId: string,
  months: number = 1
): Promise<void> {
  const [latestMessageCreatedAt, latestUsageUpdatedAt] = await Promise.all([
    getLatestAssistantMessageCreatedAt(organizationId, months),
    getLatestUsageRecordUpdatedAt(organizationId, months),
  ]);

  if (!latestMessageCreatedAt) {
    return;
  }

  if (!latestUsageUpdatedAt) {
    await backfillUsageRecordsForOrganization(organizationId, months);
    return;
  }

  if (new Date(latestUsageUpdatedAt).getTime() < new Date(latestMessageCreatedAt).getTime()) {
    await backfillUsageRecordsForOrganization(organizationId, months);
  }
}

export async function backfillUsageRecordsForOrganization(
  organizationId: string,
  months: number = 1
): Promise<void> {
  const serviceClient = createServiceSupabaseClient();
  const { startDate, endDate } = getBackfillRange(months);

  const { error: deleteError } = await serviceClient
    .from("usage_records")
    .delete()
    .eq("organization_id", organizationId)
    .gte("period_start", startDate)
    .lt("period_start", endDate);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const aggregatedRows = await buildAggregatedUsageRecords(organizationId, months);

  if (aggregatedRows.length === 0) {
    return;
  }

  const insertPayload: UsageRecordInsert[] = aggregatedRows.map((row) => ({
    organization_id: organizationId,
    agent_id: row.agentId,
    llm_provider: row.llmProvider,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    total_messages: row.totalMessages,
    total_tokens_input: row.totalTokensInput,
    total_tokens_output: row.totalTokensOutput,
    total_conversations: row.totalConversations,
    estimated_cost_usd: estimateTokenCost(row.totalTokensInput, row.totalTokensOutput),
  }));

  const { error: insertError } = await serviceClient
    .from("usage_records")
    .upsert(insertPayload, {
      onConflict: "organization_id,agent_id,period_start,llm_provider",
    });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult | null> {
  try {
    const serviceClient = createServiceSupabaseClient();
    const { periodStart, periodEnd } = getCurrentPeriod();

    await backfillUsageRecordsForOrganization(input.organizationId, 1);

    const planResult = await getOrganizationPlan(input.organizationId);

    if (planResult.error || !planResult.data) {
      return { currentUsage: 0, planLimit: null };
    }

    const { data: allUsage, error: usageError } = await serviceClient
      .from("messages")
      .select("conversation_id")
      .eq("organization_id", input.organizationId)
      .eq("role", "assistant")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (usageError) {
      console.error("usage_writer.readback_error", { error: usageError.message });
      return null;
    }

    const sessionIds = new Set(
      (allUsage ?? [])
        .map((row) => row.conversation_id)
        .filter((conversationId): conversationId is string => typeof conversationId === "string")
    );

    return {
      currentUsage: sessionIds.size,
      planLimit: planResult.data.config.maxSessionsMonth,
    };
  } catch (error) {
    console.error("usage_writer.unexpected_error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
