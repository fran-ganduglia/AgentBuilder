import "server-only";

import { getOrganizationPlan } from "@/lib/db/organization-plans";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type SessionLimitCheckResult = {
  allowed: boolean;
  currentSessions: number;
  planLimit: number | null;
  message?: string;
};

function getCurrentMonthRange(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

async function hasAssistantReplyThisMonth(
  organizationId: string,
  conversationId: string
): Promise<boolean> {
  const serviceClient = createServiceSupabaseClient();
  const { periodStart, periodEnd } = getCurrentMonthRange();

  const { data, error } = await serviceClient
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function countDistinctSessionsThisMonth(
  organizationId: string
): Promise<number> {
  const serviceClient = createServiceSupabaseClient();
  const { periodStart, periodEnd } = getCurrentMonthRange();

  const { data, error } = await serviceClient
    .from("messages")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("role", "assistant")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? [])
      .map((row) => row.conversation_id)
      .filter((conversationId): conversationId is string => typeof conversationId === "string")
  ).size;
}

export async function getCurrentOrganizationSessionUsage(
  organizationId: string
): Promise<{ currentSessions: number; planLimit: number | null }> {
  const planResult = await getOrganizationPlan(organizationId);

  if (planResult.error || !planResult.data) {
    throw new Error(planResult.error ?? "No se pudo obtener el plan de la organizacion");
  }

  const currentSessions = await countDistinctSessionsThisMonth(organizationId);

  return {
    currentSessions,
    planLimit: planResult.data.config.maxSessionsMonth,
  };
}

export async function checkSessionLimitForConversation(input: {
  organizationId: string;
  conversationId: string;
}): Promise<SessionLimitCheckResult> {
  const planResult = await getOrganizationPlan(input.organizationId);

  if (planResult.error || !planResult.data) {
    return {
      allowed: false,
      currentSessions: 0,
      planLimit: null,
      message: planResult.error ?? "No se pudo verificar el plan",
    };
  }

  const planLimit = planResult.data.config.maxSessionsMonth;

  if (planLimit === null || planLimit <= 0) {
    return {
      allowed: true,
      currentSessions: 0,
      planLimit,
    };
  }

  const [alreadyCounted, currentSessions] = await Promise.all([
    hasAssistantReplyThisMonth(input.organizationId, input.conversationId),
    countDistinctSessionsThisMonth(input.organizationId),
  ]);

  if (alreadyCounted) {
    return {
      allowed: true,
      currentSessions,
      planLimit,
    };
  }

  if (currentSessions >= planLimit) {
    return {
      allowed: false,
      currentSessions,
      planLimit,
      message: `Limite de sesiones alcanzado (${planLimit}/mes). Actualiza tu plan para seguir atendiendo nuevas conversaciones.`,
    };
  }

  return {
    allowed: true,
    currentSessions,
    planLimit,
  };
}
