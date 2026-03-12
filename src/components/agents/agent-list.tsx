"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AGENT_DELETION_RETENTION_DAYS } from "@/lib/agents/agent-deletion";
import type { Agent } from "@/types/app";
import { AgentCard } from "./agent-card";

export type AgentListTab = "active" | "deleted";

type AgentListProps = {
  activeTab: AgentListTab;
  onTabChange: (tab: AgentListTab) => void;
  activeAgents: Agent[];
  deletedAgents?: Agent[];
  connectedAgentTypes?: Record<string, string>;
  canCreate?: boolean;
  canEditQuickAccess?: boolean;
  canDeleteAgents?: boolean;
  canRestoreAgents?: boolean;
  deletingAgentId?: string | null;
  onDeleteAgent?: (agent: Agent) => void;
  isRestoreMode?: boolean;
  selectedDeletedAgentIds?: string[];
  onToggleDeletedAgentSelection?: (agentId: string) => void;
  onToggleSelectAllDeleted?: () => void;
  onCancelRestoreMode?: () => void;
  onRestoreSelected?: () => void;
  isRestoring?: boolean;
};

function EmptyState({
  title,
  description,
  canCreate,
}: {
  title: string;
  description: string;
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-24 shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 ring-8 ring-slate-50">
        <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      </div>
      <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-center text-sm font-medium text-slate-500">
        {description}
      </p>
      {canCreate ? (
        <Link
          href="/agents/new"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Crear primer agente
        </Link>
      ) : null}
    </div>
  );
}

export function AgentList({
  activeTab,
  onTabChange,
  activeAgents,
  deletedAgents = [],
  connectedAgentTypes = {},
  canCreate = true,
  canEditQuickAccess = false,
  canDeleteAgents = false,
  canRestoreAgents = false,
  deletingAgentId = null,
  onDeleteAgent,
  isRestoreMode = false,
  selectedDeletedAgentIds = [],
  onToggleDeletedAgentSelection,
  onToggleSelectAllDeleted,
  onCancelRestoreMode,
  onRestoreSelected,
  isRestoring = false,
}: AgentListProps) {
  const router = useRouter();
  const selectedDeletedIdsSet = useMemo(
    () => new Set(selectedDeletedAgentIds),
    [selectedDeletedAgentIds]
  );
  const showDeletedTab = canEditQuickAccess || canRestoreAgents;
  const hasAnyAgents = activeAgents.length > 0 || deletedAgents.length > 0;
  const allDeletedSelected =
    deletedAgents.length > 0 && selectedDeletedAgentIds.length === deletedAgents.length;

  if (!hasAnyAgents) {
    return (
      <EmptyState
        title="No hay agentes disponibles"
        description={
          canCreate
            ? "Crea tu primer asistente de IA para automatizar flujos o escalar tu conocimiento interno."
            : "Todavia no tienes agentes asignados dentro de tu organizacion."
        }
        canCreate={canCreate}
      />
    );
  }

  const activePanel =
    activeAgents.length > 0 ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {activeAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            connectionLabel={connectedAgentTypes[agent.id] ?? null}
            canDelete={canDeleteAgents}
            isDeleting={deletingAgentId === agent.id}
            onOpen={() => router.push(`/agents/${agent.id}`)}
            onDelete={() => onDeleteAgent?.(agent)}
          />
        ))}
      </div>
    ) : (
      <EmptyState
        title="No hay agentes activos ni borradores"
        description={
          canCreate
            ? "Tus agentes eliminados recientes siguen disponibles en la solapa Eliminados durante 7 dias."
            : "Todavia no tienes agentes visibles en esta organizacion."
        }
        canCreate={canCreate}
      />
    );

  const deletedPanel =
    deletedAgents.length > 0 ? (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Los agentes eliminados, incluidos los borradores, quedan aqui por {AGENT_DELETION_RETENTION_DAYS} dias antes de la purga definitiva.
        </div>

        {canRestoreAgents && isRestoreMode ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {selectedDeletedAgentIds.length} agente{selectedDeletedAgentIds.length === 1 ? "" : "s"} seleccionado{selectedDeletedAgentIds.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-emerald-800/80">
                Elige uno o varios agentes para restaurarlos y cancelar su purga pendiente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleSelectAllDeleted}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-50"
              >
                {allDeletedSelected ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
              <button
                type="button"
                onClick={onCancelRestoreMode}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onRestoreSelected}
                disabled={selectedDeletedAgentIds.length === 0 || isRestoring}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isRestoring ? "Restaurando..." : "Restaurar seleccionados"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {deletedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              connectionLabel={connectedAgentTypes[agent.id] ?? null}
              isDeleted
              showSelection={isRestoreMode}
              isSelected={selectedDeletedIdsSet.has(agent.id)}
              onToggleSelection={
                isRestoreMode ? () => onToggleDeletedAgentSelection?.(agent.id) : undefined
              }
            />
          ))}
        </div>
      </div>
    ) : (
      <EmptyState
        title="No hay agentes eliminados recientes"
        description={`Cuando elimines un agente, quedara aqui por ${AGENT_DELETION_RETENTION_DAYS} dias antes de borrarse definitivamente.`}
        canCreate={false}
      />
    );

  if (!showDeletedTab) {
    return activePanel;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => onTabChange("active")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "active"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Activos y borradores
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activeTab === "active" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>
            {activeAgents.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("deleted")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "deleted"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Eliminados
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activeTab === "deleted" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>
            {deletedAgents.length}
          </span>
        </button>
      </div>

      {activeTab === "active" ? activePanel : deletedPanel}
    </div>
  );
}
