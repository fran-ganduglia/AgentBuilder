import Link from "next/link";
import {
  getCriteriaTaskData,
  getScheduleTaskData,
  type AgentSetupChecklistItemStatus,
  type AgentSetupState,
  type PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import { CriteriaEditor, ScheduleEditor } from "@/components/agents/setup-checklist-item-editors";

type SetupChecklistItemFieldsProps = {
  item: AgentSetupState["checklist"][number];
  canEdit: boolean;
  isCompleted: boolean;
  isDeferred: boolean;
  isManualCompletable: boolean;
  builderValue: string;
  setupState: AgentSetupState;
  fallbackTimezone: string;
  documentsHref?: string;
  onNavigateToDocuments?: () => void;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange?: (field: PromptBuilderTextField, value: string) => void;
};

export function SetupChecklistItemFields({
  item,
  canEdit,
  isCompleted,
  isDeferred,
  isManualCompletable,
  builderValue,
  setupState,
  fallbackTimezone,
  documentsHref,
  onNavigateToDocuments,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
}: SetupChecklistItemFieldsProps) {
  return (
    <>
      <ActionButtons
        itemId={item.id}
        inputKind={item.input_kind}
        verificationMode={item.verification_mode}
        setupState={setupState}
        fallbackTimezone={fallbackTimezone}
        canEdit={canEdit}
        isCompleted={isCompleted}
        isDeferred={isDeferred}
        isManualCompletable={isManualCompletable}
        onTaskDataChange={onTaskDataChange}
        onManualStatusChange={onManualStatusChange}
      />

      <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
        {item.input_kind === "schedule" ? (
          <ScheduleEditor
            itemId={item.id}
            timezoneFallback={fallbackTimezone}
            setupState={setupState}
            canEdit={canEdit}
            onTaskDataChange={onTaskDataChange}
          />
        ) : null}

        {item.input_kind === "handoff_triggers" ? (
          <CriteriaEditor
            itemId={item.id}
            options={item.options ?? []}
            placeholder={item.placeholder}
            setupState={setupState}
            canEdit={canEdit}
            onTaskDataChange={onTaskDataChange}
          />
        ) : null}

        {item.input_kind === "documents_presence" ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              {isCompleted
                ? "Ya hay al menos un documento listo, asi que este requisito quedo validado automaticamente."
                : "Este item se valida solo cuando exista al menos un documento listo para usar."}
            </p>
            {onNavigateToDocuments ? (
              <button
                type="button"
                onClick={onNavigateToDocuments}
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Ir a base de conocimientos
              </button>
            ) : documentsHref ? (
              <Link href={documentsHref} className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                Ir a documentos
              </Link>
            ) : null}
          </div>
        ) : null}

        {item.input_kind === "provider_integration" ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{item.description}</p>
            {!isCompleted ? (
              <p className="text-xs font-medium text-slate-500">
                Este requisito se completa automaticamente cuando la integracion queda usable y la tool CRM del agente esta habilitada.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Link href="/settings/integrations" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                Abrir integraciones
              </Link>
              <a href="#agent-tools" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                Revisar tool CRM
              </a>
            </div>
          </div>
        ) : null}

        {item.input_kind === "builder_field_review" ? (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Mensaje para revisar</label>
            {item.builder_field && onBuilderDraftChange ? (
              <textarea
                rows={3}
                value={builderValue}
                onChange={(event) => onBuilderDraftChange(item.builder_field!, event.target.value)}
                disabled={!canEdit}
                className="block w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-slate-50 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                placeholder={item.placeholder ?? "Escribe el mensaje que quieres revisar."}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {builderValue || "Todavia no hay un mensaje inicial definido en el builder."}
              </div>
            )}
            {!isManualCompletable ? (
              <p className="text-xs font-medium text-amber-700">Para confirmar este item primero necesitas definir un mensaje inicial.</p>
            ) : null}
          </div>
        ) : null}

        {item.input_kind === "manual_confirm" ? (
          <p className="text-sm text-slate-600">Este item queda como confirmacion manual cuando ya lo hayas revisado fuera del wizard.</p>
        ) : null}
      </div>
    </>
  );
}

type ActionButtonsProps = {
  itemId: string;
  inputKind: AgentSetupState["checklist"][number]["input_kind"];
  verificationMode: AgentSetupState["checklist"][number]["verification_mode"];
  setupState: AgentSetupState;
  fallbackTimezone: string;
  canEdit: boolean;
  isCompleted: boolean;
  isDeferred: boolean;
  isManualCompletable: boolean;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
};

function ActionButtons({
  itemId,
  inputKind,
  verificationMode,
  setupState,
  fallbackTimezone,
  canEdit,
  isCompleted,
  isDeferred,
  isManualCompletable,
  onTaskDataChange,
  onManualStatusChange,
}: ActionButtonsProps) {
  if (!canEdit) {
    return null;
  }

  if (verificationMode === "structured") {
    return (
      <div className="flex flex-wrap gap-2">
        {!isCompleted ? (
          <button
            type="button"
            onClick={() => onTaskDataChange(itemId, buildDeferredPayload(inputKind, setupState, itemId, fallbackTimezone, true))}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${isDeferred ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Retomar despues
          </button>
        ) : null}
        {!isCompleted ? (
          <button
            type="button"
            onClick={() => onTaskDataChange(itemId, buildDeferredPayload(inputKind, setupState, itemId, fallbackTimezone, false))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Dejar pendiente
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onManualStatusChange(itemId, "completed")}
        disabled={!isManualCompletable}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${isCompleted ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Confirmar
      </button>
      <button
        type="button"
        onClick={() => onManualStatusChange(itemId, "deferred")}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${isDeferred ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
      >
        Retomar despues
      </button>
      <button
        type="button"
        onClick={() => onManualStatusChange(itemId, "pending")}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
      >
        Pendiente
      </button>
    </div>
  );
}

function buildDeferredPayload(
  inputKind: AgentSetupState["checklist"][number]["input_kind"],
  setupState: AgentSetupState,
  itemId: string,
  fallbackTimezone: string,
  deferred: boolean
): unknown {
  if (inputKind === "schedule") {
    return { ...getScheduleTaskData(setupState, itemId, fallbackTimezone), deferred };
  }

  if (inputKind === "handoff_triggers") {
    return { ...getCriteriaTaskData(setupState, itemId), deferred };
  }

  return { deferred };
}


