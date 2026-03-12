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
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Configuración General
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Supervisa el estado de la organización y ajusta su identidad.
        </p>
      </div>

      {org && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Resumen de la Cuenta</h2>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 rounded-lg border border-slate-100 bg-slate-50 p-5">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Plan Activo
                </span>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 capitalize">
                  {planName}
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    {planPrice > 0 ? `$${planPrice}/mes` : "Gratis"}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Miembro Desde
                </span>
                <p className="text-sm font-medium text-slate-700">
                  {org.created_at ? new Date(org.created_at).toLocaleDateString("es-ES") : "N/A"}
                </p>
              </div>

              {org.trial_ends_at !== null && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Estado del Trial
                  </span>
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    El periodo de prueba finaliza el {new Date(org.trial_ends_at as string).toLocaleDateString("es-ES")}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
             <div className="border-b border-slate-100 bg-slate-50 px-7 py-5">
                <h2 className="text-base font-bold text-slate-900">Identidad de la Organización</h2>
                <p className="mt-1 text-sm text-slate-500">El nombre ingresado identificará tu cuenta en toda la plataforma.</p>
             </div>
             <div className="p-7">
               <OrganizationForm initialName={org.name} />
             </div>
          </section>
        </div>
      )}
    </div>
  );
}
