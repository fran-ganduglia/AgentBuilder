"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type DashboardFiltersProps = {
  agents: Array<{ id: string; name: string }>;
  selectedMonths: number;
  selectedAgentId: string | null;
};

const RANGE_OPTIONS = [
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 12, label: "12M" },
] as const;

export function DashboardFilters({
  agents,
  selectedMonths,
  selectedAgentId,
}: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParams(nextMonths: number, nextAgentId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", String(nextMonths));

    if (nextAgentId) {
      params.set("agentId", nextAgentId);
    } else {
      params.delete("agentId");
    }

    const queryString = params.toString();
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.push(nextUrl);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Filtros de control analítico</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Segmenta el origen de los gráficos en el margen histórico disponible.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Histórico
            </span>
            <div className="flex rounded-lg bg-slate-100 p-1 ring-1 ring-inset ring-slate-900/5">
              {RANGE_OPTIONS.map((option) => {
                const isActive = selectedMonths === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateParams(option.value, selectedAgentId)}
                    disabled={isPending}
                    className={`relative rounded-md px-3.5 py-1.5 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/10"
                        : "text-slate-500 hover:text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="agent-filter-select" className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Trazabilidad
            </label>
            <select
              id="agent-filter-select"
              value={selectedAgentId ?? "all"}
              onChange={(event) => {
                const nextAgentId = event.target.value === "all" ? null : event.target.value;
                updateParams(selectedMonths, nextAgentId);
              }}
              disabled={isPending}
              className="w-full sm:w-auto min-w-[200px] cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all hover:bg-white focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">Fusión Global (Todos)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  Agente: {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
