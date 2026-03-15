import "server-only";

import {
  insertProviderBudgetAllocation,
  updateProviderBudgetAllocation,
} from "@/lib/db/provider-budget-allocations";
import { getCounter, incrementCounter } from "@/lib/redis";

const WARNING_THRESHOLDS = [50, 80, 90] as const;

type ProviderBudgetPolicy = {
  methodKey: string;
  limit: number;
  windowSeconds: number;
  thresholds?: readonly number[];
  queueAtRatio?: number;
  throttleAtRatio?: number;
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
  windowKey: string;
  currentUsage: number;
  limit: number;
  ratio: number;
  thresholdReached: number | null;
  blocked: boolean;
};

export type ProviderBudgetWorkflowContext = {
  workflowRunId: string;
  workflowStepId: string;
};

export type ProviderBudgetReservation = ProviderBudgetUsage & {
  allocationId: string | null;
  decision: "allow" | "queue" | "throttle" | "reject";
  retryAfterSeconds: number | null;
};

const PROVIDER_BUDGET_POLICIES: Record<string, ProviderBudgetPolicy[]> = {
  salesforce: [
    {
      methodKey: "salesforce.api_requests",
      limit: 100000,
      windowSeconds: 60 * 60 * 24,
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
    {
      methodKey: "google_workspace.calendar.read_requests",
      limit: 15000,
      windowSeconds: 60,
    },
    {
      methodKey: "google_workspace.calendar.read_requests",
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
};

function buildBudgetKey(input: {
  organizationId: string;
  provider: string;
  methodKey: string;
  windowSeconds: number;
  limit: number;
}): string {
  return [
    "rate_limit",
    "provider_budget",
    input.organizationId,
    input.provider,
    input.methodKey,
    String(input.windowSeconds),
    String(input.limit),
  ].join(":");
}

function buildWindowKey(input: {
  provider: string;
  methodKey: string;
  windowSeconds: number;
  limit: number;
}): string {
  return [
    input.provider,
    input.methodKey,
    `${input.windowSeconds}s`,
    `limit_${input.limit}`,
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

export function decideProviderBudgetAdmission(input: {
  currentUsage: number;
  nextUsage: number;
  policy: ProviderBudgetPolicy;
}): {
  decision: ProviderBudgetReservation["decision"];
  retryAfterSeconds: number | null;
} {
  const projectedRatio = input.nextUsage / input.policy.limit;
  const queueAtRatio = input.policy.queueAtRatio ?? 0.85;
  const throttleAtRatio = input.policy.throttleAtRatio ?? 0.95;

  if (projectedRatio > 1) {
    return {
      decision: "reject",
      retryAfterSeconds: Math.max(15, input.policy.windowSeconds),
    };
  }

  if (projectedRatio >= throttleAtRatio) {
    return {
      decision: "throttle",
      retryAfterSeconds: Math.max(15, input.policy.windowSeconds),
    };
  }

  if (projectedRatio >= queueAtRatio) {
    return {
      decision: "queue",
      retryAfterSeconds: Math.max(5, Math.ceil(input.policy.windowSeconds / 2)),
    };
  }

  return {
    decision: "allow",
    retryAfterSeconds: null,
  };
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
        limit: policy.limit,
      }),
      policy.windowSeconds,
      units
    );

    const ratio = currentUsage / policy.limit;
    usages.push({
      provider: input.provider,
      methodKey: policy.methodKey,
      windowKey: buildWindowKey({
        provider: input.provider,
        methodKey: policy.methodKey,
        windowSeconds: policy.windowSeconds,
        limit: policy.limit,
      }),
      currentUsage,
      limit: policy.limit,
      ratio,
      thresholdReached: getThresholdReached(ratio, policy.thresholds ?? WARNING_THRESHOLDS),
      blocked: currentUsage > policy.limit,
    });
  }

  return usages;
}

export async function reserveProviderBudgetUsage(input: ProviderBudgetUsageInput & {
  workflow: ProviderBudgetWorkflowContext;
}): Promise<ProviderBudgetReservation[]> {
  const policies = PROVIDER_BUDGET_POLICIES[input.provider] ?? [];
  const matchingPolicies = policies.filter((policy) => policy.methodKey === input.methodKey);

  if (matchingPolicies.length === 0) {
    return [];
  }

  const units = Math.max(1, input.units ?? 1);
  const reservations: ProviderBudgetReservation[] = [];

  for (const policy of matchingPolicies) {
    const budgetKey = buildBudgetKey({
      organizationId: input.organizationId,
      provider: input.provider,
      methodKey: input.methodKey,
      windowSeconds: policy.windowSeconds,
      limit: policy.limit,
    });
    const currentUsage = await getCounter(budgetKey);
    const nextUsage = currentUsage + units;
    const ratio = nextUsage / policy.limit;
    const thresholdReached = getThresholdReached(
      ratio,
      policy.thresholds ?? WARNING_THRESHOLDS
    );
    const windowKey = buildWindowKey({
      provider: input.provider,
      methodKey: policy.methodKey,
      windowSeconds: policy.windowSeconds,
      limit: policy.limit,
    });
    const admission = decideProviderBudgetAdmission({
      currentUsage,
      nextUsage,
      policy,
    });

    const finalUsage =
      admission.decision === "allow"
        ? await incrementCounter(budgetKey, policy.windowSeconds, units)
        : currentUsage;

    const allocation = await insertProviderBudgetAllocation({
      organization_id: input.organizationId,
      workflow_run_id: input.workflow.workflowRunId,
      workflow_step_id: input.workflow.workflowStepId,
      provider: input.provider,
      method_key: policy.methodKey,
      window_key: windowKey,
      decision: admission.decision,
      status:
        admission.decision === "allow"
          ? "reserved"
          : admission.decision === "reject"
            ? "rejected"
            : "released",
      units,
      metadata: {
        current_usage: currentUsage,
        reserved_usage: finalUsage,
        projected_usage: nextUsage,
        limit: policy.limit,
        ratio,
        threshold_reached: thresholdReached,
        retry_after_seconds: admission.retryAfterSeconds,
      },
    });

    reservations.push({
      provider: input.provider,
      methodKey: policy.methodKey,
      windowKey,
      currentUsage: finalUsage,
      limit: policy.limit,
      ratio,
      thresholdReached,
      blocked: admission.decision === "reject",
      decision: admission.decision,
      allocationId: allocation.data?.id ?? null,
      retryAfterSeconds: admission.retryAfterSeconds,
    });
  }

  return reservations;
}

export async function finalizeProviderBudgetReservations(input: {
  organizationId: string;
  reservations: ProviderBudgetReservation[];
  status: "consumed" | "released";
}): Promise<void> {
  await Promise.all(
    input.reservations
      .filter((reservation) => reservation.allocationId && reservation.decision === "allow")
      .map((reservation) =>
        updateProviderBudgetAllocation(input.organizationId, reservation.allocationId!, {
          status: input.status,
          consumed_at: input.status === "consumed" ? new Date().toISOString() : null,
          released_at: input.status === "released" ? new Date().toISOString() : null,
        })
      )
  );
}
