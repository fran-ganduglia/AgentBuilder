import "server-only";

import {
  getOrganizationPlanConfig,
  normalizeOrganizationPlanName,
} from "@/lib/agents/agent-integration-limits";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  backfillUsageRecordsForOrganization,
  ensureUsageRecordsCurrentForOrganization,
} from "@/lib/db/usage-writer";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type DatabaseClient = ReturnType<typeof createServiceSupabaseClient>;

type UsageRow = Pick<
  Tables<"usage_records">,
  | "agent_id"
  | "total_messages"
  | "total_tokens_input"
  | "total_tokens_output"
  | "estimated_cost_usd"
  | "total_conversations"
  | "period_start"
  | "period_end"
>;

type PlanLimits = Pick<
  Tables<"plans">,
  "features" | "name" | "price_monthly_usd"
>;

type OrganizationPlan = Pick<Tables<"organizations">, "plan_id">;

export type OrganizationUsage = {
  totalMessages: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedCostUsd: number;
  totalConversations: number;
  planName: string;
  planLimit: number;
  usagePercent: number;
};

export type AgentUsage = {
  totalMessages: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedCostUsd: number;
  totalConversations: number;
  averageLatencyMs: number | null;
};

export type MonthlyUsage = {
  periodStart: string;
  totalMessages: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedCostUsd: number;
};

export type AgentUsageRow = AgentUsage & {
  agentId: string;
  agentName: string;
};

export type DashboardUsageData = {
  usage: OrganizationUsage;
  agents: AgentUsageRow[];
  history: MonthlyUsage[];
};

function getCurrentMonthRange(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

function getHistoryStartDate(months: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString();
}

function buildAgentUsage(rows: UsageRow[], averageLatencyMs: number | null): AgentUsage {
  return {
    totalMessages: rows.reduce((sum, row) => sum + (row.total_messages ?? 0), 0),
    totalTokensInput: rows.reduce((sum, row) => sum + (row.total_tokens_input ?? 0), 0),
    totalTokensOutput: rows.reduce((sum, row) => sum + (row.total_tokens_output ?? 0), 0),
    estimatedCostUsd: rows.reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0),
    totalConversations: rows.reduce((sum, row) => sum + (row.total_conversations ?? 0), 0),
    averageLatencyMs,
  };
}

async function countDistinctAssistantConversations(
  supabase: DatabaseClient,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
  conversationIds?: string[]
): Promise<number> {
  let query = supabase
    .from("messages")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("role", "assistant")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (conversationIds && conversationIds.length > 0) {
    query = query.in("conversation_id", conversationIds);
  }

  const { data, error } = await query;

  if (error || !data) {
    return 0;
  }

  return new Set(
    data
      .map((row) => row.conversation_id)
      .filter((conversationId): conversationId is string => typeof conversationId === "string")
  ).size;
}

async function fetchOrganizationUsageFromSnapshot(
  supabase: DatabaseClient,
  organizationId: string
): Promise<DbResult<OrganizationUsage>> {
  const { periodStart, periodEnd } = getCurrentMonthRange();

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .single();

  const org = orgData as OrganizationPlan | null;

  if (orgError || !org) {
    return { data: null, error: "No se pudo obtener la organizacion" };
  }

  const { data: planData, error: planError } = await supabase
    .from("plans")
    .select("features, name, price_monthly_usd")
    .eq("id", org.plan_id)
    .single();

  const plan = planData as PlanLimits | null;

  if (planError || !plan) {
    return { data: null, error: "No se pudo obtener el plan" };
  }

  const { data: usageData, error: usageError } = await supabase
    .from("usage_records")
    .select(
      "total_messages, total_tokens_input, total_tokens_output, estimated_cost_usd, total_conversations"
    )
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);

  if (usageError) {
    return { data: null, error: usageError.message };
  }

  const rows = (usageData ?? []) as UsageRow[];
  const totalMessages = rows.reduce((sum, row) => sum + (row.total_messages ?? 0), 0);
  const totalTokensInput = rows.reduce((sum, row) => sum + (row.total_tokens_input ?? 0), 0);
  const totalTokensOutput = rows.reduce((sum, row) => sum + (row.total_tokens_output ?? 0), 0);
  const estimatedCostUsd = rows.reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0);
  const totalConversations = await countDistinctAssistantConversations(
    supabase,
    organizationId,
    periodStart,
    periodEnd
  );
  const planName = normalizeOrganizationPlanName(plan.name);

  if (!planName) {
    return { data: null, error: "El plan de la organizacion no es compatible con los limites actuales" };
  }

  const planConfig = getOrganizationPlanConfig(planName, plan.features);

  const usagePercent = planConfig.maxSessionsMonth && planConfig.maxSessionsMonth > 0
    ? Math.round((totalConversations / planConfig.maxSessionsMonth) * 100)
    : 0;

  return {
    data: {
      totalMessages,
      totalTokensInput,
      totalTokensOutput,
      estimatedCostUsd,
      totalConversations,
      planName: planConfig.publicLabel,
      planLimit: planConfig.maxSessionsMonth ?? 0,
      usagePercent,
    },
    error: null,
  };
}

async function fetchAgentLatencyMap(
  supabase: DatabaseClient,
  organizationId: string,
  convByAgent: Map<string, string[]>,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, number>> {
  const allConvIds = Array.from(convByAgent.values()).flat();
  const latencyByAgent = new Map<string, number>();

  if (allConvIds.length === 0) {
    return latencyByAgent;
  }

  const { data: latencyData } = await supabase
    .from("messages")
    .select("conversation_id, response_time_ms")
    .eq("organization_id", organizationId)
    .in("conversation_id", allConvIds)
    .eq("role", "assistant")
    .not("response_time_ms", "is", null)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (!latencyData) {
    return latencyByAgent;
  }

  const conversationToAgent = new Map<string, string>();
  for (const [agentId, convIds] of convByAgent.entries()) {
    for (const conversationId of convIds) {
      conversationToAgent.set(conversationId, agentId);
    }
  }

  const latencyAccum = new Map<string, { total: number; count: number }>();

  for (const row of latencyData as Array<{ conversation_id: string; response_time_ms: number }>) {
    const agentId = conversationToAgent.get(row.conversation_id);

    if (!agentId) {
      continue;
    }

    const existing = latencyAccum.get(agentId) ?? { total: 0, count: 0 };
    existing.total += row.response_time_ms;
    existing.count += 1;
    latencyAccum.set(agentId, existing);
  }

  for (const [agentId, accum] of latencyAccum.entries()) {
    latencyByAgent.set(agentId, Math.round(accum.total / accum.count));
  }

  return latencyByAgent;
}

async function fetchAgentUsageFromSnapshot(
  supabase: DatabaseClient,
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentUsage>> {
  const { periodStart, periodEnd } = getCurrentMonthRange();

  const { data: usageData, error: usageError } = await supabase
    .from("usage_records")
    .select(
      "total_messages, total_tokens_input, total_tokens_output, estimated_cost_usd, total_conversations"
    )
    .eq("organization_id", organizationId)
    .eq("agent_id", agentId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);

  if (usageError) {
    return { data: null, error: usageError.message };
  }

  const { data: conversationIds, error: conversationsError } = await supabase
    .from("conversations")
    .select("id")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId);

  if (conversationsError) {
    return { data: null, error: conversationsError.message };
  }

  const convIds = (conversationIds ?? []).map((row) => (row as { id: string }).id);
  const convByAgent = new Map<string, string[]>([[agentId, convIds]]);
  const latencyByAgent = await fetchAgentLatencyMap(
    supabase,
    organizationId,
    convByAgent,
    periodStart,
    periodEnd
  );

  return {
    data: buildAgentUsage((usageData ?? []) as UsageRow[], latencyByAgent.get(agentId) ?? null),
    error: null,
  };
}

async function fetchAllAgentsUsageFromSnapshot(
  supabase: DatabaseClient,
  organizationId: string,
  agentId?: string
): Promise<DbResult<AgentUsageRow[]>> {
  const { periodStart, periodEnd } = getCurrentMonthRange();

  let agentsQuery = supabase
    .from("agents")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (agentId) {
    agentsQuery = agentsQuery.eq("id", agentId);
  }

  const { data: agents, error: agentsError } = await agentsQuery.order("name", { ascending: true });

  if (agentsError) {
    return { data: null, error: agentsError.message };
  }

  if (!agents || agents.length === 0) {
    return { data: [], error: null };
  }

  let usageQuery = supabase
    .from("usage_records")
    .select(
      "agent_id, total_messages, total_tokens_input, total_tokens_output, estimated_cost_usd, total_conversations, period_start, period_end"
    )
    .eq("organization_id", organizationId)
    .gte("period_start", periodStart)
    .lt("period_end", periodEnd);

  if (agentId) {
    usageQuery = usageQuery.eq("agent_id", agentId);
  }

  const { data: usageData, error: usageError } = await usageQuery;

  if (usageError) {
    return { data: null, error: usageError.message };
  }

  const usageByAgent = new Map<string, UsageRow[]>();
  for (const row of (usageData ?? []) as UsageRow[]) {
    const currentAgentId = row.agent_id;
    if (!currentAgentId) continue;
    const existing = usageByAgent.get(currentAgentId) ?? [];
    existing.push(row);
    usageByAgent.set(currentAgentId, existing);
  }

  const agentIds = (agents as Array<{ id: string; name: string }>).map((agent) => agent.id);
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, agent_id")
    .in("agent_id", agentIds)
    .eq("organization_id", organizationId);

  if (conversationsError) {
    return { data: null, error: conversationsError.message };
  }

  const convByAgent = new Map<string, string[]>();
  for (const conv of (conversations ?? []) as Array<{ id: string; agent_id: string }>) {
    const existing = convByAgent.get(conv.agent_id) ?? [];
    existing.push(conv.id);
    convByAgent.set(conv.agent_id, existing);
  }

  const latencyByAgent = await fetchAgentLatencyMap(
    supabase,
    organizationId,
    convByAgent,
    periodStart,
    periodEnd
  );

  const result: AgentUsageRow[] = (agents as Array<{ id: string; name: string }>).map((agent) => {
    const rows = usageByAgent.get(agent.id) ?? [];
    const usage = buildAgentUsage(rows, latencyByAgent.get(agent.id) ?? null);

    return {
      agentId: agent.id,
      agentName: agent.name,
      ...usage,
    };
  });

  return { data: result, error: null };
}

async function fetchUsageHistoryFromSnapshot(
  supabase: DatabaseClient,
  organizationId: string,
  months: number,
  agentId?: string
): Promise<DbResult<MonthlyUsage[]>> {
  const startDate = getHistoryStartDate(months);

  let historyQuery = supabase
    .from("usage_records")
    .select(
      "period_start, total_messages, total_tokens_input, total_tokens_output, estimated_cost_usd"
    )
    .eq("organization_id", organizationId)
    .gte("period_start", startDate);

  if (agentId) {
    historyQuery = historyQuery.eq("agent_id", agentId);
  }

  const { data: usageData, error: usageError } = await historyQuery.order("period_start", { ascending: true });

  if (usageError) {
    return { data: null, error: usageError.message };
  }

  const grouped = new Map<string, MonthlyUsage>();

  for (const row of (usageData ?? []) as UsageRow[]) {
    const monthKey = row.period_start.slice(0, 7);
    const existing = grouped.get(monthKey);

    if (existing) {
      existing.totalMessages += row.total_messages ?? 0;
      existing.totalTokensInput += row.total_tokens_input ?? 0;
      existing.totalTokensOutput += row.total_tokens_output ?? 0;
      existing.estimatedCostUsd += row.estimated_cost_usd ?? 0;
      continue;
    }

    grouped.set(monthKey, {
      periodStart: row.period_start,
      totalMessages: row.total_messages ?? 0,
      totalTokensInput: row.total_tokens_input ?? 0,
      totalTokensOutput: row.total_tokens_output ?? 0,
      estimatedCostUsd: row.estimated_cost_usd ?? 0,
    });
  }

  return { data: Array.from(grouped.values()), error: null };
}

export async function getOrganizationUsage(
  organizationId: string
): Promise<DbResult<OrganizationUsage>> {
  const supabase = createServiceSupabaseClient();
  await ensureUsageRecordsCurrentForOrganization(organizationId, 1);
  return fetchOrganizationUsageFromSnapshot(supabase, organizationId);
}

export async function getAgentUsage(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentUsage>> {
  const supabase = createServiceSupabaseClient();
  await ensureUsageRecordsCurrentForOrganization(organizationId, 1);
  return fetchAgentUsageFromSnapshot(supabase, agentId, organizationId);
}

export async function getAllAgentsUsage(
  organizationId: string,
  agentId?: string
): Promise<DbResult<AgentUsageRow[]>> {
  const supabase = createServiceSupabaseClient();
  await ensureUsageRecordsCurrentForOrganization(organizationId, 1);
  return fetchAllAgentsUsageFromSnapshot(supabase, organizationId, agentId);
}

export async function getUsageHistory(
  organizationId: string,
  months: number,
  agentId?: string
): Promise<DbResult<MonthlyUsage[]>> {
  const supabase = createServiceSupabaseClient();
  await backfillUsageRecordsForOrganization(organizationId, months);
  return fetchUsageHistoryFromSnapshot(supabase, organizationId, months, agentId);
}

export async function getDashboardUsageData(
  organizationId: string,
  months: number = 6,
  agentId?: string
): Promise<DbResult<DashboardUsageData>> {
  const supabase = createServiceSupabaseClient();
  await backfillUsageRecordsForOrganization(organizationId, months);

  const [usageResult, agentsResult, historyResult] = await Promise.all([
    fetchOrganizationUsageFromSnapshot(supabase, organizationId),
    fetchAllAgentsUsageFromSnapshot(supabase, organizationId, agentId),
    fetchUsageHistoryFromSnapshot(supabase, organizationId, months, agentId),
  ]);

  const error = usageResult.error ?? agentsResult.error ?? historyResult.error;

  if (error || !usageResult.data || !agentsResult.data || !historyResult.data) {
    return { data: null, error: error ?? "No se pudo cargar el dashboard" };
  }

  return {
    data: {
      usage: usageResult.data,
      agents: agentsResult.data,
      history: historyResult.data,
    },
    error: null,
  };
}
