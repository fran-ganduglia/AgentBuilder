import { getActionDefinitionV1 } from "@/lib/runtime/action-catalog";
import type {
  ExecutionContextV1,
  NodeResultV1,
  RuntimeActionV1,
  RuntimeNodeHandlerV1,
  RuntimePolicyContextV1,
  RuntimePolicyEvaluationV1,
  RuntimeResolutionSummaryV1,
} from "@/lib/runtime/types";

const DEFAULT_POLICY_CONTEXT: Required<
  Omit<RuntimePolicyContextV1, "estimatedLlmCost" | "availableTurnBudget">
> = {
  hasAuth: true,
  organizationActive: true,
  agentActive: true,
  integrationActive: true,
  requiredScopesPresent: true,
  actionAllowedByPlan: true,
  actionAllowedByAgent: true,
  actionAllowedByOrganization: true,
  actionSupported: true,
  surfaceAllowed: true,
  channelAllowed: true,
  providerAllowed: true,
  integrationAllowed: true,
  approvalRequiredByPolicy: false,
  riskLevel: "low",
  planName: null,
  surface: "chat_web",
  channel: "web",
  provider: null,
  activeConcurrentRunsForOrganization: 0,
  maxConcurrentRunsForOrganization: null,
  activeConcurrentRunsForAgent: 0,
  maxConcurrentRunsForAgent: null,
  activeRunsForSurface: 0,
  maxRunsForSurface: null,
  dailySideEffectsUsed: 0,
  maxDailySideEffects: null,
  monthlySideEffectsUsed: 0,
  maxMonthlySideEffects: null,
  providerBudgetDecision: "allow",
  estimatedRunCostUsd: null,
  maxEstimatedRunCostUsd: null,
  organizationLlmCostUsdDaily: null,
  maxOrganizationLlmCostUsdDaily: null,
};

const LLM_FORBIDDEN_PARAM_KINDS = new Set(["entity", "reference", "time"]);
const LLM_FORBIDDEN_RESOURCE_FAMILIES = new Set([
  "recipient",
  "datetime",
  "date",
  "time",
  "timezone",
  "record",
  "record_type",
]);

function normalizeResolutionSummary(
  value: unknown
): RuntimeResolutionSummaryV1 {
  if (!value || typeof value !== "object") {
    return {
      resolvedFields: [],
      missingFields: [],
      llmFields: [],
      blockedFields: [],
      ambiguousFields: [],
    };
  }

  const source = value as Partial<RuntimeResolutionSummaryV1>;

  return {
    resolvedFields: Array.isArray(source.resolvedFields)
      ? source.resolvedFields.filter((item): item is string => typeof item === "string")
      : [],
    missingFields: Array.isArray(source.missingFields)
      ? source.missingFields.filter((item): item is string => typeof item === "string")
      : [],
    llmFields: Array.isArray(source.llmFields)
      ? source.llmFields.filter((item): item is string => typeof item === "string")
      : [],
    blockedFields: Array.isArray(source.blockedFields)
      ? source.blockedFields.filter((item): item is string => typeof item === "string")
      : [],
    ambiguousFields: Array.isArray(source.ambiguousFields)
      ? source.ambiguousFields.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizePolicyContext(
  value: unknown
): RuntimePolicyContextV1 {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as RuntimePolicyContextV1;
}

function getCriticalFields(action: RuntimeActionV1): string[] {
  return [...getActionDefinitionV1(action.type).input.minimum];
}

function getLlmRepairPolicy(action: RuntimeActionV1, fields: string[]): {
  eligibleFields: string[];
  forbiddenFields: string[];
} {
  const definition = getActionDefinitionV1(action.type);
  const eligibleFields: string[] = [];
  const forbiddenFields: string[] = [];

  for (const field of fields) {
    const contract = definition.input.params[field];
    if (!contract) {
      forbiddenFields.push(field);
      continue;
    }

    const hasForbiddenKind = contract.allowedKinds.some((kind) => LLM_FORBIDDEN_PARAM_KINDS.has(kind));
    const hasForbiddenFamily = contract.resourceFamily !== undefined &&
      LLM_FORBIDDEN_RESOURCE_FAMILIES.has(contract.resourceFamily);
    const isCritical = contract.criticality === "critical";

    if (isCritical || hasForbiddenKind || hasForbiddenFamily) {
      forbiddenFields.push(field);
      continue;
    }

    eligibleFields.push(field);
  }

  return {
    eligibleFields,
    forbiddenFields,
  };
}

function intersect(values: string[], accepted: Set<string>): string[] {
  return values.filter((value) => accepted.has(value));
}

function getBlockedReason(policy: Required<
  Omit<RuntimePolicyContextV1, "estimatedLlmCost" | "availableTurnBudget">
>): string | null {
  if (!policy.hasAuth) {
    return "missing_auth";
  }

  if (!policy.integrationActive) {
    return "integration_inactive";
  }

  if (!policy.requiredScopesPresent) {
    return "scope_missing";
  }

  if (!policy.organizationActive) {
    return "organization_inactive";
  }

  if (!policy.agentActive) {
    return "agent_inactive";
  }

  if (!policy.channelAllowed) {
    return `channel_blocked:${policy.channel ?? "unknown"}`;
  }

  if (!policy.surfaceAllowed) {
    return `surface_blocked:${policy.surface ?? "unknown"}`;
  }

  if (!policy.providerAllowed) {
    return `provider_blocked:${policy.provider ?? "unknown"}`;
  }

  if (!policy.integrationAllowed) {
    return "integration_blocked";
  }

  if (!policy.actionAllowedByOrganization) {
    return "organization_action_blocked";
  }

  if (!policy.actionAllowedByAgent) {
    return "agent_action_blocked";
  }

  if (!policy.actionAllowedByPlan) {
    return "plan_action_blocked";
  }

  if (!policy.actionSupported) {
    return "action_not_supported";
  }

  return null;
}

function exceedsLimit(
  used: number,
  limit: number | null | undefined
): boolean {
  return limit != null && used >= limit;
}

export function evaluateRuntimeActionPolicyV1(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  resolution?: RuntimeResolutionSummaryV1;
  policyContext?: RuntimePolicyContextV1;
}): RuntimePolicyEvaluationV1 {
  const resolution = input.resolution ?? normalizeResolutionSummary(
    input.action.metadata?.resolution
  );
  const policyOverrides = input.policyContext ?? normalizePolicyContext(
    input.ctx.messageMetadata.runtime_policy_context
  );
  const policy = {
    ...DEFAULT_POLICY_CONTEXT,
    ...policyOverrides,
  };
  const criticalFields = getCriticalFields(input.action);
  const criticalFieldSet = new Set(criticalFields);
  const criticalMissingFields = intersect(resolution.missingFields, criticalFieldSet);
  const criticalAmbiguousFields = intersect(resolution.ambiguousFields, criticalFieldSet);
  const criticalLlmFields = intersect(resolution.llmFields, criticalFieldSet);
  const llmPolicy = getLlmRepairPolicy(input.action, resolution.llmFields);
  const blockedReason = getBlockedReason(policy);
  const requiresApproval =
    input.action.approvalMode === "required" || policy.approvalRequiredByPolicy;
  const llmRepairBudgetAvailable = input.ctx.budget.llmRepairCallsMaxPerAction > 0;
  const llmRepairRequestBudgetAvailable =
    (input.ctx.budget.llmRepairCallsUsedInRequest ?? 0) <
    (input.ctx.budget.llmRepairCallsMaxPerRequest ?? input.ctx.budget.llmRepairCallsMaxPerAction);
  const estimatedLlmCost = policyOverrides.estimatedLlmCost;
  const availableTurnBudget = policyOverrides.availableTurnBudget;
  const llmTurnBudgetAvailable =
    estimatedLlmCost == null ||
    availableTurnBudget == null ||
    estimatedLlmCost <= availableTurnBudget;
  const canUseLlmRepair =
    llmPolicy.eligibleFields.length > 0 &&
    llmRepairBudgetAvailable &&
    llmRepairRequestBudgetAvailable &&
    llmTurnBudgetAvailable;
  const destructiveActionBlocked =
    getActionDefinitionV1(input.action.type).sideEffectKind === "destructive" &&
    (input.ctx.budget.destructiveActionsUsedInRequest ?? 0) >=
      (input.ctx.budget.destructiveActionsMaxPerRequest ?? 1);
  const baseOutput = {
    ...resolution,
    requiresApproval,
    canUseLlmRepair,
    llmEligibleFields: llmPolicy.eligibleFields,
    llmForbiddenFields: llmPolicy.forbiddenFields,
  };

  if (blockedReason) {
    return {
      status: "blocked",
      decision: "block",
      reason: blockedReason,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (
    policy.providerBudgetDecision === "queue" ||
    exceedsLimit(
      policy.activeConcurrentRunsForOrganization,
      policy.maxConcurrentRunsForOrganization
    ) ||
    exceedsLimit(policy.activeConcurrentRunsForAgent, policy.maxConcurrentRunsForAgent) ||
    exceedsLimit(policy.activeRunsForSurface, policy.maxRunsForSurface)
  ) {
    const reason = policy.providerBudgetDecision === "queue"
      ? "provider_budget_queue"
      : exceedsLimit(
          policy.activeConcurrentRunsForOrganization,
          policy.maxConcurrentRunsForOrganization
        )
        ? "organization_concurrency_limit_exceeded"
        : exceedsLimit(policy.activeConcurrentRunsForAgent, policy.maxConcurrentRunsForAgent)
          ? "agent_concurrency_limit_exceeded"
          : "surface_concurrency_limit_exceeded";

    return {
      status: "blocked",
      decision: "queue_for_async",
      reason,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (policy.providerBudgetDecision === "throttle") {
    return {
      status: "blocked",
      decision: "retry",
      reason: "provider_budget_throttled",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (policy.providerBudgetDecision === "reject") {
    return {
      status: "blocked",
      decision: "block",
      reason: "provider_budget_exhausted",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (
    getActionDefinitionV1(input.action.type).sideEffectKind !== "read" &&
    (exceedsLimit(policy.dailySideEffectsUsed, policy.maxDailySideEffects) ||
      exceedsLimit(policy.monthlySideEffectsUsed, policy.maxMonthlySideEffects))
  ) {
    return {
      status: "blocked",
      decision: "block",
      reason: exceedsLimit(policy.dailySideEffectsUsed, policy.maxDailySideEffects)
        ? "daily_side_effect_limit_exceeded"
        : "monthly_side_effect_limit_exceeded",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (
    policy.estimatedRunCostUsd != null &&
    policy.maxEstimatedRunCostUsd != null &&
    policy.estimatedRunCostUsd > policy.maxEstimatedRunCostUsd
  ) {
    return {
      status: "blocked",
      decision: "block",
      reason: "plan_cost_estimate_exceeds_budget",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (
    policy.organizationLlmCostUsdDaily != null &&
    policy.maxOrganizationLlmCostUsdDaily != null &&
    policy.organizationLlmCostUsdDaily >= policy.maxOrganizationLlmCostUsdDaily
  ) {
    return {
      status: "blocked",
      decision: "block",
      reason: "organization_daily_llm_budget_exhausted",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (resolution.blockedFields.length > 0) {
    return {
      status: "blocked",
      decision: "block",
      reason: `blocked_${resolution.blockedFields[0]}`,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (destructiveActionBlocked) {
    return {
      status: "blocked",
      decision: "block",
      reason: "destructive_action_limit_exceeded",
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (criticalAmbiguousFields.length > 0 || resolution.ambiguousFields.length > 0) {
    const ambiguousField = criticalAmbiguousFields[0] ?? resolution.ambiguousFields[0];
    const reason = requiresApproval
      ? `ambiguous_write_target:${ambiguousField}`
      : `ambiguous_${ambiguousField}`;
    return {
      status: "needs_user",
      decision: "ask_user",
      reason,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (criticalMissingFields.length > 0) {
    return {
      status: "needs_user",
      decision: "ask_user",
      reason: `missing_${criticalMissingFields[0]}`,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (criticalLlmFields.length > 0 || llmPolicy.forbiddenFields.length > 0) {
    const sensitiveField = criticalLlmFields[0] ?? llmPolicy.forbiddenFields[0];
    return {
      status: "needs_user",
      decision: "ask_user",
      reason: `sensitive_field_requires_user:${sensitiveField}`,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  if (resolution.llmFields.length > 0) {
    if (!llmRepairBudgetAvailable || !llmRepairRequestBudgetAvailable) {
      return {
        status: "needs_user",
        decision: "ask_user",
        reason: "llm_repair_budget_exhausted",
        requiresApproval,
        criticalFields,
        output: baseOutput,
      };
    }

    if (!llmTurnBudgetAvailable) {
      return {
        status: "blocked",
        decision: "block",
        reason: "turn_budget_exceeded",
        requiresApproval,
        criticalFields,
        output: baseOutput,
      };
    }

    return {
      status: "needs_llm",
      decision: "use_llm",
      reason: `llm_repair_allowed:${llmPolicy.eligibleFields[0]}`,
      requiresApproval,
      criticalFields,
      output: baseOutput,
    };
  }

  return {
    status: "success",
    decision: requiresApproval ? "enqueue_approval" : "execute",
    reason: requiresApproval ? "approval_required" : "ready_to_execute",
    requiresApproval,
    criticalFields,
    output: baseOutput,
  };
}

export function createValidateNodeHandlerV1(input?: {
  getPolicyContext?: (payload: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    resolution: RuntimeResolutionSummaryV1;
  }) => Promise<RuntimePolicyContextV1 | undefined> | RuntimePolicyContextV1 | undefined;
}): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }): Promise<NodeResultV1> => {
    const resolution = normalizeResolutionSummary(action.metadata?.resolution);
    const policyContext = await input?.getPolicyContext?.({
      ctx,
      action,
      resolution,
    });
    const evaluation = evaluateRuntimeActionPolicyV1({
      ctx,
      action,
      resolution,
      policyContext,
    });

    return {
      status: evaluation.status,
      reason: evaluation.reason,
      policyDecision: {
        outcome: evaluation.decision,
        reason: evaluation.reason,
      },
      actionPatch: {
        metadata: {
          ...(action.metadata ?? {}),
          policy: {
            status: evaluation.status,
            decision: evaluation.decision,
            reason: evaluation.reason,
            ...evaluation.output,
          },
        },
      },
      contextPatch: {
        messageMetadata: {
          ...ctx.messageMetadata,
          runtime_policy: {
            status: evaluation.status,
            decision: evaluation.decision,
            reason: evaluation.reason,
            ...evaluation.output,
          },
        },
      },
      output: evaluation.output,
    };
  };
}
