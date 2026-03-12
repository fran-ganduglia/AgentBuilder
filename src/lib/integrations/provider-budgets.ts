import "server-only";

import { incrementCounter } from "@/lib/redis";

const WARNING_THRESHOLDS = [50, 80, 90] as const;

type ProviderBudgetPolicy = {
  methodKey: string;
  limit: number;
  windowSeconds: number;
  thresholds?: readonly number[];
};

export type ProviderBudgetUsageInput = {
  provider: string;
  organizationId: string;
  methodKey: string;
  units?: number;
};

export type ProviderBudgetUsage = {
  provider: string;
  methodKey: string;
  currentUsage: number;
  limit: number;
  ratio: number;
  thresholdReached: number | null;
  blocked: boolean;
};

const PROVIDER_BUDGET_POLICIES: Record<string, ProviderBudgetPolicy[]> = {
  salesforce: [
    {
      methodKey: "salesforce.api_requests",
      limit: 100000,
      windowSeconds: 60 * 60 * 24,
    },
  ],
  hubspot: [
    {
      methodKey: "hubspot.oauth_public_api",
      limit: 110,
      windowSeconds: 10,
    },
  ],
  google_workspace: [
    {
      methodKey: "google_workspace.gmail.user_quota",
      limit: 15000,
      windowSeconds: 60,
    },
    {
      methodKey: "google_workspace.gmail.project_quota",
      limit: 1200000,
      windowSeconds: 60,
    },
  ],
  slack: [
    {
      methodKey: "slack.chat.postMessage",
      limit: 1,
      windowSeconds: 1,
      thresholds: [100],
    },
  ],
  microsoft_teams: [
    {
      methodKey: "microsoft_teams.graph.channel_messages",
      limit: 1,
      windowSeconds: 1,
      thresholds: [100],
    },
  ],
};

function buildBudgetKey(input: {
  organizationId: string;
  provider: string;
  methodKey: string;
  windowSeconds: number;
}): string {
  return [
    "rate_limit",
    "provider_budget",
    input.organizationId,
    input.provider,
    input.methodKey,
    String(input.windowSeconds),
  ].join(":");
}

function getThresholdReached(
  ratio: number,
  thresholds: readonly number[]
): number | null {
  const reached = [...thresholds].sort((left, right) => right - left)
    .find((threshold) => ratio >= threshold / 100);

  return reached ?? null;
}

export async function recordProviderBudgetUsage(
  input: ProviderBudgetUsageInput
): Promise<ProviderBudgetUsage[]> {
  const policies = PROVIDER_BUDGET_POLICIES[input.provider] ?? [];
  const matchingPolicies = policies.filter((policy) => policy.methodKey === input.methodKey);

  if (matchingPolicies.length === 0) {
    return [];
  }

  const units = Math.max(1, input.units ?? 1);
  const usages: ProviderBudgetUsage[] = [];

  for (const policy of matchingPolicies) {
    const currentUsage = await incrementCounter(
      buildBudgetKey({
        organizationId: input.organizationId,
        provider: input.provider,
        methodKey: input.methodKey,
        windowSeconds: policy.windowSeconds,
      }),
      policy.windowSeconds,
      units
    );

    const ratio = currentUsage / policy.limit;
    usages.push({
      provider: input.provider,
      methodKey: policy.methodKey,
      currentUsage,
      limit: policy.limit,
      ratio,
      thresholdReached: getThresholdReached(ratio, policy.thresholds ?? WARNING_THRESHOLDS),
      blocked: currentUsage > policy.limit,
    });
  }

  return usages;
}
