import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { getAgentById } from "@/lib/db/agents";
import { getAgentUsage } from "@/lib/db/usage";
import { AgentForm } from "@/components/agents/agent-form";

type AgentDetailPageProps = {
  params: Promise<{ agentId: string }>;
};

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "Sin datos";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { agentId } = await params;
  const { data: agent } = await getAgentById(agentId, session.organizationId);

  if (!agent) {
    notFound();
  }

  const canChat = agent.status === "active";

  const { data: usage } = await getAgentUsage(agentId, session.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Editar agente</h1>
        {canChat ? (
          <Link
            href={`/agents/${agent.id}/chat`}
            className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Abrir chat
          </Link>
        ) : (
          <span className="inline-flex rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
            Activalo para habilitar el chat
          </span>
        )}
      </div>

      {usage && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Uso del mes actual</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-gray-500">Mensajes</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(usage.totalMessages)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Tokens</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(usage.totalTokensInput + usage.totalTokensOutput)}
              </p>
              <p className="text-xs text-gray-400">
                {formatNumber(usage.totalTokensInput)} in / {formatNumber(usage.totalTokensOutput)} out
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Latencia promedio</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatLatency(usage.averageLatencyMs)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Costo estimado</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatCost(usage.estimatedCostUsd)}
              </p>
            </div>
          </div>
        </div>
      )}

      <AgentForm agent={agent} />
    </div>
  );
}
