"use client";

import type {
  ChatQuickAction,
  ResolvedChatQuickActions,
} from "@/lib/chat/quick-actions";

type ChatQuickActionsPanelProps = {
  quickActions: ResolvedChatQuickActions;
  isLoading: boolean;
  onActionSelect: (prompt: string) => void;
};

type ChatQuickActionsSectionProps = {
  title: string;
  actions: ChatQuickAction[];
  isLoading: boolean;
  onActionSelect: (prompt: string) => void;
};

function ChatQuickActionsSection({
  title,
  actions,
  isLoading,
  onActionSelect,
}: ChatQuickActionsSectionProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={isLoading}
            onClick={() => onActionSelect(action.prompt)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function ChatQuickActionsPanel({
  quickActions,
  isLoading,
  onActionSelect,
}: ChatQuickActionsPanelProps) {
  if (!quickActions.isCrmChat) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm backdrop-blur">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Acciones sugeridas
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Atajos guiados que reutilizan el flujo actual del chat y sus validaciones.
        </p>
      </div>

      <div className="mt-4 space-y-5">
        <ChatQuickActionsSection
          title="Asistencia rapida"
          actions={quickActions.assistance}
          isLoading={isLoading}
          onActionSelect={onActionSelect}
        />
        {quickActions.isRuntimeUsable ? (
          <>
            <ChatQuickActionsSection
              title="Atajos CRM"
              actions={quickActions.crmShortcuts}
              isLoading={isLoading}
              onActionSelect={onActionSelect}
            />
            <ChatQuickActionsSection
              title="Playbook del template"
              actions={quickActions.templatePlaybook}
              isLoading={isLoading}
              onActionSelect={onActionSelect}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
