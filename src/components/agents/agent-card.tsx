"use client";

import type { Agent } from "@/types/app";

type AgentCardProps = {
  agent: Agent;
  onClick: () => void;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "bg-gray-100 text-gray-700" },
  active: { label: "Activo", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausado", className: "bg-yellow-100 text-yellow-700" },
  archived: { label: "Archivado", className: "bg-red-100 text-red-700" },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const status = statusConfig[agent.status] ?? statusConfig.draft;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 bg-white p-5 text-left transition hover:border-blue-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <h3 className="truncate text-sm font-semibold text-gray-900">
          {agent.name}
        </h3>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
        <span>{agent.llm_model}</span>
        <span>{formatDate(agent.created_at)}</span>
      </div>
    </button>
  );
}
