import "server-only";

import {
  getOrganizationPlanConfig,
  normalizeOrganizationPlanName,
  type OrganizationPlanConfig,
  type OrganizationPlanName,
} from "@/lib/agents/agent-integration-limits";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type OrganizationPlanRow = Pick<Tables<"organizations">, "plan_id">;
type PlanRow = Pick<Tables<"plans">, "id" | "name" | "features">;

export type OrganizationPlanDetails = {
  id: string;
  name: OrganizationPlanName;
  config: OrganizationPlanConfig;
  features: Tables<"plans">["features"];
};

export async function getOrganizationPlan(
  organizationId: string
): Promise<DbResult<OrganizationPlanDetails>> {
  const supabase = createServiceSupabaseClient();

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .single();

  const organization = organizationData as OrganizationPlanRow | null;

  if (organizationError || !organization?.plan_id) {
    return { data: null, error: "No se pudo obtener el plan de la organizacion" };
  }

  const { data: planData, error: planError } = await supabase
    .from("plans")
    .select("id, name, features")
    .eq("id", organization.plan_id)
    .single();

  const plan = planData as PlanRow | null;

  if (planError || !plan) {
    return { data: null, error: "No se pudo obtener el plan de la organizacion" };
  }

  const normalizedPlanName = normalizeOrganizationPlanName(plan.name);

  if (!normalizedPlanName) {
    return { data: null, error: "El plan de la organizacion no es compatible con los limites actuales" };
  }

  return {
    data: {
      id: plan.id,
      name: normalizedPlanName,
      config: getOrganizationPlanConfig(normalizedPlanName, plan.features),
      features: plan.features,
    },
    error: null,
  };
}

export async function getOrganizationPlanName(
  organizationId: string
): Promise<DbResult<OrganizationPlanName>> {
  const planResult = await getOrganizationPlan(organizationId);

  if (planResult.error || !planResult.data) {
    return { data: null, error: planResult.error ?? "No se pudo obtener el plan de la organizacion" };
  }

  return { data: planResult.data.name, error: null };
}
