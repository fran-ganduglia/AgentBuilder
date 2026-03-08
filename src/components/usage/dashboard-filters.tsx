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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Filtros de analitica</p>
          <p className="mt-1 text-sm text-gray-500">
            Ajusta el periodo y el agente para explorar la tendencia sin salir del dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Rango
            </p>
            <div className="flex rounded-lg border border-gray-200 p-1">
              {RANGE_OPTIONS.map((option) => {
                const isActive = selectedMonths === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateParams(option.value, selectedAgentId)}
                    disabled={isPending}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block min-w-56">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Agente
            </span>
            <select
              value={selectedAgentId ?? "all"}
              onChange={(event) => {
                const nextAgentId = event.target.value === "all" ? null : event.target.value;
                updateParams(selectedMonths, nextAgentId);
              }}
              disabled={isPending}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">Todos los agentes</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
