import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrganizationUsage } from "@/lib/db/usage";
import { PlanComparison } from "@/components/settings/plan-comparison";
import { PlanLimitBanner } from "@/components/usage/plan-limit-banner";

type PlanRow = {
  id: string;
  name: string;
  price_monthly_usd: number;
  max_agents: number;
  max_users: number;
  max_messages_month: number;
};

export default async function BillingPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin") {
    redirect("/unauthorized");
  }

  const supabase = await createServerSupabaseClient();

  const [{ data: plans }, usageResult, { data: orgData }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price_monthly_usd, max_agents, max_users, max_messages_month")
      .order("price_monthly_usd", { ascending: true }),
    getOrganizationUsage(session.organizationId),
    supabase
      .from("organizations")
      .select("plan_id")
      .eq("id", session.organizationId)
      .single(),
  ]);

  const currentPlanId = (orgData as { plan_id: string } | null)?.plan_id;
  const usage = usageResult.data;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Facturación y Planes
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Administra el ciclo de vida de tu suscripción y el uso métrico asociado.
        </p>
      </div>

      {usage && (
        <PlanLimitBanner
          usagePercent={usage.usagePercent}
          totalMessages={usage.totalMessages}
          planLimit={usage.planLimit}
        />
      )}

      {usage && (
        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <h2 className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Lectura Mensual
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
              <p className="text-xs font-semibold tracking-wide text-slate-500">Mensajes Emitidos</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {usage.totalMessages.toLocaleString("es-ES")} <span className="text-lg text-slate-400 font-medium tracking-normal">/ {usage.planLimit.toLocaleString("es-ES")}</span>
              </p>
            </div>
            
            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
              <p className="text-xs font-semibold tracking-wide text-slate-500">Tokens Procesados</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {(usage.totalTokensInput + usage.totalTokensOutput).toLocaleString("es-ES")}
              </p>
            </div>
            
            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
               <p className="text-xs font-semibold tracking-wide text-slate-500">Costos Inducidos</p>
               <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                 ${usage.estimatedCostUsd.toFixed(2)}
               </p>
            </div>
          </div>
        </div>
      )}

      {plans && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
           <div className="border-b border-slate-100 bg-slate-50 px-7 py-5">
              <h2 className="text-base font-bold text-slate-900">Matriz de Precios</h2>
              <p className="mt-1 text-sm text-slate-500">Los límites mostrados son incrementales dependiendo la elección del plan.</p>
           </div>
           
           <PlanComparison
             plans={(plans as PlanRow[]).map((p) => ({
               id: p.id,
               name: p.name,
               priceMonthly: p.price_monthly_usd,
               maxAgents: p.max_agents,
               maxUsers: p.max_users,
               maxMessages: p.max_messages_month,
             }))}
             currentPlanId={currentPlanId ?? ""}
           />
        </div>
      )}
    </div>
  );
}
