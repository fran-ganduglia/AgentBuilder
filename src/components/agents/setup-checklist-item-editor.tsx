import {
  canManualChecklistItemBeCompleted,
  getBuilderFieldValue,
  type AgentSetupChecklistItemStatus,
  type AgentSetupState,
  type PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import { SetupChecklistItemFields } from "@/components/agents/setup-checklist-item-fields";

type SetupChecklistItemEditorProps = {
  item: AgentSetupState["checklist"][number];
  isOpen: boolean;
  canEdit: boolean;
  setupState: AgentSetupState;
  fallbackTimezone: string;
  documentsHref?: string;
  onNavigateToDocuments?: () => void;
  onToggle: () => void;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange?: (field: PromptBuilderTextField, value: string) => void;
  forceExpanded?: boolean;
};

function getItemStatusLabel(status: AgentSetupChecklistItemStatus): string {
  if (status === "completed") return "Completo";
  if (status === "deferred") return "Retomar despues";
  return "Pendiente";
}

function getItemStatusClasses(status: AgentSetupChecklistItemStatus): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "deferred") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function ItemHeader({ item }: { item: AgentSetupState["checklist"][number] }) {
  return (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ring-1 ring-inset ${getItemStatusClasses(item.status)}`}>
            {getItemStatusLabel(item.status)}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${item.required_for_activation ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            {item.required_for_activation ? "Obligatorio" : "Opcional"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{item.description}</p>
      </div>
    </>
  );
}

export function SetupChecklistItemEditor({
  item,
  isOpen,
  canEdit,
  setupState,
  fallbackTimezone,
  documentsHref,
  onNavigateToDocuments,
  onToggle,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
  forceExpanded = false,
}: SetupChecklistItemEditorProps) {
  const isCompleted = item.status === "completed";
  const isDeferred = item.status === "deferred";
  const isManualCompletable = canManualChecklistItemBeCompleted(item, setupState);
  const builderValue = getBuilderFieldValue(setupState, item.builder_field);
  const showContent = forceExpanded || isOpen;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {forceExpanded ? (
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <ItemHeader item={item} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
        >
          <ItemHeader item={item} />
          <span className="mt-0.5 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500">
            <svg className={`h-4 w-4 transition-transform ${showContent ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
      )}

      {showContent ? (
        <div className={`space-y-4 px-5 py-5 ${forceExpanded ? "border-t border-slate-100" : "border-t border-slate-100"}`}>
          <SetupChecklistItemFields
            item={item}
            canEdit={canEdit}
            isCompleted={isCompleted}
            isDeferred={isDeferred}
            isManualCompletable={isManualCompletable}
            builderValue={builderValue}
            setupState={setupState}
            fallbackTimezone={fallbackTimezone}
            documentsHref={documentsHref}
            onNavigateToDocuments={onNavigateToDocuments}
            onTaskDataChange={onTaskDataChange}
            onManualStatusChange={onManualStatusChange}
            onBuilderDraftChange={onBuilderDraftChange}
          />
        </div>
      ) : null}
    </article>
  );
}
