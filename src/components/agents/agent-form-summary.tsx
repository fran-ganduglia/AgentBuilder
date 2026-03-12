import type { AgentConnection } from "@/types/app";
import { getTemperatureLabel, type AgentFormFields } from "@/components/agents/agent-form-shared";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type PromptSyncMode = "recommended" | "custom";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

type AgentWorkspaceSummaryProps = {
  fields: AgentFormFields;
  connection?: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  selectedStatusLabel: string;
  selectedModelLabel: string;
  promptWords: number;
  promptLines: number;
  activeTabLabel: string;
};

function getSyncDescription(summary: AgentConnectionSummary): string {
  if (summary.classification === "remote_managed") {
    return "Nombre, descripcion, modelo, temperatura y prompt se reflejan tambien en el assistant remoto cuando se guardan cambios autorizados.";
  }

  if (summary.classification === "channel_connected") {
    return "Este agente sigue siendo local, pero el inbox QA recibe conversaciones reales del numero WhatsApp conectado en modo solo lectura.";
  }

  return "Este agente se ejecuta dentro de AgentBuilder y usa la base de conocimientos cargada en esta cuenta.";
}

function AgentWorkspaceSummary({
  fields,
  connection,
  connectionSummary,
  selectedStatusLabel,
  selectedModelLabel,
  promptWords,
  promptLines,
  activeTabLabel,
}: AgentWorkspaceSummaryProps) {
  return (
    <section className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Workspace activo</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">{fields.name || "Agente sin nombre"}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {fields.description || "Agrega una descripcion para que el equipo entienda rapido el rol de este agente."}
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Solapa actual: {activeTabLabel}</p>
        <div className="mt-6 grid gap-3">
          <StatChip label="Estado" value={selectedStatusLabel} />
          <StatChip label="Modelo" value={selectedModelLabel} />
          <StatChip label="Temperatura" value={`${fields.llmTemperature.toFixed(2)} / ${getTemperatureLabel(fields.llmTemperature)}`} />
          <StatChip label="Prompt" value={`${promptWords} palabras / ${promptLines} lineas`} />
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Sincronizacion</p>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">
          {connection ? connectionSummary.label : "Modo local"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {getSyncDescription(connectionSummary)}
        </p>
      </section>
    </section>
  );
}

type AgentWorkspaceSaveRailProps = AgentWorkspaceSummaryProps & {
  changedTabs: string[];
  hasUnsavedChanges: boolean;
  loading: boolean;
  submitError: string | null;
  successMessage: string | null;
  canEdit: boolean;
  onSave: () => void;
  onDiscard: () => void;
  promptSyncMode: PromptSyncMode;
  hasRecommendedPromptUpdate: boolean;
  onApplyRecommendedPrompt: () => void;
};

export function AgentWorkspaceSaveRail({
  changedTabs,
  hasUnsavedChanges,
  loading,
  submitError,
  successMessage,
  canEdit,
  onSave,
  onDiscard,
  promptSyncMode,
  hasRecommendedPromptUpdate,
  onApplyRecommendedPrompt,
  ...summaryProps
}: AgentWorkspaceSaveRailProps) {
  return (
    <aside className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Guardado</p>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">
          {loading
            ? "Guardando cambios..."
            : submitError
              ? "Hay un error para revisar"
              : successMessage
                ? "Cambios guardados"
                : hasUnsavedChanges
                  ? "Cambios pendientes"
                  : canEdit
                    ? "Todo guardado"
                    : "Modo lectura"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {submitError
            ? submitError
            : successMessage
              ? successMessage
              : hasUnsavedChanges
                ? `Tienes cambios pendientes en: ${changedTabs.join(", ")}.`
                : canEdit
                  ? "Puedes seguir moviendote entre solapas sin perder el borrador actual."
                  : "Tu rol puede revisar esta configuracion, pero no modificarla."}
        </p>

        {changedTabs.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {changedTabs.map((tab) => (
              <span key={tab} className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700 ring-1 ring-inset ring-amber-200">
                {tab}
              </span>
            ))}
          </div>
        ) : null}

        {canEdit ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row xl:flex-col">
            <button
              type="button"
              onClick={onSave}
              disabled={loading || !hasUnsavedChanges}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={loading || !hasUnsavedChanges}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Descartar borrador
            </button>
          </div>
        ) : null}
      </section>

      {hasRecommendedPromptUpdate && canEdit ? (
        <section className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Prompt recomendado</p>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">El onboarding ya cambio la recomendacion</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Tu prompt actual quedo en modo manual. Puedes conservarlo o aplicar la version recomendada generada con los datos del onboarding.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700 ring-1 ring-inset ring-sky-200">
              {promptSyncMode === "recommended" ? "Sincronizado" : "Manual"}
            </span>
            <button
              type="button"
              onClick={onApplyRecommendedPrompt}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-sky-700"
            >
              Aplicar prompt recomendado
            </button>
          </div>
        </section>
      ) : null}

      <AgentWorkspaceSummary {...summaryProps} />
    </aside>
  );
}
