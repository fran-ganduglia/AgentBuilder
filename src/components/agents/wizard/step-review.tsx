import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import { CHANNEL_LABELS, getSetupProgress, type AgentSetupState } from "@/lib/agents/agent-setup";

type StepReviewProps = {
  templateName: string;
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  setupState: AgentSetupState;
};

export function StepReview({
  templateName,
  name,
  description,
  llmModel,
  llmTemperature,
  systemPrompt,
  setupState,
}: StepReviewProps) {
  const progress = getSetupProgress(setupState);
  const modelLabel = AGENT_MODEL_OPTIONS.find((item) => item.value === llmModel)?.label ?? llmModel;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 4</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Revision antes de crear</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Vamos a crear el agente en borrador, con el setup guiado persistido para que puedas continuar luego desde su detalle.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Identidad</h3>
          <p className="mt-4 text-xl font-bold tracking-tight text-slate-900">{name}</p>
          <p className="mt-2 text-sm text-slate-600">{description || "Sin descripcion interna"}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Basado en {templateName}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{CHANNEL_LABELS[setupState.channel]}</span>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Cerebro</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Modelo</p>
              <p className="mt-2 text-base font-bold text-slate-900">{modelLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Temperatura</p>
              <p className="mt-2 text-base font-bold text-slate-900">{llmTemperature.toFixed(2)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-sm leading-relaxed text-slate-100">
            {systemPrompt}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Setup guiado</h3>
            <p className="mt-2 text-sm text-slate-600">Lo obligatorio bloquea la activacion hasta quedar resuelto. Lo opcional puede seguir pendiente.</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-right ring-1 ring-inset ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Estado inicial</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{progress.completed}/{progress.total}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {setupState.checklist.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ${item.required_for_activation ? "bg-amber-50 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                  {item.required_for_activation ? "Obligatorio" : "Opcional"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Estado guardado: {item.status}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
