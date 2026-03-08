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
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentUsageTable({ agents }: AgentUsageTableProps) {
  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Uso por agente</h2>
        <p className="mt-4 text-sm text-gray-500">No hay agentes activos.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Uso por agente</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500">Agente</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Mensajes</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Tokens in</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Tokens out</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Costo</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Latencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {agents.map((agent) => (
              <tr key={agent.agentId} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{agent.agentName}</td>
                <td className="px-6 py-3 text-right text-gray-600">
                  {formatNumber(agent.totalMessages)}
                </td>
                <td className="px-6 py-3 text-right text-gray-600">
                  {formatNumber(agent.totalTokensInput)}
                </td>
                <td className="px-6 py-3 text-right text-gray-600">
                  {formatNumber(agent.totalTokensOutput)}
                </td>
                <td className="px-6 py-3 text-right text-gray-600">
                  {formatCost(agent.estimatedCostUsd)}
                </td>
                <td className="px-6 py-3 text-right text-gray-600">
                  {formatLatency(agent.averageLatencyMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
