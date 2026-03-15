"use client";

import { AGENT_SCOPE_LABELS } from "@/lib/agents/agent-scope";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { getAgentDeletionDeadline } from "@/lib/agents/agent-deletion";
import type { Agent } from "@/types/app";

type AgentCardProps = {
  agent: Agent;
  connectionLabel?: string | null;
  isDeleted?: boolean;
  canDelete?: boolean;
  isDeleting?: boolean;
  showSelection?: boolean;
  isSelected?: boolean;
  onOpen?: () => void;
  onDelete?: () => void;
  onToggleSelection?: () => void;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "bg-slate-100 text-slate-700 ring-slate-600/20" },
  active: { label: "Activo", className: "bg-emerald-100 text-emerald-700 ring-emerald-600/20" },
  paused: { label: "Pausado", className: "bg-amber-100 text-amber-700 ring-amber-600/20" },
  archived: { label: "Archivado", className: "bg-rose-100 text-rose-700 ring-rose-600/20" },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "";

  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function handleCardKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onAction?: () => void
) {
  if (!onAction) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onAction();
  }
}

function stopCardEvent(event: React.MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function AgentCard({
  agent,
  connectionLabel = null,
  isDeleted = false,
  canDelete = false,
  isDeleting = false,
  showSelection = false,
  isSelected = false,
  onOpen,
  onDelete,
  onToggleSelection,
}: AgentCardProps) {
  const status = statusConfig[agent.status] ?? statusConfig.draft;
  const setupState = readAgentSetupState(agent);
  const purgeAt = getAgentDeletionDeadline(agent.deleted_at);
  const isSelectionInteractive = isDeleted && showSelection && Boolean(onToggleSelection);
  const isOpenInteractive = Boolean(onOpen) && !isDeleted;
  const cardAction = isSelectionInteractive ? onToggleSelection : isOpenInteractive ? onOpen : undefined;

  return (
    <article
      role={cardAction ? "button" : undefined}
      tabIndex={cardAction ? 0 : undefined}
      onClick={cardAction}
      onKeyDown={cardAction ? (event) => handleCardKeyDown(event, cardAction) : undefined}
      className={`group relative flex w-full flex-col justify-between rounded-xl border p-6 text-left shadow-sm transition-all duration-200 ${
        cardAction
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          : ""
      } ${
        isSelectionInteractive && isSelected
          ? "border-emerald-300 bg-emerald-50/60 shadow-md"
          : isDeleted
            ? "border-slate-200 bg-slate-50/70"
            : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="w-full">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 transition-colors group-hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showSelection ? (
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-white transition-colors ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-600"
                    : "border-slate-300 bg-white text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : null}
            {isDeleted ? (
              <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Eliminado
              </span>
            ) : null}
            {setupState ? (
              <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-700 ring-1 ring-inset ring-sky-600/20">
                {AGENT_SCOPE_LABELS[setupState.agentScope]}
              </span>
            ) : null}
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${status.className}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-lg font-bold tracking-tight text-slate-900 ${isOpenInteractive ? "transition-colors group-hover:text-emerald-700" : ""}`}>
                {agent.name}
              </h3>
              {agent.description ? (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">
                  {agent.description}
                </p>
              ) : (
                <p className="mt-1 text-sm italic text-slate-400">Sin descripcion</p>
              )}
            </div>

            {!isDeleted && canDelete ? (
              <div className="flex shrink-0 items-center gap-2">
                {canDelete && onDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      stopCardEvent(event);
                      onDelete();
                    }}
                    disabled={isDeleting}
                    aria-label={`Eliminar ${agent.name}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 w-full border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
          <div className="flex min-w-0 items-center gap-1.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span className="truncate">
              {setupState ? `${AGENT_SCOPE_LABELS[setupState.agentScope]} · ${agent.llm_model}` : agent.llm_model}
            </span>
          </div>

          {isDeleted ? (
            <div className="text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div>{agent.deleted_at ? `Eliminado ${formatDate(agent.deleted_at)}` : "Eliminado"}</div>
              {purgeAt ? <div className="mt-1 text-rose-600">Purgar {formatDate(purgeAt.toISOString())}</div> : null}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>{formatDate(agent.created_at)}</span>
              {connectionLabel ? (
                <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-700 ring-1 ring-inset ring-sky-600/20">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {connectionLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
