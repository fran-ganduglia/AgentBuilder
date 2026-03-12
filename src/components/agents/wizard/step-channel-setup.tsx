import {
  CHANNEL_LABELS,
  type AgentSetupChecklistItemStatus,
  type AgentSetupState,
  type PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import { getSetupProgress } from "@/lib/agents/agent-setup";
import { SetupChecklistEditor } from "@/components/agents/setup-checklist-editor";

type StepChannelSetupProps = {
  templateName: string;
  setupState: AgentSetupState;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange: (field: PromptBuilderTextField, value: string) => void;
};

const CHANNEL_NOTES = {
  whatsapp: "Preparamos tono, derivacion y operativa de atencion. La conexion real a WhatsApp se completa despues.",
  web: "Este canal queda mas cerca de uso real. Aprovecha este paso para dejar lista la base documental y la experiencia inicial.",
  api: "Aqui dejamos definido el comportamiento y la consistencia de salida. La integracion tecnica real se hace mas adelante.",
  email: "Este canal queda en modo preparacion. Dejamos claro el estilo y los criterios para retomarlo cuando toque integrarlo.",
} as const;

export function StepChannelSetup({
  templateName,
  setupState,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
}: StepChannelSetupProps) {
  const progress = getSetupProgress(setupState);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 3</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Setup interactivo del canal</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Este borrador nace con onboarding guiado. Ahora cada requisito obligatorio se valida con datos reales para {templateName.toLowerCase()}, no solo con checks manuales.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              {CHANNEL_LABELS[setupState.channel]}
            </span>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{CHANNEL_NOTES[setupState.channel]}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-right ring-1 ring-inset ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Progreso</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{progress.percent}%</p>
            <p className="text-xs text-slate-500">{progress.completed} de {progress.total} items completos</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      <SetupChecklistEditor
        setupState={setupState}
        canEdit
        onTaskDataChange={onTaskDataChange}
        onManualStatusChange={onManualStatusChange}
        onBuilderDraftChange={onBuilderDraftChange}
      />
    </section>
  );
}
