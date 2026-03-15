"use client";

import type { ReactNode } from "react";
import { AGENT_SCOPE_LABELS } from "@/lib/agents/agent-scope";
import { ChatQuickActionsPanel } from "@/components/chat/chat-quick-actions-panel";
import type { ResolvedChatQuickActions } from "@/lib/chat/quick-actions";

type ChatQuickActionsShellProps = {
  quickActions: ResolvedChatQuickActions;
  isLoading: boolean;
  isMobileOpen: boolean;
  onActionSelect: (prompt: string) => void;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  activeRail?: ReactNode;
};

export function ChatQuickActionsShell({
  quickActions,
  isLoading,
  isMobileOpen,
  onActionSelect,
  onOpenMobile,
  onCloseMobile,
  activeRail,
}: ChatQuickActionsShellProps) {
  if (!quickActions.hasConnectedIntegrations) {
    return activeRail ? (
      <aside className="hidden border-l border-slate-200 bg-white/80 px-4 py-4 xl:block">
        <div className="sticky top-4">{activeRail}</div>
      </aside>
    ) : null;
  }

  const scopeLabel = quickActions.agentScope
    ? AGENT_SCOPE_LABELS[quickActions.agentScope].toLowerCase()
    : "este agente";

  return (
    <>
      <aside className="hidden border-l border-slate-200 bg-white/80 px-4 py-4 xl:block">
        <div className="sticky top-4 space-y-4">
          {activeRail}
          <ChatQuickActionsPanel
            quickActions={quickActions}
            isLoading={isLoading}
            onActionSelect={onActionSelect}
          />
        </div>
      </aside>

      <div className="pointer-events-none fixed bottom-28 right-4 z-20 xl:hidden">
        <button
          type="button"
          onClick={onOpenMobile}
          className="pointer-events-auto rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        >
          Acciones
        </button>
      </div>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/35 xl:hidden">
          <button
            type="button"
            aria-label="Cerrar acciones"
            onClick={onCloseMobile}
            className="absolute inset-0"
          />
          <div className="relative z-10 w-full rounded-t-[2rem] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Acciones
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Usa el mismo flujo del chat para pedir contexto, sintesis o siguiente paso de {scopeLabel}.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600"
              >
                Cerrar
              </button>
            </div>
            {activeRail ? <div className="mb-4">{activeRail}</div> : null}
            <ChatQuickActionsPanel
              quickActions={quickActions}
              isLoading={isLoading}
              onActionSelect={onActionSelect}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
