import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AgentUsageTable } from "@/components/usage/agent-usage-table";
import { DashboardFilters } from "@/components/usage/dashboard-filters";
import { PlanLimitBanner } from "@/components/usage/plan-limit-banner";
import { UsageCostChart } from "@/components/usage/usage-cost-chart";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import { UsageTokensChart } from "@/components/usage/usage-tokens-chart";
import { UsageTrendChart } from "@/components/usage/usage-trend-chart";
import { getDashboardUsageData, getOrganizationUsage } from "@/lib/db/usage";
import { getSession } from "@/lib/auth/get-session";
import { listAgents } from "@/lib/db/agents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const searchParamsSchema = z.object({
  range: z.enum(["3", "6", "12"]).optional(),
  agentId: z.string().uuid().optional(),
});

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getFirstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const parsedSearchParams = searchParamsSchema.safeParse({
    range: getFirstParam(resolvedSearchParams.range),
    agentId: getFirstParam(resolvedSearchParams.agentId),
  });

  const selectedMonths = parsedSearchParams.data?.range
    ? Number(parsedSearchParams.data.range)
    : 6;
  const selectedAgentId = parsedSearchParams.data?.agentId ?? null;
  const isAdmin = session.role === "admin";

  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organizationId)
    .is("deleted_at", null);

  const agentCount = count ?? 0;
  const adminAgentsResult = isAdmin ? await listAgents(session.organizationId) : null;
  const availableAgents = adminAgentsResult?.data ?? [];

  if (
    isAdmin &&
    selectedAgentId &&
    !availableAgents.some((agent) => agent.id === selectedAgentId)
  ) {
    notFound();
  }

  const adminDashboardResult = isAdmin
    ? await getDashboardUsageData(
        session.organizationId,
        selectedMonths,
        selectedAgentId ?? undefined
      )
    : null;
  const basicUsageResult = isAdmin
    ? null
    : await getOrganizationUsage(session.organizationId);

  const usage = isAdmin
    ? adminDashboardResult?.data?.usage ?? null
    : basicUsageResult?.data ?? null;
  const adminAgentsUsage = isAdmin ? adminDashboardResult?.data?.agents ?? null : null;
  const adminHistory = isAdmin ? adminDashboardResult?.data?.history ?? null : null;
  const usageError = isAdmin
    ? adminDashboardResult?.error ?? adminAgentsResult?.error ?? null
    : basicUsageResult?.error ?? null;
  const selectedAgentName = selectedAgentId
    ? availableAgents.find((agent) => agent.id === selectedAgentId)?.name ?? null
    : null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Hola, {session.user.fullName}</h1>
        <p className="text-sm text-gray-600">
          Este es el resumen operativo de tus agentes, consumo y actividad reciente.
        </p>
      </section>

      {usageError && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3">
          <p className="text-sm font-medium text-yellow-900">
            No pudimos cargar todas las metricas del dashboard en este intento. {usageError}
          </p>
        </div>
      )}

      {usage && (
        <PlanLimitBanner
          usagePercent={usage.usagePercent}
          totalMessages={usage.totalMessages}
          planLimit={usage.planLimit}
        />
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Agentes activos</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatNumber(agentCount)}</p>
          <p className="mt-2 text-sm text-gray-500">
            Gestiona agentes, documentos y sesiones desde un solo lugar.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/agents/new"
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Crear agente
            </Link>
            <Link
              href="/agents"
              className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Ver agentes
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Vista principal</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">Dashboard unificado</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {isAdmin ? "Admin" : session.role}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Concentramos aqui el resumen general y, para admins, la analitica de uso por agente.
          </p>
          {isAdmin ? (
            <p className="mt-4 text-sm text-gray-500">
              Incluye tendencia mensual, consumo agregado y comparativa entre agentes.
            </p>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              La analitica detallada queda visible solo para admins, pero tu resumen operativo sigue disponible aqui.
            </p>
          )}
        </div>
      </section>

      {usage && <UsageSummaryCards usage={usage} />}

      {isAdmin && adminHistory && adminAgentsUsage && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Analitica</h2>
            <p className="mt-1 text-sm text-gray-600">
              Evolucion mensual del consumo y rendimiento comparado por agente.
            </p>
          </div>

          <DashboardFilters
            agents={availableAgents.map((agent) => ({ id: agent.id, name: agent.name }))}
            selectedMonths={selectedMonths}
            selectedAgentId={selectedAgentId}
          />

          {selectedAgentName && (
            <p className="text-sm text-gray-500">
              Mostrando analitica para <span className="font-medium text-gray-700">{selectedAgentName}</span>{" "}
              en los ultimos {selectedMonths} meses.
            </p>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <UsageTrendChart history={adminHistory} />
            <UsageCostChart history={adminHistory} />
          </div>
          <UsageTokensChart history={adminHistory} />
          <AgentUsageTable agents={adminAgentsUsage} />
        </section>
      )}
    </div>
  );
}
