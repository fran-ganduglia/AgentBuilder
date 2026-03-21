import {
  getWorkflowActionMatrixEntry,
  hasWorkflowActionMatrixEntry,
} from "@/lib/workflows/action-matrix";

import type {
  FailureKind,
  PolicyDecision,
  PolicyEvaluator,
  PolicyEvaluatorInput,
} from "./types";

function mapFailureKindToPolicyDecision(
  failure: FailureKind | undefined
): Exclude<PolicyDecision, "execute"> {
  switch (failure) {
    case "missing_data":
      return "llm_fallback";
    case "ambiguous_reference":
    case "low_confidence":
      return "clarify_user";
    case "approval_required":
      return "enqueue_approval";
    case "provider_retryable":
      return "retry_technical";
    case "auth":
    case "scope":
    case "budget":
    case "provider_fatal":
    default:
      return "fail_closed";
  }
}

export function evaluateActionPolicy<TResolvedParams>(
  input: PolicyEvaluatorInput<TResolvedParams>
): PolicyDecision {
  if (input.resolverResult.status !== "ok") {
    return mapFailureKindToPolicyDecision(input.resolverResult.failure);
  }

  if (input.action.requiresApprovalHint || input.definition.executionMode === "approval_async") {
    return "enqueue_approval";
  }

  if (
    hasWorkflowActionMatrixEntry(input.definition.provider, input.definition.type)
  ) {
    const policy = getWorkflowActionMatrixEntry(
      input.definition.provider,
      input.definition.type
    );

    if (policy.requiresConfirmation || policy.approvalMode === "always") {
      return "enqueue_approval";
    }
  }

  return "execute";
}

export function createActionPolicyEvaluator<TResolvedParams>(): PolicyEvaluator<TResolvedParams> {
  return (input) => evaluateActionPolicy(input);
}
