import assert from "node:assert/strict";

import {
  computeWorkflowRetryDelayMs,
  decideRunAfterStepCompletion,
  decideRunAfterStepFailure,
  getLatestWorkflowSteps,
  normalizeWorkflowExecutionError,
  shouldRetryWorkflowStep,
  type WorkflowEngineStep,
} from "./execution-engine";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

function buildStep(input: Partial<WorkflowEngineStep> & Pick<WorkflowEngineStep, "id" | "step_id" | "step_index">): WorkflowEngineStep {
  return {
    id: input.id,
    step_id: input.step_id,
    step_index: input.step_index,
    status: input.status ?? "queued",
    is_required: input.is_required ?? true,
    attempt: input.attempt ?? 1,
    max_attempts: input.max_attempts ?? 3,
    compensation_action: input.compensation_action ?? null,
  };
}

function runRetryPolicyTests(): void {
  const normalized = normalizeWorkflowExecutionError(
    new ProviderRequestError({
      provider: "salesforce",
      message: "Too many requests",
      statusCode: 429,
      retryAfterSeconds: 12,
    })
  );

  assert.equal(normalized.code, "rate_limited");
  assert.equal(normalized.retryable, true);
  assert.equal(normalized.retryAfterMs, 12_000);
  assert.equal(
    shouldRetryWorkflowStep(buildStep({ id: "s1", step_id: "step-1", step_index: 1 }), normalized),
    true
  );
  assert.equal(
    computeWorkflowRetryDelayMs(
      buildStep({ id: "s1", step_id: "step-1", step_index: 1 }),
      normalized
    ),
    12_000
  );

  const validation = normalizeWorkflowExecutionError(new Error("Entrada no valida"));
  assert.equal(validation.code, "validation_error");
  assert.equal(validation.retryable, false);

  const queuedBudget = normalizeWorkflowExecutionError(
    new ProviderRequestError({
      provider: "salesforce",
      message: "Queued by allocator",
      statusCode: 429,
      retryAfterSeconds: 20,
      errorCode: "budget_queued",
    })
  );
  assert.equal(queuedBudget.code, "budget_queued");
  assert.equal(queuedBudget.retryable, true);
  assert.equal(queuedBudget.retryAfterMs, 20_000);

  const throttledBudget = normalizeWorkflowExecutionError(
    new ProviderRequestError({
      provider: "salesforce",
      message: "Throttled by allocator",
      statusCode: 429,
      retryAfterSeconds: 45,
      errorCode: "budget_throttled",
    })
  );
  assert.equal(throttledBudget.code, "budget_throttled");
  assert.equal(throttledBudget.retryable, true);
  assert.equal(throttledBudget.retryAfterMs, 45_000);

  const exhaustedBudget = normalizeWorkflowExecutionError(
    new ProviderRequestError({
      provider: "salesforce",
      message: "Rejected by allocator",
      statusCode: 429,
      retryAfterSeconds: 60,
      errorCode: "budget_exhausted",
    })
  );
  assert.equal(exhaustedBudget.code, "budget_exhausted");
  assert.equal(exhaustedBudget.retryable, false);
  assert.equal(exhaustedBudget.retryAfterMs, 60_000);
}

function runLatestAttemptTests(): void {
  const latest = getLatestWorkflowSteps([
    buildStep({ id: "step-a-1", step_id: "step-a", step_index: 1, attempt: 1, status: "failed" }),
    buildStep({ id: "step-a-2", step_id: "step-a", step_index: 1, attempt: 2, status: "queued" }),
    buildStep({ id: "step-b-1", step_id: "step-b", step_index: 2, attempt: 1, status: "waiting_approval" }),
  ]);

  assert.deepEqual(
    latest.map((step) => step.id),
    ["step-a-2", "step-b-1"]
  );
}

function runCompletionTransitionTests(): void {
  const decision = decideRunAfterStepCompletion({
    steps: [
      buildStep({ id: "step-1", step_id: "step-1", step_index: 1, status: "completed" }),
      buildStep({ id: "step-2", step_id: "step-2", step_index: 2, status: "queued" }),
    ],
    currentStepId: "step-1",
  });

  assert.equal(decision.runStatus, "queued");
  assert.equal(decision.currentStepId, "step-2");
  assert.equal(decision.nextStepToEnqueueId, "step-2");
  assert.equal(decision.finished, false);
}

function runFailureTransitionTests(): void {
  const requiredFailure = decideRunAfterStepFailure({
    steps: [
      buildStep({
        id: "step-1",
        step_id: "step-1",
        step_index: 1,
        status: "completed",
        compensation_action: "undo_contact",
      }),
      buildStep({
        id: "step-2",
        step_id: "step-2",
        step_index: 2,
        status: "failed",
      }),
    ],
    currentStepId: "step-2",
    failureReason: "execution_failed",
  });

  assert.equal(requiredFailure.runStatus, "manual_repair_required");
  assert.deepEqual(requiredFailure.markCompensationPendingStepIds, ["step-1"]);

  const optionalFailure = decideRunAfterStepFailure({
    steps: [
      buildStep({
        id: "step-1",
        step_id: "step-1",
        step_index: 1,
        status: "failed",
        is_required: false,
      }),
      buildStep({
        id: "step-2",
        step_id: "step-2",
        step_index: 2,
        status: "waiting_approval",
      }),
    ],
    currentStepId: "step-1",
    failureReason: "approval_rejected",
  });

  assert.equal(optionalFailure.runStatus, "waiting_approval");
  assert.equal(optionalFailure.currentStepId, "step-2");
  assert.equal(optionalFailure.nextStepToEnqueueId, null);

  const expiredFirstStep = decideRunAfterStepFailure({
    steps: [
      buildStep({
        id: "step-1",
        step_id: "step-1",
        step_index: 1,
        status: "failed_due_to_expired_approval",
      }),
    ],
    currentStepId: "step-1",
    failureReason: "approval_expired",
  });

  assert.equal(expiredFirstStep.runStatus, "blocked");
}

function main(): void {
  runRetryPolicyTests();
  runLatestAttemptTests();
  runCompletionTransitionTests();
  runFailureTransitionTests();
  console.log("workflow execution engine checks passed");
}

main();

export {};
