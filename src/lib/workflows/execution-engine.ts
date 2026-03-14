import { isProviderRequestError } from "@/lib/integrations/provider-errors";

export type WorkflowEngineStep = {
  id: string;
  step_id: string;
  step_index: number;
  status: string;
  is_required: boolean;
  attempt: number;
  max_attempts: number;
  compensation_action: string | null;
};

export type WorkflowExecutionError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
};

export type WorkflowRunTransitionDecision = {
  runStatus:
    | "queued"
    | "running"
    | "waiting_approval"
    | "failed"
    | "completed"
    | "partially_completed"
    | "manual_repair_required"
    | "blocked";
  currentStepId: string | null;
  nextStepToEnqueueId: string | null;
  markCompensationPendingStepIds: string[];
  finished: boolean;
};

const WORKFLOW_RETRY_BASE_DELAY_MS = 30_000;
const WORKFLOW_RETRY_MAX_DELAY_MS = 15 * 60 * 1000;

function isStepFailureStatus(status: string): boolean {
  return (
    status === "failed" ||
    status === "failed_due_to_expired_approval" ||
    status === "manual_repair_required" ||
    status === "blocked"
  );
}

function isOptionalStepDegraded(status: string): boolean {
  return isStepFailureStatus(status) || status === "skipped";
}

export function getLatestWorkflowSteps(
  steps: WorkflowEngineStep[]
): WorkflowEngineStep[] {
  const latestByStepId = new Map<string, WorkflowEngineStep>();

  for (const step of steps) {
    const current = latestByStepId.get(step.step_id);
    if (!current || step.attempt > current.attempt) {
      latestByStepId.set(step.step_id, step);
    }
  }

  return Array.from(latestByStepId.values()).sort((left, right) => {
    if (left.step_index !== right.step_index) {
      return left.step_index - right.step_index;
    }

    return left.attempt - right.attempt;
  });
}

function getCurrentLatestStep(
  steps: WorkflowEngineStep[],
  currentStepId: string
): WorkflowEngineStep | null {
  return getLatestWorkflowSteps(steps).find((step) => step.id === currentStepId) ?? null;
}

function getNextPendingStep(
  steps: WorkflowEngineStep[],
  currentStep: WorkflowEngineStep
): WorkflowEngineStep | null {
  return (
    getLatestWorkflowSteps(steps).find(
      (step) =>
        step.step_index > currentStep.step_index &&
        (step.status === "queued" ||
          step.status === "waiting_approval" ||
          step.status === "running")
    ) ?? null
  );
}

function getPreviousCompletedSteps(
  steps: WorkflowEngineStep[],
  currentStep: WorkflowEngineStep
): WorkflowEngineStep[] {
  return getLatestWorkflowSteps(steps).filter(
    (step) => step.step_index < currentStep.step_index && step.status === "completed"
  );
}

export function buildWorkflowStepIdempotencyKey(
  workflowRunId: string,
  stepId: string,
  attempt: number
): string {
  return `${workflowRunId}:${stepId}:${attempt}`;
}

export function computeWorkflowRetryDelayMs(
  step: Pick<WorkflowEngineStep, "attempt">,
  error: Pick<WorkflowExecutionError, "retryAfterMs">
): number {
  if (error.retryAfterMs && error.retryAfterMs > 0) {
    return error.retryAfterMs;
  }

  return Math.min(
    WORKFLOW_RETRY_BASE_DELAY_MS * Math.max(1, 2 ** Math.max(0, step.attempt - 1)),
    WORKFLOW_RETRY_MAX_DELAY_MS
  );
}

export function shouldRetryWorkflowStep(
  step: Pick<WorkflowEngineStep, "attempt" | "max_attempts">,
  error: Pick<WorkflowExecutionError, "retryable">
): boolean {
  return error.retryable && step.attempt < step.max_attempts;
}

export function normalizeWorkflowExecutionError(error: unknown): WorkflowExecutionError {
  if (isProviderRequestError(error)) {
    const message = error.message || "Error del proveedor";
    const normalized = message.toLowerCase();

    if (error.statusCode === 401) {
      return {
        code: "reauth_required",
        message: "La integracion necesita reautenticacion antes de completar este step.",
        retryable: false,
        retryAfterMs: null,
      };
    }

    if (error.statusCode === 403) {
      return {
        code: normalized.includes("scope") ? "scope_missing" : "reauth_required",
        message: normalized.includes("scope")
          ? "La integracion no tiene permisos suficientes para completar este step."
          : "La integracion necesita reautenticacion antes de completar este step.",
        retryable: false,
        retryAfterMs: null,
      };
    }

    if (error.statusCode === 429) {
      if (error.errorCode === "budget_queued") {
        return {
          code: "budget_queued",
          message: "El allocator del proveedor puso este step en cola antes de consumir quota.",
          retryable: true,
          retryAfterMs: error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : null,
        };
      }

      if (error.errorCode === "budget_throttled") {
        return {
          code: "budget_throttled",
          message: "El allocator del proveedor pidio desacelerar este step antes de consumir quota.",
          retryable: true,
          retryAfterMs: error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : null,
        };
      }

      if (error.errorCode === "budget_exhausted") {
        return {
          code: "budget_exhausted",
          message: "El presupuesto temporal del proveedor no permite completar este step ahora.",
          retryable: false,
          retryAfterMs: error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : null,
        };
      }

      return {
        code: "rate_limited",
        message: "El proveedor pidio bajar la velocidad antes de completar este step.",
        retryable: true,
        retryAfterMs: error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : null,
      };
    }

    if (error.statusCode !== null && error.statusCode >= 500) {
      return {
        code: "provider_error",
        message,
        retryable: true,
        retryAfterMs: null,
      };
    }

    return {
      code: error.statusCode !== null && error.statusCode >= 400 ? "validation_error" : "provider_error",
      message,
      retryable: false,
      retryAfterMs: null,
    };
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : "Error desconocido al ejecutar el workflow step.";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("reautentic")) {
    return {
      code: "reauth_required",
      message: "La integracion necesita reautenticacion antes de completar este step.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (normalized.includes("scope")) {
    return {
      code: "scope_missing",
      message: "La integracion no tiene permisos suficientes para completar este step.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (normalized.includes("velocidad") || normalized.includes("rate")) {
    return {
      code: "rate_limited",
      message: "El proveedor pidio bajar la velocidad antes de completar este step.",
      retryable: true,
      retryAfterMs: null,
    };
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("time out") ||
    normalized.includes("tiempo maximo") ||
    normalized.includes("tempor")
  ) {
    return {
      code: "provider_error",
      message: rawMessage,
      retryable: true,
      retryAfterMs: null,
    };
  }

  if (normalized.includes("presupuesto") || normalized.includes("quota")) {
    return {
      code: "budget_exhausted",
      message: "El presupuesto temporal del proveedor no permite completar este step ahora.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (
    normalized.includes("valida") ||
    normalized.includes("inválid") ||
    normalized.includes("invÃ¡lid") ||
    normalized.includes("inval")
  ) {
    return {
      code: "validation_error",
      message: rawMessage,
      retryable: false,
      retryAfterMs: null,
    };
  }

  return {
    code: "provider_error",
    message: rawMessage,
    retryable: false,
    retryAfterMs: null,
  };
}

export function decideRunAfterStepCompletion(input: {
  steps: WorkflowEngineStep[];
  currentStepId: string;
}): WorkflowRunTransitionDecision {
  const currentStep = getCurrentLatestStep(input.steps, input.currentStepId);
  if (!currentStep) {
    return {
      runStatus: "completed",
      currentStepId: null,
      nextStepToEnqueueId: null,
      markCompensationPendingStepIds: [],
      finished: true,
    };
  }

  const nextStep = getNextPendingStep(input.steps, currentStep);

  if (nextStep) {
    return {
      runStatus:
        nextStep.status === "waiting_approval"
          ? "waiting_approval"
          : nextStep.status === "running"
            ? "running"
            : "queued",
      currentStepId: nextStep.step_id,
      nextStepToEnqueueId: nextStep.status === "queued" ? nextStep.id : null,
      markCompensationPendingStepIds: [],
      finished: false,
    };
  }

  const hasOptionalDegradation = getLatestWorkflowSteps(input.steps).some(
    (step) => !step.is_required && isOptionalStepDegraded(step.status)
  );

  return {
    runStatus: hasOptionalDegradation ? "partially_completed" : "completed",
    currentStepId: currentStep.step_id,
    nextStepToEnqueueId: null,
    markCompensationPendingStepIds: [],
    finished: true,
  };
}

export function decideRunAfterStepFailure(input: {
  steps: WorkflowEngineStep[];
  currentStepId: string;
  failureReason: "execution_failed" | "approval_rejected" | "approval_expired";
}): WorkflowRunTransitionDecision {
  const currentStep = getCurrentLatestStep(input.steps, input.currentStepId);
  if (!currentStep) {
    return {
      runStatus: "failed",
      currentStepId: null,
      nextStepToEnqueueId: null,
      markCompensationPendingStepIds: [],
      finished: true,
    };
  }

  if (!currentStep.is_required) {
    const nextStep = getNextPendingStep(input.steps, currentStep);
    if (nextStep) {
      return {
        runStatus:
          nextStep.status === "waiting_approval"
            ? "waiting_approval"
            : nextStep.status === "running"
              ? "running"
              : "queued",
        currentStepId: nextStep.step_id,
        nextStepToEnqueueId: nextStep.status === "queued" ? nextStep.id : null,
        markCompensationPendingStepIds: [],
        finished: false,
      };
    }

    return {
      runStatus: "partially_completed",
      currentStepId: currentStep.step_id,
      nextStepToEnqueueId: null,
      markCompensationPendingStepIds: [],
      finished: true,
    };
  }

  const previousCompletedSteps = getPreviousCompletedSteps(input.steps, currentStep);
  if (previousCompletedSteps.length > 0) {
    return {
      runStatus: "manual_repair_required",
      currentStepId: currentStep.step_id,
      nextStepToEnqueueId: null,
      markCompensationPendingStepIds: previousCompletedSteps
        .filter((step) => Boolean(step.compensation_action))
        .map((step) => step.id),
      finished: true,
    };
  }

  return {
    runStatus:
      input.failureReason === "execution_failed"
        ? "failed"
        : "blocked",
    currentStepId: currentStep.step_id,
    nextStepToEnqueueId: null,
    markCompensationPendingStepIds: [],
    finished: true,
  };
}
