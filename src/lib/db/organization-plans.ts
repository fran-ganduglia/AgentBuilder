import "server-only";

import { normalizeOrganizationPlanName, type OrganizationPlanName } from "@/lib/agents/agent-integration-limits";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type OrganizationPlanRow = Pick<Tables<"organizations">, "plan_id">;
type PlanRow = Pick<Tables<"plans">, "name">;

export async function getOrganizationPlanName(
  organizationId: string
): Promise<DbResult<OrganizationPlanName>> {
  const supabase = await createServerSupabaseClient();

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
    .select("name")
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

  return { data: normalizedPlanName, error: null };
}
