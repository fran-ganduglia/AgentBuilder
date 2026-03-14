import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import {
  PROMPT_TONE_LABELS,
  PROMPT_TONES,
  type PromptBuilderDraft,
} from "@/lib/agents/agent-setup";
import type { WorkflowModelRecommendation, WorkflowTemplate } from "@/lib/agents/workflow-templates";

type StepModelSelectProps = {
  workflowTemplate: WorkflowTemplate | null;
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
  onSystemPromptChange: (value: string) => void;
};

function getRecommendation(
  recommendations: WorkflowModelRecommendation[],
  model: string
): WorkflowModelRecommendation | null {
  return recommendations.find((item) => item.model === model) ?? null;
}

export function StepModelSelect({
  workflowTemplate,
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
  onSystemPromptChange,
}: StepModelSelectProps) {
  const recommendations = workflowTemplate?.recommendedModels ?? [];

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 5</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Modelo y tradeoffs</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          La recomendacion ahora se explica por workflow template, con bandas orientativas de costo, velocidad y razonamiento en vez de promesas de SLA.
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

      <details className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Configuracion avanzada</h3>
            <p className="mt-2 text-sm text-slate-600">Temperatura, tono, mensaje de apertura y system prompt final de la instancia.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 transition group-open:bg-slate-900 group-open:text-white">
            Abrir
          </span>
        </summary>

        <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="wizard-description" className="block text-sm font-semibold text-slate-700">Descripcion interna</label>
              <input
                id="wizard-description"
                type="text"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="Que resuelve esta instancia y para quien"
              />
              {errors.description ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.description}</p> : null}
            </div>
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
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="wizard-temperature" className="block text-sm font-semibold text-slate-700">Temperatura</label>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{llmTemperature.toFixed(2)}</span>
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
            <div>
              <label htmlFor="builder-opening" className="block text-sm font-semibold text-slate-700">Mensaje de apertura</label>
              <textarea
                id="builder-opening"
                rows={3}
                value={promptBuilder.openingMessage}
                onChange={(event) => onOpeningMessageChange(event.target.value)}
                className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="wizard-system-prompt" className="block text-sm font-semibold text-slate-700">System prompt final</label>
            <textarea
              id="wizard-system-prompt"
              rows={12}
              value={systemPrompt}
              onChange={(event) => onSystemPromptChange(event.target.value)}
              className="mt-2 block w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="Se autogenera a partir del workflow, la instancia y las integraciones."
            />
            {errors.systemPrompt ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.systemPrompt}</p> : null}
          </div>
        </div>
      </details>
    </section>
  );
}
