import { redirect } from "next/navigation";
import { getOrganizationPlanConfig, normalizeOrganizationPlanName } from "@/lib/agents/agent-integration-limits";
import { getSession } from "@/lib/auth/get-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrganizationUsage } from "@/lib/db/usage";
import { PlanComparison } from "@/components/settings/plan-comparison";
import { PlanLimitBanner } from "@/components/usage/plan-limit-banner";
import type { Json } from "@/types/database";

type PlanRow = {
  id: string;
  name: string;
  price_monthly_usd: number | null;
  max_users: number;
  features: Json | null;
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
      .select("id, name, price_monthly_usd, max_users, features")
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
          Facturacion y planes
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Administra los scopes activos de tu organizacion y la capacidad mensual de sesiones atendidas.
        </p>
      </div>

      {usage ? (
        <PlanLimitBanner
          usagePercent={usage.usagePercent}
          totalMessages={usage.totalConversations}
          planLimit={usage.planLimit}
        />
      ) : null}

      {usage ? (
        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Lectura mensual
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
              <p className="text-xs font-semibold tracking-wide text-slate-500">Sesiones atendidas</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {usage.totalConversations.toLocaleString("es-ES")}{" "}
                <span className="text-lg font-medium tracking-normal text-slate-400">
                  / {usage.planLimit.toLocaleString("es-ES")}
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
              <p className="text-xs font-semibold tracking-wide text-slate-500">Tokens procesados</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {(usage.totalTokensInput + usage.totalTokensOutput).toLocaleString("es-ES")}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-5 ring-1 ring-inset ring-slate-100">
              <p className="text-xs font-semibold tracking-wide text-slate-500">Costo inducido</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                ${usage.estimatedCostUsd.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {plans ? (
        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-7 py-5">
            <h2 className="text-base font-bold text-slate-900">Matriz de precios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Los planes crecen por scopes activos y sesiones mensuales, no por cantidad de integraciones conectadas.
            </p>
          </div>

          <PlanComparison
            plans={(plans as PlanRow[])
              .map((plan) => {
                const planName = normalizeOrganizationPlanName(plan.name);

                if (!planName) {
                  return null;
                }

                const planConfig = getOrganizationPlanConfig(planName, plan.features);

                return {
                  id: plan.id,
                  name: planConfig.publicLabel,
                  priceMonthly: plan.price_monthly_usd,
                  maxScopes: planConfig.maxScopesActive,
                  maxUsers: plan.max_users < 0 ? null : plan.max_users,
                  maxSessions: planConfig.maxSessionsMonth,
                };
              })
              .filter((plan): plan is {
                id: string;
                name: string;
                priceMonthly: number | null;
                maxScopes: number | null;
                maxUsers: number | null;
                maxSessions: number | null;
              } => plan !== null)}
            currentPlanId={currentPlanId ?? ""}
          />
        </div>
      ) : null}
    </div>
  );
}
