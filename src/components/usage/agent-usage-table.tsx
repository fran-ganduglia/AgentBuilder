import type { AgentUsageRow } from "@/lib/db/usage";

type AgentUsageTableProps = {
  agents: AgentUsageRow[];
};

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function AgentUsageTable({ agents }: AgentUsageTableProps) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Uso segmentado por agente</h2>
        <p className="mt-1 text-xs font-medium text-slate-500">No hay agentes activos computando métricas operativas al momento.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-5">
        <h2 className="text-base font-bold text-slate-900">Ranking Analítico por Agente</h2>
        <span className="inline-flex items-center justify-center rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
           {agents.length} Activos
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-white">
            <tr>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Agente</th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Mensajes</th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Tokens IN</th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Tokens OUT</th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Costo Estimado</th>
              <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Latencia Ø</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agents.map((agent) => (
              <tr key={agent.agentId} className="transition-colors hover:bg-slate-50">
                <td className="px-6 py-5 font-bold text-slate-900">{agent.agentName}</td>
                <td className="px-6 py-5 text-right font-medium text-slate-600">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-800 ring-1 ring-inset ring-slate-200">
                    {formatNumber(agent.totalMessages)}
                  </span>
                </td>
                <td className="px-6 py-5 text-right font-medium text-slate-500">
                  {formatNumber(agent.totalTokensInput)}
                </td>
                <td className="px-6 py-5 text-right font-medium text-slate-500">
                  {formatNumber(agent.totalTokensOutput)}
                </td>
                <td className="px-6 py-5 text-right font-medium text-emerald-700">
                  {formatCost(agent.estimatedCostUsd)}
                </td>
                <td className="px-6 py-5 text-right font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tracking-widest text-slate-600 ring-1 ring-inset ring-slate-500/10">
                    {formatLatency(agent.averageLatencyMs)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
