"use client";

import Link from "next/link";
import { TAB_LABELS, type WorkspaceTab } from "@/components/agents/agent-detail-workspace-utils";
import type { Agent } from "@/types/app";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type AgentDetailWorkspaceHeaderProps = {
  agentId: string;
  name: string;
  description: string | null;
  savedStatus: Agent["status"];
  connectionSummary: AgentConnectionSummary;
  canUseSandbox: boolean;
  canChat: boolean;
  canOpenQa: boolean;
  qaEnabled: boolean;
  activeTab: WorkspaceTab;
  tabs: WorkspaceTab[];
  statusLabel: string;
  onTabChange: (tab: WorkspaceTab) => void;
  onOpenPreview: () => void;
  onOpenQa: () => void;
};

export function AgentDetailWorkspaceHeader({
  agentId,
  name,
  description,
  savedStatus,
  connectionSummary,
  canUseSandbox,
  canChat,
  canOpenQa,
  qaEnabled,
  activeTab,
  tabs,
  statusLabel,
  onTabChange,
  onOpenPreview,
  onOpenQa,
}: AgentDetailWorkspaceHeaderProps) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_35%),linear-gradient(135deg,_#ffffff,_#f8fafc)] p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a agentes
          </Link>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace del agente</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{name || "Agente sin nombre"}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {description || "Ajusta configuracion, setup, conocimiento y QA sin salir de esta vista."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white">{statusLabel}</span>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 ring-1 ring-inset ring-slate-200">{connectionSummary.label}</span>
            {qaEnabled ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                QA habilitado
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canUseSandbox ? (
            <button
              type="button"
              onClick={onOpenPreview}
              className="inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              {savedStatus === "active" ? "Abrir sandbox preview" : "Probar borrador actual"}
            </button>
          ) : null}
          {canOpenQa ? (
            <button
              type="button"
              onClick={onOpenQa}
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              Abrir inbox QA
            </button>
          ) : null}
          {canChat ? (
            <Link href={`/agents/${agentId}/chat`} className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800">
              Abrir chat operativo
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${activeTab === tab ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </section>
  );
}