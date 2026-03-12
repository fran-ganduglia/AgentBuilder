"use client";

import Link from "next/link";
import {
  CHANNEL_LABELS,
  getSetupProgress,
  type AgentSetupChecklistItemStatus,
  type AgentSetupState,
  type PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import { SetupChecklistEditor } from "@/components/agents/setup-checklist-editor";

type AgentSetupPanelProps = {
  setupState: AgentSetupState;
  agentStatus: string;
  canEdit: boolean;
  canManageDocuments: boolean;
  chatHref: string | null;
  chatLabel: string | null;
  baseFieldsReady: boolean;
  hasUnsavedChanges: boolean;
  canActivate: boolean;
  isActivating: boolean;
  activationError: string | null;
  onOpenKnowledge?: () => void;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange: (field: PromptBuilderTextField, value: string) => void;
  onActivate: () => void;
};

export function AgentSetupPanel({
  setupState,
  agentStatus,
  canEdit,
  canManageDocuments,
  chatHref,
  chatLabel,
  baseFieldsReady,
  hasUnsavedChanges,
  canActivate,
  isActivating,
  activationError,
  onOpenKnowledge,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
  onActivate,
}: AgentSetupPanelProps) {
  const progress = getSetupProgress(setupState);
  const isActive = agentStatus === "active";
  const blockingItems = setupState.checklist.filter(
    (item) => item.required_for_activation && item.status !== "completed"
  );

  const activationCopy = hasUnsavedChanges
    ? "Guarda los cambios pendientes antes de activar este agente."
    : blockingItems.length > 0
      ? `Falta resolver: ${blockingItems.map((item) => item.label).join(", ")}.`
      : "Los requisitos obligatorios ya estan completos para activar este agente.";

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_32%),linear-gradient(135deg,_#ffffff,_#f8fafc)] shadow-sm">
        <div className="px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-900 text-white"}`}>
                  {isActive ? "Activo" : "Borrador guiado"}
                </span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">
                  {CHANNEL_LABELS[setupState.channel]}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 ring-1 ring-inset ring-slate-200">
                  Setup: {setupState.setup_status}
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">Onboarding guiado del agente</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Este checklist queda como borrador local hasta que guardes cambios. Los items obligatorios controlan la activacion y los opcionales pueden quedar para despues.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {canManageDocuments ? (
                  <button
                    type="button"
                    onClick={onOpenKnowledge}
                    className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Abrir base de conocimientos
                  </button>
                ) : null}
                {chatHref && chatLabel ? (
                  <Link href={chatHref} className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
                    {chatLabel}
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[220px] lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Avance</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{progress.percent}%</p>
                <p className="text-xs text-slate-500">{progress.completed} de {progress.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Bloqueos</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{blockingItems.length}</p>
                <p className="text-xs text-slate-500">pendientes obligatorios</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Guardado</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{hasUnsavedChanges ? "Cambios pendientes" : "Todo guardado"}</p>
                <p className="text-xs text-slate-500">guardado manual</p>
              </div>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>

      {!isActive ? (
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Activacion</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{activationCopy}</p>
              {!baseFieldsReady ? (
                <p className="mt-2 text-sm font-medium text-amber-700">Antes de activar, revisa nombre, prompt, modelo y temperatura.</p>
              ) : null}
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={onActivate}
                disabled={hasUnsavedChanges || !canActivate || isActivating}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isActivating ? "Activando..." : "Activar agente"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <SetupChecklistEditor
        setupState={setupState}
        canEdit={canEdit}
        onNavigateToDocuments={canManageDocuments ? onOpenKnowledge : undefined}
        onTaskDataChange={onTaskDataChange}
        onManualStatusChange={onManualStatusChange}
        onBuilderDraftChange={onBuilderDraftChange}
      />

      {activationError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">{activationError}</p>
        </div>
      ) : null}
    </section>
  );
}
