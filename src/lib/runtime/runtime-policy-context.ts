import "server-only";

import { getActionDefinitionV1 } from "@/lib/runtime/action-catalog";
import { getRuntimeActionSurface, isRuntimeActionAllowedForAgent, type RuntimeAvailabilityLike } from "@/lib/runtime/chat-route";
import { getOrganizationPlan } from "@/lib/db/organization-plans";
import { getCurrentMonthRuntimeUsageSummary } from "@/lib/db/runtime-usage-events";
import { getRuntimeRunCounts } from "@/lib/db/runtime-runs";
import { estimateRuntimeActionCostUsd } from "@/lib/runtime/pricing";
import type {
  ExecutionContextV1,
  RuntimeActionPlan,
  RuntimeActionV1,
  RuntimePolicyContextV1,
  RuntimeRiskLevelV1,
  RuntimeSurfaceV1,
} from "@/lib/runtime/types";

type RuntimePolicyDefaultsV1 = {
  maxConcurrentRunsForOrganization: number | null;
  maxConcurrentRunsForAgent: number | null;
  maxDailySideEffects: number | null;
  maxMonthlySideEffects: number | null;
  maxEstimatedRunCostUsd: number | null;
  maxOrganizationLlmCostUsdDaily: number | null;
  maxRunsForSurface: Partial<Record<RuntimeSurfaceV1, number | null>>;
};

const RUNTIME_POLICY_DEFAULTS_BY_PLAN: Record<string, RuntimePolicyDefaultsV1> = {
  trial: {
    maxConcurrentRunsForOrganization: 2,
    maxConcurrentRunsForAgent: 1,
    maxDailySideEffects: 10,
    maxMonthlySideEffects: 100,
    maxEstimatedRunCostUsd: 0.15,
    maxOrganizationLlmCostUsdDaily: 1.5,
    maxRunsForSurface: {
      chat_web: 2,
      api_run: 0,
      automation: 1,
      worker: 2,
      approval_continuation: 2,
      webhook: 0,
    },
  },
  starter: {
    maxConcurrentRunsForOrganization: 5,
    maxConcurrentRunsForAgent: 2,
    maxDailySideEffects: 50,
    maxMonthlySideEffects: 500,
    maxEstimatedRunCostUsd: 0.5,
    maxOrganizationLlmCostUsdDaily: 10,
    maxRunsForSurface: {
      chat_web: 4,
      api_run: 0,
      automation: 2,
      worker: 5,
      approval_continuation: 4,
      webhook: 0,
    },
  },
  growth: {
    maxConcurrentRunsForOrganization: 15,
    maxConcurrentRunsForAgent: 5,
    maxDailySideEffects: 200,
    maxMonthlySideEffects: 5000,
    maxEstimatedRunCostUsd: 1.5,
    maxOrganizationLlmCostUsdDaily: 40,
    maxRunsForSurface: {
      chat_web: 8,
      api_run: 6,
      automation: 6,
      worker: 15,
      approval_continuation: 8,
      webhook: 4,
    },
  },
  scale: {
    maxConcurrentRunsForOrganization: 40,
    maxConcurrentRunsForAgent: 10,
    maxDailySideEffects: 1000,
    maxMonthlySideEffects: 20000,
    maxEstimatedRunCostUsd: 4,
    maxOrganizationLlmCostUsdDaily: 150,
    maxRunsForSurface: {
      chat_web: 15,
      api_run: 12,
      automation: 12,
      worker: 40,
      approval_continuation: 15,
      webhook: 8,
    },
  },
  enterprise: {
    maxConcurrentRunsForOrganization: null,
    maxConcurrentRunsForAgent: null,
    maxDailySideEffects: null,
    maxMonthlySideEffects: null,
    maxEstimatedRunCostUsd: null,
    maxOrganizationLlmCostUsdDaily: null,
    maxRunsForSurface: {
      chat_web: null,
      api_run: null,
      automation: null,
      worker: null,
      approval_continuation: null,
      webhook: null,
    },
  },
};

function getRiskLevelForAction(action: RuntimeActionV1): RuntimeRiskLevelV1 {
  const definition = getActionDefinitionV1(action.type);
  if (definition.sideEffectKind === "destructive") {
    return "high";
  }
  if (definition.sideEffectKind === "write") {
    return "medium";
  }
  return "low";
}

function estimateActionPlanCostUsd(actionPlan: RuntimeActionPlan): number {
  return actionPlan.actions.reduce(
    (total, action) => total + estimateRuntimeActionCostUsd(action.type),
    0
  );
}

function isSurfaceAllowedByPlan(input: {
  features: Record<string, unknown>;
  surface: RuntimeSurfaceV1;
}): boolean {
  if (input.surface === "chat_web" || input.surface === "worker" || input.surface === "approval_continuation") {
    return true;
  }

  if (input.surface === "api_run") {
    return input.features.api_access === true;
  }

  if (input.surface === "webhook") {
    return input.features.webhooks_enabled === true;
  }

  return true;
}

function isChannelAllowedByPlan(input: {
  features: Record<string, unknown>;
  channel: ExecutionContextV1["channel"];
}): boolean {
  if (!input.channel) {
    return true;
  }

  const allowedChannels = Array.isArray(input.features.allowed_channels)
    ? input.features.allowed_channels.filter((value): value is string => typeof value === "string")
    : [];

  return allowedChannels.length === 0 || allowedChannels.includes(input.channel);
}

export async function buildRuntimePolicyContextV1(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  actionPlan: RuntimeActionPlan;
  runtimes: RuntimeAvailabilityLike;
}): Promise<RuntimePolicyContextV1> {
  const organizationPlanResult = await getOrganizationPlan(input.ctx.organizationId);
  const plan = organizationPlanResult.data;
  const planName = plan?.name ?? null;
  const defaults = planName
    ? RUNTIME_POLICY_DEFAULTS_BY_PLAN[planName]
    : RUNTIME_POLICY_DEFAULTS_BY_PLAN.starter;
  const features = (plan?.features && typeof plan.features === "object" && !Array.isArray(plan.features)
    ? plan.features
    : {}) as Record<string, unknown>;
  const surface = input.ctx.surface ?? "chat_web";
  const provider = getRuntimeActionSurface(input.action.type);
  const riskLevel = getRiskLevelForAction(input.action);
  const runCountsResult = await getRuntimeRunCounts({
    organizationId: input.ctx.organizationId,
    agentId: input.ctx.agentId,
  });
  const usageSummaryResult = await getCurrentMonthRuntimeUsageSummary(input.ctx.organizationId);
  const estimatedRunCostUsd = estimateActionPlanCostUsd(input.actionPlan);
  const surfaceAllowed = isSurfaceAllowedByPlan({ features, surface });
  const channelAllowed = isChannelAllowedByPlan({
    features,
    channel: input.ctx.channel,
  });

  return {
    hasAuth: true,
    organizationActive: true,
    agentActive: true,
    integrationActive: input.runtimes[provider] !== null,
    requiredScopesPresent: input.runtimes[provider] !== null,
    actionAllowedByPlan: true,
    actionAllowedByAgent: isRuntimeActionAllowedForAgent(input.action.type, input.runtimes),
    actionAllowedByOrganization: true,
    actionSupported: true,
    surfaceAllowed,
    channelAllowed,
    providerAllowed: true,
    integrationAllowed: input.runtimes[provider] !== null,
    approvalRequiredByPolicy: riskLevel !== "low",
    riskLevel,
    planName,
    surface,
    channel: input.ctx.channel,
    provider,
    activeConcurrentRunsForOrganization: runCountsResult.data?.activeOrganizationRuns ?? 0,
    maxConcurrentRunsForOrganization: defaults.maxConcurrentRunsForOrganization,
    activeConcurrentRunsForAgent: runCountsResult.data?.activeAgentRuns ?? 0,
    maxConcurrentRunsForAgent: defaults.maxConcurrentRunsForAgent,
    activeRunsForSurface: runCountsResult.data?.activeSurfaceRuns ?? 0,
    maxRunsForSurface: defaults.maxRunsForSurface[surface] ?? null,
    dailySideEffectsUsed: usageSummaryResult.data?.dailyEstimatedSideEffects ?? 0,
    maxDailySideEffects: defaults.maxDailySideEffects,
    monthlySideEffectsUsed: usageSummaryResult.data?.monthlyEstimatedSideEffects ?? 0,
    maxMonthlySideEffects: defaults.maxMonthlySideEffects,
    estimatedRunCostUsd,
    maxEstimatedRunCostUsd: defaults.maxEstimatedRunCostUsd,
    organizationLlmCostUsdDaily: usageSummaryResult.data?.dailyEstimatedCostUsd ?? 0,
    maxOrganizationLlmCostUsdDaily: defaults.maxOrganizationLlmCostUsdDaily,
    estimatedLlmCost: riskLevel === "low" ? 0.005 : 0.015,
    availableTurnBudget: defaults.maxEstimatedRunCostUsd ?? null,
  };
}
