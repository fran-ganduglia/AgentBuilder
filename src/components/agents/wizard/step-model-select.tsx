import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import {
  PROMPT_TONE_LABELS,
  PROMPT_TONES,
  type PromptBuilderDraft,
} from "@/lib/agents/agent-setup";
import type { PublicWorkflowDefinition } from "@/lib/agents/public-workflow";
import type { WorkflowModelRecommendation } from "@/lib/agents/workflow-templates";

type StepModelSelectProps = {
  workflow: PublicWorkflowDefinition;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  promptBuilder: Pick<PromptBuilderDraft, "tone" | "openingMessage">;
  errors: Partial<Record<"description" | "systemPrompt" | "llmModel" | "llmTemperature", string>>;
  onDescriptionChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  onToneChange: (value: PromptBuilderDraft["tone"]) => void;
  onOpeningMessageChange: (value: string) => void;
};

function getRecommendation(
  recommendations: WorkflowModelRecommendation[],
  model: string
): WorkflowModelRecommendation | null {
  return recommendations.find((item) => item.model === model) ?? null;
}

export function StepModelSelect({
  workflow,
  description,
  llmModel,
  llmTemperature,
  systemPrompt,
  promptBuilder,
  errors,
  onDescriptionChange,
  onModelChange,
  onTemperatureChange,
  onToneChange,
  onOpeningMessageChange,
}: StepModelSelectProps) {
  const recommendations = workflow.recommendedModels;

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 5</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Modelo y preview</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          El prompt final se compila server-side a partir del workflow, las capacidades y las reglas del agente. Aquí solo ajustas tradeoffs y señal de respuesta.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {AGENT_MODEL_OPTIONS.map((model) => {
          const isSelected = model.value === llmModel;
          const recommendation = getRecommendation(recommendations, model.value);
          const isRecommended = Boolean(recommendation);

          return (
            <button
              key={model.value}
              type="button"
              onClick={() => onModelChange(model.value)}
              className={`rounded-2xl border p-6 text-left transition-all ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  isSelected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                }`}>
                  {model.badge}
                </span>
                {isRecommended ? (
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                    isSelected ? "bg-emerald-400/20 text-emerald-100" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {recommendation?.isPrimary ? "Recomendado" : "Alternativa"}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-bold tracking-tight">{model.label}</p>
                  <p className={`mt-2 text-sm leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                    {model.description}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {model.priceLabel}
                </span>
              </div>

              {recommendation ? (
                <div className={`mt-4 rounded-2xl p-4 text-sm ${isSelected ? "bg-white/10 text-slate-100" : "bg-slate-50 text-slate-700"}`}>
                  <p className="font-semibold">
                    Costo {recommendation.costBand} | Velocidad {recommendation.latencyBand} | Razonamiento {recommendation.reasoningBand}
                  </p>
                  <p className="mt-2">{recommendation.tradeoffCopy}</p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      {errors.llmModel ? <p className="text-xs font-medium text-rose-600">{errors.llmModel}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Ajustes de respuesta</h3>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="wizard-description" className="block text-sm font-semibold text-slate-700">
                Descripcion interna
              </label>
              <input
                id="wizard-description"
                type="text"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="Que resuelve este agente y para quien"
              />
              {errors.description ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.description}</p> : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="builder-tone" className="block text-sm font-semibold text-slate-700">Tono</label>
                <select
                  id="builder-tone"
                  value={promptBuilder.tone}
                  onChange={(event) => onToneChange(event.target.value as PromptBuilderDraft["tone"])}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  {PROMPT_TONES.map((tone) => (
                    <option key={tone} value={tone}>{PROMPT_TONE_LABELS[tone]}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="wizard-temperature" className="block text-sm font-semibold text-slate-700">
                    Temperatura
                  </label>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {llmTemperature.toFixed(2)}
                  </span>
                </div>
                <input
                  id="wizard-temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={llmTemperature}
                  onChange={(event) => onTemperatureChange(parseFloat(event.target.value))}
                  className="mt-4 w-full accent-slate-900"
                />
                {errors.llmTemperature ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.llmTemperature}</p> : null}
              </div>
            </div>

            <div>
              <label htmlFor="builder-opening" className="block text-sm font-semibold text-slate-700">
                Mensaje de apertura
              </label>
              <textarea
                id="builder-opening"
                rows={3}
                value={promptBuilder.openingMessage}
                onChange={(event) => onOpeningMessageChange(event.target.value)}
                className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
            Prompt compilado
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Vista previa de solo lectura del prompt generado desde el backend.
          </p>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-white/10 p-4 text-sm leading-relaxed text-slate-100">
            {systemPrompt}
          </pre>
          {errors.systemPrompt ? <p className="mt-2 text-xs font-medium text-rose-300">{errors.systemPrompt}</p> : null}
        </article>
      </div>
    </section>
  );
}
