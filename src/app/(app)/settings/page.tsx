import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrganizationForm } from "@/components/settings/organization-form";
import type { Organization, Plan } from "@/types/app";

type OrgSummary = Pick<Organization, "id" | "name" | "plan_id" | "trial_ends_at" | "created_at">;
type PlanSummary = Pick<Plan, "name" | "price_monthly_usd">;

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin") {
    redirect("/unauthorized");
  }

  const supabase = await createServerSupabaseClient();

  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name, plan_id, trial_ends_at, created_at")
    .eq("id", session.organizationId)
    .single();

  const org = orgData as OrgSummary | null;

  let planName = "Desconocido";
  let planPrice = 0;

  if (org?.plan_id) {
    const { data: planData } = await supabase
      .from("plans")
      .select("name, price_monthly_usd")
      .eq("id", org.plan_id)
      .single();

    const plan = planData as PlanSummary | null;
    if (plan) {
      planName = plan.name;
      planPrice = plan.price_monthly_usd ?? 0;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuracion</h1>

      {org && (
        <>
          <OrganizationForm
            initialName={org.name}
          />

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Plan actual</h2>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{planName}</span>
                {planPrice > 0 && ` — $${planPrice}/mes`}
                {planPrice === 0 && " — Gratis"}
              </p>
              {org.trial_ends_at !== null && (
                <p className="text-sm text-gray-500">
                  Trial termina: {new Date(org.trial_ends_at as string).toLocaleDateString("es-ES")}
                </p>
              )}
              <p className="text-sm text-gray-500">
                Miembro desde: {org.created_at ? new Date(org.created_at).toLocaleDateString("es-ES") : "N/A"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
