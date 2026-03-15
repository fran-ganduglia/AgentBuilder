import {
  getWizardIntegrationById,
  isWizardIntegrationAvailable,
  type WizardIntegrationId,
} from "@/lib/agents/wizard-integrations";
import type { Json } from "@/types/database";

export const ORGANIZATION_PLAN_NAMES = [
  "trial",
  "starter",
  "growth",
  "scale",
  "enterprise",
] as const;

export type OrganizationPlanName = (typeof ORGANIZATION_PLAN_NAMES)[number];

export type IntegrationPlanUpsell = {
  title: string;
  ctaLabel: string;
  href: string;
};

export type OrganizationPlanConfig = {
  name: OrganizationPlanName;
  publicLabel: string;
  maxScopesActive: number | null;
  maxSessionsMonth: number | null;
  maxIntegrationsPerAgent: number | null;
  maxActiveAgentsPerScope: number | null;
  workflowsUnlimited: boolean;
  integrationsUnlimited: boolean;
};

type PlanFeaturePatch = Partial<{
  public_label: string;
  max_scopes_active: number;
  max_sessions_month: number;
  max_integrations_per_agent: number;
  max_active_agents_per_scope: number;
  workflows_unlimited: boolean;
  integrations_unlimited: boolean;
}>;

type PlanConstraintResult = {
  allowed: boolean;
  message: string | null;
};

const DEFAULT_PLAN_CONFIGS: Record<OrganizationPlanName, OrganizationPlanConfig> = {
  trial: {
    name: "trial",
    publicLabel: "Trial",
    maxScopesActive: 1,
    maxSessionsMonth: 100,
    maxIntegrationsPerAgent: 1,
    maxActiveAgentsPerScope: 1,
    workflowsUnlimited: false,
    integrationsUnlimited: false,
  },
  starter: {
    name: "starter",
    publicLabel: "Starter",
    maxScopesActive: 1,
    maxSessionsMonth: 300,
    maxIntegrationsPerAgent: null,
    maxActiveAgentsPerScope: 1,
    workflowsUnlimited: true,
    integrationsUnlimited: true,
  },
  growth: {
    name: "growth",
    publicLabel: "Growth",
    maxScopesActive: 3,
    maxSessionsMonth: 1500,
    maxIntegrationsPerAgent: null,
    maxActiveAgentsPerScope: 1,
    workflowsUnlimited: true,
    integrationsUnlimited: true,
  },
  scale: {
    name: "scale",
    publicLabel: "Scale",
    maxScopesActive: 6,
    maxSessionsMonth: 5000,
    maxIntegrationsPerAgent: null,
    maxActiveAgentsPerScope: 1,
    workflowsUnlimited: true,
    integrationsUnlimited: true,
  },
  enterprise: {
    name: "enterprise",
    publicLabel: "Enterprise",
    maxScopesActive: null,
    maxSessionsMonth: null,
    maxIntegrationsPerAgent: null,
    maxActiveAgentsPerScope: null,
    workflowsUnlimited: true,
    integrationsUnlimited: true,
  },
};

const LEGACY_PLAN_NAME_ALIASES: Record<string, OrganizationPlanName> = {
  pro: "growth",
};

function formatIntegrationCount(count: number): string {
  return `${count} integracion${count === 1 ? "" : "es"}`;
}

function formatScopeCount(count: number): string {
  return `${count} scope${count === 1 ? "" : "s"} activo${count === 1 ? "" : "s"}`;
}

function parsePlanFeaturePatch(features: Json | null | undefined): PlanFeaturePatch {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    return {};
  }

  const raw = features as Record<string, unknown>;
  const patch: PlanFeaturePatch = {};

  if (typeof raw.public_label === "string" && raw.public_label.trim()) {
    patch.public_label = raw.public_label.trim();
  }
  if (typeof raw.max_scopes_active === "number") {
    patch.max_scopes_active = raw.max_scopes_active;
  }
  if (typeof raw.max_sessions_month === "number") {
    patch.max_sessions_month = raw.max_sessions_month;
  }
  if (typeof raw.max_integrations_per_agent === "number") {
    patch.max_integrations_per_agent = raw.max_integrations_per_agent;
  }
  if (typeof raw.max_active_agents_per_scope === "number") {
    patch.max_active_agents_per_scope = raw.max_active_agents_per_scope;
  }
  if (typeof raw.workflows_unlimited === "boolean") {
    patch.workflows_unlimited = raw.workflows_unlimited;
  }
  if (typeof raw.integrations_unlimited === "boolean") {
    patch.integrations_unlimited = raw.integrations_unlimited;
  }

  return patch;
}

export function normalizeOrganizationPlanName(
  value: string | null | undefined
): OrganizationPlanName | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  const aliasedValue = LEGACY_PLAN_NAME_ALIASES[normalizedValue] ?? normalizedValue;

  return ORGANIZATION_PLAN_NAMES.find((planName) => planName === aliasedValue) ?? null;
}

export function getOrganizationPlanConfig(
  planName: OrganizationPlanName,
  features?: Json | null
): OrganizationPlanConfig {
  const defaults = DEFAULT_PLAN_CONFIGS[planName];
  const patch = parsePlanFeaturePatch(features);

  return {
    ...defaults,
    publicLabel: patch.public_label ?? defaults.publicLabel,
    maxScopesActive:
      patch.max_scopes_active !== undefined ? patch.max_scopes_active : defaults.maxScopesActive,
    maxSessionsMonth:
      patch.max_sessions_month !== undefined
        ? patch.max_sessions_month
        : defaults.maxSessionsMonth,
    maxIntegrationsPerAgent:
      patch.max_integrations_per_agent !== undefined
        ? patch.max_integrations_per_agent
        : defaults.maxIntegrationsPerAgent,
    maxActiveAgentsPerScope:
      patch.max_active_agents_per_scope !== undefined
        ? patch.max_active_agents_per_scope
        : defaults.maxActiveAgentsPerScope,
    workflowsUnlimited:
      patch.workflows_unlimited !== undefined
        ? patch.workflows_unlimited
        : defaults.workflowsUnlimited,
    integrationsUnlimited:
      patch.integrations_unlimited !== undefined
        ? patch.integrations_unlimited
        : defaults.integrationsUnlimited,
  };
}

export function getMaxIntegrations(
  planName: OrganizationPlanName,
  features?: Json | null
): number | null {
  return getOrganizationPlanConfig(planName, features).maxIntegrationsPerAgent;
}

export function getIntegrationPlanUpsell(
  planName: OrganizationPlanName,
  features?: Json | null
): IntegrationPlanUpsell | null {
  const config = getOrganizationPlanConfig(planName, features);

  if (config.maxIntegrationsPerAgent === null) {
    return null;
  }

  return {
    title: `${config.publicLabel} permite hasta ${formatIntegrationCount(config.maxIntegrationsPerAgent)} por agente.`,
    ctaLabel: "Ver planes pagos",
    href: "/settings/billing",
  };
}

export function getPlanScopeEducation(
  planName: OrganizationPlanName,
  features?: Json | null
): { title: string; description: string } {
  const config = getOrganizationPlanConfig(planName, features);

  if (planName === "trial") {
    return {
      title: "El trial valida el setup base antes de escalar.",
      description:
        "En planes pagos puedes conectar multiples integraciones dentro del mismo agente; el crecimiento comercial se mide por scopes activos y sesiones mensuales.",
    };
  }

  if (config.maxScopesActive === null) {
    return {
      title: `${config.publicLabel} expande el producto por scopes y gobernanza.`,
      description:
        "Puedes conectar multiples integraciones y workflows dentro de cada agente. Si necesitas varios agentes activos para el mismo scope, se resuelve en Enterprise.",
    };
  }

  return {
    title: `${config.publicLabel} incluye ${formatScopeCount(config.maxScopesActive)}.`,
    description:
      "Las integraciones y workflows quedan abiertos en planes pagos. El upgrade suma scopes activos y capacidad mensual, no capea por integracion.",
  };
}

export function hasIntegrationLimitReached(
  planName: OrganizationPlanName,
  selectedCount: number,
  features?: Json | null
): boolean {
  const maxIntegrations = getMaxIntegrations(planName, features);

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
  selectedCount: number,
  features?: Json | null
): string | null {
  const config = getOrganizationPlanConfig(planName, features);
  const maxIntegrations = config.maxIntegrationsPerAgent;

  if (maxIntegrations === null || selectedCount <= maxIntegrations) {
    return null;
  }

  return `El plan ${config.publicLabel} permite hasta ${formatIntegrationCount(maxIntegrations)} por agente.`;
}

export function validateIntegrationSelection(input: {
  planName: OrganizationPlanName;
  integrationIds: WizardIntegrationId[];
  features?: Json | null;
}): string | null {
  const unavailableIntegrations = listUnavailableWizardIntegrations(input.integrationIds);

  if (unavailableIntegrations.length > 0) {
    return getUnavailableIntegrationsErrorMessage(unavailableIntegrations);
  }

  return getPlanIntegrationsErrorMessage(
    input.planName,
    input.integrationIds.length,
    input.features
  );
}

export function canCreatePaidIntegrationSet(input: {
  planName: OrganizationPlanName;
  integrationIds: WizardIntegrationId[];
  features?: Json | null;
}): PlanConstraintResult {
  const validationError = validateIntegrationSelection(input);

  return {
    allowed: validationError === null,
    message: validationError,
  };
}

export function canUseAdditionalAgentSameScope(input: {
  planName: OrganizationPlanName;
  activeAgentsInScope: number;
  features?: Json | null;
}): PlanConstraintResult {
  const config = getOrganizationPlanConfig(input.planName, input.features);

  if (
    config.maxActiveAgentsPerScope === null ||
    input.activeAgentsInScope < config.maxActiveAgentsPerScope
  ) {
    return { allowed: true, message: null };
  }

  return {
    allowed: false,
    message:
      "Este plan permite un solo agente activo por scope. Actualiza a Enterprise si necesitas separar marcas, paises o equipos dentro del mismo scope.",
  };
}

export function canActivateScope(input: {
  planName: OrganizationPlanName;
  activeScopes: string[];
  activeAgentsInScope: number;
  targetScope: string;
  features?: Json | null;
}): PlanConstraintResult {
  const config = getOrganizationPlanConfig(input.planName, input.features);
  const sameScopeResult = canUseAdditionalAgentSameScope({
    planName: input.planName,
    activeAgentsInScope: input.activeAgentsInScope,
    features: input.features,
  });

  if (!sameScopeResult.allowed) {
    return sameScopeResult;
  }

  if (input.activeScopes.includes(input.targetScope)) {
    return { allowed: true, message: null };
  }

  if (
    config.maxScopesActive !== null &&
    input.activeScopes.length >= config.maxScopesActive
  ) {
    return {
      allowed: false,
      message: `Tu plan ${config.publicLabel} permite hasta ${formatScopeCount(config.maxScopesActive)}. Desactiva otro scope o actualiza el plan para seguir escalando.`,
    };
  }

  return { allowed: true, message: null };
}
