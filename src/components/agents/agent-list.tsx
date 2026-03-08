"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Agent } from "@/types/app";
import { AgentCard } from "./agent-card";

type AgentListProps = {
  agents: Agent[];
};

export function AgentList({ agents }: AgentListProps) {
  const router = useRouter();

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-16">
        <p className="text-sm text-gray-500">No hay agentes todavia</p>
        <Link
          href="/agents/new"
          className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Crear primer agente
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onClick={() => router.push(`/agents/${agent.id}`)}
        />
      ))}
    </div>
  );
}
