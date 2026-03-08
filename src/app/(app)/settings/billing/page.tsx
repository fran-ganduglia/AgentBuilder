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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Facturacion y planes</h1>

      {usage && (
        <PlanLimitBanner
          usagePercent={usage.usagePercent}
          totalMessages={usage.totalMessages}
          planLimit={usage.planLimit}
        />
      )}

      {usage && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Uso actual</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500">Mensajes</p>
              <p className="text-xl font-bold text-gray-900">
                {usage.totalMessages.toLocaleString("es-ES")} / {usage.planLimit.toLocaleString("es-ES")}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tokens</p>
              <p className="text-xl font-bold text-gray-900">
                {(usage.totalTokensInput + usage.totalTokensOutput).toLocaleString("es-ES")}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Costo estimado</p>
              <p className="text-xl font-bold text-gray-900">${usage.estimatedCostUsd.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {plans && (
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
      )}
    </div>
  );
}
