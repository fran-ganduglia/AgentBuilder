import {
  getWizardIntegrationById,
  isWizardIntegrationAvailable,
  type WizardIntegrationId,
} from "@/lib/agents/wizard-integrations";

export const ORGANIZATION_PLAN_NAMES = ["trial", "starter", "pro", "enterprise"] as const;

export type OrganizationPlanName = (typeof ORGANIZATION_PLAN_NAMES)[number];

export type IntegrationPlanUpsell = {
  title: string;
  ctaLabel: string;
  href: string;
};

const MAX_INTEGRATIONS_BY_PLAN: Record<OrganizationPlanName, number | null> = {
  trial: 1,
  starter: 2,
  pro: 3,
  enterprise: null,
};

const UPSELL_BY_PLAN: Record<OrganizationPlanName, IntegrationPlanUpsell | null> = {
  trial: {
    title: "Tu plan trial permite una sola integracion por agente.",
    ctaLabel: "Ver planes pagos",
    href: "/settings/billing",
  },
  starter: {
    title: "Tu plan starter llega hasta 2 integraciones por agente.",
    ctaLabel: "Actualizar a Pro",
    href: "/settings/billing",
  },
  pro: {
    title: "Tu plan pro llega hasta 3 integraciones; Enterprise habilita mas alcance.",
    ctaLabel: "Hablar con ventas",
    href: "/settings/billing",
  },
  enterprise: null,
};

function formatIntegrationCount(count: number): string {
  return `${count} integracion${count === 1 ? "" : "es"}`;
}

export function normalizeOrganizationPlanName(
  value: string | null | undefined
): OrganizationPlanName | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  return ORGANIZATION_PLAN_NAMES.find((planName) => planName === normalizedValue) ?? null;
}

export function getMaxIntegrations(planName: OrganizationPlanName): number | null {
  return MAX_INTEGRATIONS_BY_PLAN[planName];
}

export function getIntegrationPlanUpsell(
  planName: OrganizationPlanName
): IntegrationPlanUpsell | null {
  return UPSELL_BY_PLAN[planName];
}

export function hasIntegrationLimitReached(
  planName: OrganizationPlanName,
  selectedCount: number
): boolean {
  const maxIntegrations = getMaxIntegrations(planName);

  return maxIntegrations !== null && selectedCount >= maxIntegrations;
}

export function haveIntegrationSelectionsChanged(
  previousIntegrations: WizardIntegrationId[],
  nextIntegrations: WizardIntegrationId[]
): boolean {
  const previous = [...new Set(previousIntegrations)].sort();
  const next = [...new Set(nextIntegrations)].sort();

  if (previous.length !== next.length) {
    return true;
  }

  return previous.some((integrationId, index) => integrationId !== next[index]);
}

export function listUnavailableWizardIntegrations(
  integrationIds: WizardIntegrationId[]
): WizardIntegrationId[] {
  return [...new Set(integrationIds)].filter(
    (integrationId) => !isWizardIntegrationAvailable(integrationId)
  );
}

export function getUnavailableIntegrationsErrorMessage(
  integrationIds: WizardIntegrationId[]
): string {
  const labels = integrationIds.map((integrationId) => getWizardIntegrationById(integrationId).name);

  return `Estas integraciones aun no estan disponibles: ${labels.join(", ")}.`;
}

export function getPlanIntegrationsErrorMessage(
  planName: OrganizationPlanName,
  selectedCount: number
): string | null {
  const maxIntegrations = getMaxIntegrations(planName);

  if (maxIntegrations === null || selectedCount <= maxIntegrations) {
    return null;
  }

  return `El plan ${planName} permite hasta ${formatIntegrationCount(maxIntegrations)} por agente.`;
}

export function validateIntegrationSelection(input: {
  planName: OrganizationPlanName;
  integrationIds: WizardIntegrationId[];
}): string | null {
  const unavailableIntegrations = listUnavailableWizardIntegrations(input.integrationIds);

  if (unavailableIntegrations.length > 0) {
    return getUnavailableIntegrationsErrorMessage(unavailableIntegrations);
  }

  return getPlanIntegrationsErrorMessage(input.planName, input.integrationIds.length);
}
