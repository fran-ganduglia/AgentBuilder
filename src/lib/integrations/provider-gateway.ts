import "server-only";

import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { recordProviderBudgetUsage } from "@/lib/integrations/provider-budgets";
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
  let blockedBudget = null;

  try {
    const budgetUsages = await recordProviderBudgetUsage({
      provider: context.provider,
      organizationId: context.organizationId,
      methodKey: context.methodKey,
      units: context.budgetUnits,
    });
    blockedBudget = budgetUsages.find((usage) => usage.blocked) ?? null;
  } catch (error) {
    console.error("integrations.provider_budget_unavailable", {
      provider: context.provider,
      organizationId: context.organizationId,
      methodKey: context.methodKey,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  if (blockedBudget) {
    throw new ProviderRequestError({
      provider: context.provider,
      message:
        context.onBudgetExceededMessage ??
        "Se alcanzo el presupuesto temporal configurado para este proveedor.",
      statusCode: 429,
    });
  }

  try {
    return await operation();
  } catch (error) {
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
