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
import {
  canEditAgents,
  canViewOrganizationUsage,
  listAccessibleAgents,
} from "@/lib/auth/agent-access";
import { getDashboardUsageData } from "@/lib/db/usage";
import { getSession } from "@/lib/auth/get-session";

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
  const canCreateAgents = canEditAgents(session.role);
  const isAdmin = canViewOrganizationUsage(session.role);

  const accessibleAgentsResult = await listAccessibleAgents(session);
  const availableAgents = accessibleAgentsResult.data ?? [];
  const agentCount = availableAgents.length;

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

  const usage = isAdmin ? adminDashboardResult?.data?.usage ?? null : null;
  const adminAgentsUsage = isAdmin ? adminDashboardResult?.data?.agents ?? null : null;
  const adminHistory = isAdmin ? adminDashboardResult?.data?.history ?? null : null;
  const usageError = isAdmin
    ? adminDashboardResult?.error ?? accessibleAgentsResult.error ?? null
    : accessibleAgentsResult.error ?? null;
  const selectedAgentName = selectedAgentId
    ? availableAgents.find((agent) => agent.id === selectedAgentId)?.name ?? null
    : null;

  return (
    <div className="space-y-10 pb-12 max-w-7xl mx-auto">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Hola, {session.user.fullName}
        </h1>
        <p className="text-sm font-medium text-slate-500">
          Este es el resumen operativo de tus agentes y actividad reciente.
        </p>
      </section>

      {usageError && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
          <svg className="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-medium text-amber-900">
            No se pudo recuperar toda la informacion del dashboard. Vuelve a intentarlo en unos minutos.
          </p>
        </div>
      )}

      {isAdmin && usage ? (
        <PlanLimitBanner
          usagePercent={usage.usagePercent}
          totalMessages={usage.totalMessages}
          planLimit={usage.planLimit}
        />
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </span>
              <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Agentes visibles</p>
            </div>
            <p className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900">{formatNumber(agentCount)}</p>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {isAdmin
                ? "Administra, configura y supervisa tu inventario completo de agentes."
                : "Este total respeta los permisos visibles para tu rol dentro de la organizacion."}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {canCreateAgents ? (
              <Link
                href="/agents/new"
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                Nuevo Agente
              </Link>
            ) : null}
            <Link
              href="/agents"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Ver Agentes
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-600/20">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </span>
                <div>
                  <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Centro de Operaciones</p>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Dashboard Unificado</h2>
                </div>
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ring-1 ring-inset ${
                isAdmin ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-blue-50 text-blue-700 ring-blue-600/20"
              }`}>
                {isAdmin ? "Admin" : session.role}
              </span>
            </div>
            <p className="mt-5 text-sm leading-relaxed font-medium text-slate-600">
              {isAdmin
                ? "Aqui se concentra el resumen analitico de consumo agregado, tendencias y comparativas de operacion."
                : "Para tu rol mostramos solo un resumen operativo. La analitica agregada y los costos quedan reservados para administradores."}
            </p>
            {isAdmin ? (
              <p className="mt-3 text-sm font-medium text-slate-500">
                A continuacion puedes revisar el tracking profundo de toda la cuota mensual.
              </p>
            ) : (
              <p className="mt-3 text-sm font-medium text-slate-500">
                Puedes navegar tus agentes visibles, pero no acceder a metricas organizacionales agregadas.
              </p>
            )}
          </div>
        </div>
      </section>

      {isAdmin && usage ? <UsageSummaryCards usage={usage} /> : null}

      {isAdmin && adminHistory && adminAgentsUsage ? (
        <section className="mt-12 space-y-8 border-t border-slate-200 pt-10">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Segmento Analitico</h2>
            <p className="text-sm font-medium text-slate-500">
              Evolucion mensual de cuotas, tendencias de rendimiento y gasto por recursos consumidos.
            </p>
          </div>

          <DashboardFilters
            agents={availableAgents.map((agent) => ({ id: agent.id, name: agent.name }))}
            selectedMonths={selectedMonths}
            selectedAgentId={selectedAgentId}
          />

          {selectedAgentName ? (
            <div className="inline-flex w-full sm:w-auto items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
              <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-medium text-slate-600">
                Filtrando la analitica para <span className="font-bold text-slate-900">{selectedAgentName}</span>{" "}
                (ultimos {selectedMonths} meses).
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <UsageTrendChart history={adminHistory} />
            <UsageCostChart history={adminHistory} />
          </div>
          <div className="w-full xl:col-span-2">
            <UsageTokensChart history={adminHistory} />
          </div>
          <div className="mt-10">
            <AgentUsageTable agents={adminAgentsUsage} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
