import "server-only";

import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import {
  finalizeProviderBudgetReservations,
  recordProviderBudgetUsage,
  reserveProviderBudgetUsage,
} from "@/lib/integrations/provider-budgets";
import {
  isProviderRequestError,
  ProviderRequestError,
} from "@/lib/integrations/provider-errors";

export type ProviderRequestContext = {
  provider: string;
  organizationId: string;
  integrationId?: string | null;
  methodKey: string;
  budgetUnits?: number;
  onBudgetExceededMessage?: string;
  autoMarkReauth?: boolean;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
};

function isAuthFailureStatus(statusCode: number | null): boolean {
  return statusCode === 401 || statusCode === 403;
}

export function getSafeProviderErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (!isProviderRequestError(error)) {
    return fallback;
  }

  if (isAuthFailureStatus(error.statusCode)) {
    return "La integracion necesita reautenticacion antes de volver a operar.";
  }

  if (error.statusCode === 429) {
    return "El proveedor pidio bajar la velocidad. Reintenta en unos minutos.";
  }

  return fallback;
}

export async function performProviderRequest<T>(
  context: ProviderRequestContext,
  operation: () => Promise<T>
): Promise<T> {
  let budgetAdmission:
    | {
        decision: "queue" | "throttle" | "reject";
        retryAfterSeconds: number | null;
      }
    | null = null;
  let reservations:
    | Awaited<ReturnType<typeof reserveProviderBudgetUsage>>
    | null = null;

  try {
    if (context.workflowRunId && context.workflowStepId) {
      reservations = await reserveProviderBudgetUsage({
        provider: context.provider,
        organizationId: context.organizationId,
        methodKey: context.methodKey,
        units: context.budgetUnits,
        workflow: {
          workflowRunId: context.workflowRunId,
          workflowStepId: context.workflowStepId,
        },
      });
      const deferred = reservations.find(
        (usage) => usage.decision === "queue" || usage.decision === "throttle"
      );
      const rejected = reservations.find((usage) => usage.decision === "reject");
      const selected = rejected ?? deferred ?? null;
      budgetAdmission = selected
        ? {
            decision:
              selected.decision === "reject"
                ? "reject"
                : selected.decision === "throttle"
                  ? "throttle"
                  : "queue",
            retryAfterSeconds: selected.retryAfterSeconds,
          }
        : null;
    } else {
      const budgetUsages = await recordProviderBudgetUsage({
        provider: context.provider,
        organizationId: context.organizationId,
        methodKey: context.methodKey,
        units: context.budgetUnits,
      });
      const blockedBudget = budgetUsages.find((usage) => usage.blocked) ?? null;
      budgetAdmission = blockedBudget
        ? {
            decision: "reject",
            retryAfterSeconds: null,
          }
        : null;
    }
  } catch (error) {
    console.error("integrations.provider_budget_unavailable", {
      provider: context.provider,
      organizationId: context.organizationId,
      methodKey: context.methodKey,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  if (budgetAdmission) {
    const message =
      budgetAdmission.decision === "queue"
        ? "El allocator del proveedor puso este step en cola antes de consumir quota."
        : budgetAdmission.decision === "throttle"
          ? "El allocator del proveedor pidio desacelerar este step antes de consumir quota."
          : context.onBudgetExceededMessage ??
            "Se alcanzo el presupuesto temporal configurado para este proveedor.";
    throw new ProviderRequestError({
      provider: context.provider,
      message,
      statusCode: 429,
      retryAfterSeconds: budgetAdmission.retryAfterSeconds,
      errorCode:
        budgetAdmission.decision === "queue"
          ? "budget_queued"
          : budgetAdmission.decision === "throttle"
            ? "budget_throttled"
            : "budget_exhausted",
    });
  }

  try {
    const result = await operation();

    if (reservations && reservations.length > 0) {
      await finalizeProviderBudgetReservations({
        organizationId: context.organizationId,
        reservations,
        status: "consumed",
      });
    }

    return result;
  } catch (error) {
    if (reservations && reservations.length > 0) {
      await finalizeProviderBudgetReservations({
        organizationId: context.organizationId,
        reservations,
        status: isProviderRequestError(error) ? "consumed" : "released",
      });
    }

    if (
      context.integrationId &&
      isProviderRequestError(error) &&
      isAuthFailureStatus(error.statusCode) &&
      context.autoMarkReauth !== false
    ) {
      await markIntegrationReauthRequired(
        context.integrationId,
        context.organizationId,
        error.message
      );
    }

    throw error;
  }
}
