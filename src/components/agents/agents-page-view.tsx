"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/use-toast";
import { AGENT_DELETION_RETENTION_DAYS } from "@/lib/agents/agent-deletion";
import type { Agent } from "@/types/app";
import { AgentList, type AgentListTab } from "./agent-list";

type AgentsPageViewProps = {
  activeAgents: Agent[];
  deletedAgents?: Agent[];
  connectedAgentTypes?: Record<string, string>;
  canCreate?: boolean;
  canDeleteAgents?: boolean;
  canRestoreAgents?: boolean;
};

type DeleteAgentResponse = {
  data?: {
    success: boolean;
    agent?: Agent;
    scheduledForPermanentDeletion?: boolean;
    permanentDeletionAt?: string | null;
  };
  error?: string;
};

type RestoreAgentsResponse = {
  data?: {
    restoredAgents: Agent[];
    restoredIds: string[];
    failed: Array<{ agentId: string; reason: string }>;
  };
  error?: string;
};

function sortAgentsByCreatedAtDesc(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

    return rightTime - leftTime;
  });
}

function sortAgentsByDeletedAtDesc(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    const leftTime = left.deleted_at ? new Date(left.deleted_at).getTime() : 0;
    const rightTime = right.deleted_at ? new Date(right.deleted_at).getTime() : 0;

    return rightTime - leftTime;
  });
}

export function AgentsPageView({
  activeAgents,
  deletedAgents = [],
  connectedAgentTypes = {},
  canCreate = true,
  canDeleteAgents = false,
  canRestoreAgents = false,
}: AgentsPageViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AgentListTab>("active");
  const [localActiveAgents, setLocalActiveAgents] = useState(() => sortAgentsByCreatedAtDesc(activeAgents));
  const [localDeletedAgents, setLocalDeletedAgents] = useState(() => sortAgentsByDeletedAtDesc(deletedAgents));
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [isRestoreMode, setIsRestoreMode] = useState(false);
  const [selectedDeletedAgentIds, setSelectedDeletedAgentIds] = useState<string[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    setLocalActiveAgents(sortAgentsByCreatedAtDesc(activeAgents));
  }, [activeAgents]);

  useEffect(() => {
    setLocalDeletedAgents(sortAgentsByDeletedAtDesc(deletedAgents));
  }, [deletedAgents]);

  useEffect(() => {
    setSelectedDeletedAgentIds((current) =>
      current.filter((agentId) => localDeletedAgents.some((agent) => agent.id === agentId))
    );
  }, [localDeletedAgents]);

  const deletedIds = useMemo(
    () => localDeletedAgents.map((agent) => agent.id),
    [localDeletedAgents]
  );

  function resetRestoreMode() {
    setIsRestoreMode(false);
    setSelectedDeletedAgentIds([]);
  }

  function handleTabChange(tab: AgentListTab) {
    setActiveTab(tab);

    if (tab !== "deleted") {
      resetRestoreMode();
    }
  }

  function handleStartRestoreMode() {
    if (!canRestoreAgents || localDeletedAgents.length === 0 || isRestoring) {
      return;
    }

    setIsRestoreMode(true);
    setSelectedDeletedAgentIds([]);
  }

  function handleToggleDeletedAgentSelection(agentId: string) {
    if (!isRestoreMode) {
      return;
    }

    setSelectedDeletedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((currentAgentId) => currentAgentId !== agentId)
        : [...current, agentId]
    );
  }

  function handleToggleSelectAllDeleted() {
    if (!isRestoreMode) {
      return;
    }

    setSelectedDeletedAgentIds((current) =>
      current.length === deletedIds.length ? [] : deletedIds
    );
  }

  async function handleDeleteAgent(agent: Agent) {
    if (!canDeleteAgents || deletingAgentId) {
      return;
    }

    const confirmed = window.confirm(
      `Vas a mover \"${agent.name}\" a Eliminados. Permanecera alli ${AGENT_DELETION_RETENTION_DAYS} dias antes de borrarse definitivamente. ¿Seguro que quieres continuar?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingAgentId(agent.id);

    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as DeleteAgentResponse;

      if (!response.ok || !result.data?.success) {
        toast(result.error ?? "No se pudo eliminar el agente.", "error");
        return;
      }

      setLocalActiveAgents((current) => current.filter((currentAgent) => currentAgent.id !== agent.id));

      if (result.data.agent) {
        setLocalDeletedAgents((current) =>
          sortAgentsByDeletedAtDesc([
            result.data?.agent as Agent,
            ...current.filter((currentAgent) => currentAgent.id !== agent.id),
          ])
        );
      }

      toast(
        result.data.scheduledForPermanentDeletion === false
          ? "Agente movido a eliminados, pero la purga definitiva no pudo programarse."
          : `Agente movido a eliminados. Se purgara en ${AGENT_DELETION_RETENTION_DAYS} dias.`,
        result.data.scheduledForPermanentDeletion === false ? "info" : "success"
      );
      router.refresh();
    } catch {
      toast("Error de conexion. Intenta de nuevo.", "error");
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function handleRestoreSelected() {
    if (!canRestoreAgents || selectedDeletedAgentIds.length === 0 || isRestoring) {
      return;
    }

    setIsRestoring(true);

    try {
      const response = await fetch("/api/agents/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds: selectedDeletedAgentIds }),
      });
      const result = (await response.json()) as RestoreAgentsResponse;

      if (!response.ok || !result.data) {
        toast(result.error ?? "No se pudieron restaurar los agentes seleccionados.", "error");
        return;
      }

      const restoredIds = new Set(result.data.restoredIds);
      const restoredAgents = sortAgentsByCreatedAtDesc(result.data.restoredAgents ?? []);

      if (restoredIds.size > 0) {
        setLocalDeletedAgents((current) =>
          current.filter((agent) => !restoredIds.has(agent.id))
        );
        setLocalActiveAgents((current) =>
          sortAgentsByCreatedAtDesc([
            ...restoredAgents,
            ...current.filter((agent) => !restoredIds.has(agent.id)),
          ])
        );
      }

      setSelectedDeletedAgentIds((current) =>
        current.filter((agentId) => !restoredIds.has(agentId))
      );

      if (result.data.failed.length === 0 && restoredIds.size > 0) {
        toast("Agentes restaurados correctamente.", "success");
      } else if (restoredIds.size > 0) {
        toast("Se restauraron algunos agentes, pero otros ya no estaban disponibles.", "info");
      } else {
        toast("No habia agentes disponibles para restaurar.", "info");
      }

      if (restoredIds.size > 0) {
        resetRestoreMode();
      }

      router.refresh();
    } catch {
      toast("Error de conexion. Intenta de nuevo.", "error");
    } finally {
      setIsRestoring(false);
    }
  }

  const headerAction =
    activeTab === "deleted" && canRestoreAgents ? (
      <button
        type="button"
        onClick={handleStartRestoreMode}
        disabled={localDeletedAgents.length === 0 || isRestoreMode || isRestoring}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      >
        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 12h16m-8-8l8 8-8 8" />
        </svg>
        Restaurar agentes
      </button>
    ) : canCreate ? (
      <Link
        href="/agents/new"
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
      >
        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Crear agente
      </Link>
    ) : null;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Agentes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona tu flota de asistentes de IA y sus conocimientos.
          </p>
        </div>
        {headerAction}
      </div>

      <AgentList
        activeTab={activeTab}
        onTabChange={handleTabChange}
        activeAgents={localActiveAgents}
        deletedAgents={localDeletedAgents}
        connectedAgentTypes={connectedAgentTypes}
        canCreate={canCreate}
        canEditQuickAccess={canRestoreAgents}
        canDeleteAgents={canDeleteAgents}
        canRestoreAgents={canRestoreAgents}
        deletingAgentId={deletingAgentId}
        onDeleteAgent={(agent) => void handleDeleteAgent(agent)}
        isRestoreMode={isRestoreMode}
        selectedDeletedAgentIds={selectedDeletedAgentIds}
        onToggleDeletedAgentSelection={handleToggleDeletedAgentSelection}
        onToggleSelectAllDeleted={handleToggleSelectAllDeleted}
        onCancelRestoreMode={resetRestoreMode}
        onRestoreSelected={() => void handleRestoreSelected()}
        isRestoring={isRestoring}
      />
    </div>
  );
}
