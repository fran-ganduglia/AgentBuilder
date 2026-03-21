import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { resolveProviderFromModel } from "@/lib/llm/model-routing";

export { resolveProviderFromModel };

type IncrementMessageCountInput = {
  organizationId: string;
  agentId: string;
  llmProvider: string;
};

function getCurrentPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

export async function incrementMessageCount(
  input: IncrementMessageCountInput
): Promise<number | null> {
  const supabase = createServiceSupabaseClient();
  const { periodStart, periodEnd } = getCurrentPeriod();

  const { data, error } = await supabase.rpc("increment_usage_messages", {
    p_organization_id: input.organizationId,
    p_agent_id: input.agentId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_llm_provider: input.llmProvider,
  });

  if (error) {
    console.error("usage_records.increment_error", { error: error.message });
    return null;
  }

  return data ?? null;
}

export async function getOrganizationPlanLimit(organizationId: string): Promise<number> {
  const supabase = createServiceSupabaseClient();

  const { data: orgData } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .single();

  if (!orgData) return 0;

  const { data: planData } = await supabase
    .from("plans")
    .select("max_messages_month")
    .eq("id", orgData.plan_id)
    .single();

  return planData?.max_messages_month ?? 0;
}
