import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import {
  CHANNEL_LABELS,
  PROMPT_TONE_LABELS,
  PROMPT_TONES,
  type PromptBuilderDraft,
} from "@/lib/agents/agent-setup";

type StepBehaviorBuilderProps = {
  templateName: string;
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  recommendedPrompt: string;
  promptBuilder: PromptBuilderDraft;
  errors: Partial<Record<"name" | "description" | "systemPrompt" | "llmModel" | "llmTemperature", string>>;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
  onPromptBuilderChange: <K extends keyof PromptBuilderDraft>(field: K, value: PromptBuilderDraft[K]) => void;
  onUseRecommendedPrompt: () => void;
};

export function StepBehaviorBuilder({
  templateName,
  name,
  description,
  llmModel,
  llmTemperature,
  systemPrompt,
  recommendedPrompt,
  promptBuilder,
  errors,
  onNameChange,
  onDescriptionChange,
  onModelChange,
  onTemperatureChange,
  onSystemPromptChange,
  onPromptBuilderChange,
  onUseRecommendedPrompt,
}: StepBehaviorBuilderProps) {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 2</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Como se va a comportar</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Partimos del template <span className="font-semibold text-slate-900">{templateName}</span>, pero puedes ajustar cada recomendacion y reescribir el prompt final antes de crear el borrador.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="wizard-name" className="block text-sm font-semibold text-slate-700">Nombre del agente</label>
              <input
                id="wizard-name"
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="Ej. Soporte Tienda"
              />
              {errors.name ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.name}</p> : null}
            </div>
            <div>
              <label htmlFor="wizard-description" className="block text-sm font-semibold text-slate-700">Descripcion interna</label>
              <input
                id="wizard-description"
                type="text"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="Que resuelve y para quien"
              />
              {errors.description ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.description}</p> : null}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="builder-role" className="block text-sm font-semibold text-slate-700">Rol del agente</label>
              <input
                id="builder-role"
                type="text"
                value={promptBuilder.role}
                onChange={(event) => onPromptBuilderChange("role", event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="builder-audience" className="block text-sm font-semibold text-slate-700">A quien ayuda</label>
              <input
                id="builder-audience"
                type="text"
                value={promptBuilder.audience}
                onChange={(event) => onPromptBuilderChange("audience", event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="builder-objective" className="block text-sm font-semibold text-slate-700">Objetivo principal</label>
            <textarea
              id="builder-objective"
              rows={2}
              value={promptBuilder.objective}
              onChange={(event) => onPromptBuilderChange("objective", event.target.value)}
              className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="builder-tasks" className="block text-sm font-semibold text-slate-700">Tareas permitidas</label>
            <textarea
              id="builder-tasks"
              rows={3}
              value={promptBuilder.allowedTasks}
              onChange={(event) => onPromptBuilderChange("allowedTasks", event.target.value)}
              className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="builder-tone" className="block text-sm font-semibold text-slate-700">Tono recomendado</label>
              <select
                id="builder-tone"
                value={promptBuilder.tone}
                onChange={(event) => onPromptBuilderChange("tone", event.target.value as PromptBuilderDraft["tone"])}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {PROMPT_TONES.map((tone) => (
                  <option key={tone} value={tone}>{PROMPT_TONE_LABELS[tone]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Canal objetivo</label>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700">
                {CHANNEL_LABELS[promptBuilder.channel]}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="builder-restrictions" className="block text-sm font-semibold text-slate-700">Reglas y limites</label>
            <textarea
              id="builder-restrictions"
              rows={3}
              value={promptBuilder.restrictions}
              onChange={(event) => onPromptBuilderChange("restrictions", event.target.value)}
              className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="builder-handoff" className="block text-sm font-semibold text-slate-700">Cuando deriva a humano</label>
            <textarea
              id="builder-handoff"
              rows={2}
              value={promptBuilder.humanHandoff}
              onChange={(event) => onPromptBuilderChange("humanHandoff", event.target.value)}
              className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="builder-opening" className="block text-sm font-semibold text-slate-700">Mensaje inicial sugerido</label>
            <textarea
              id="builder-opening"
              rows={2}
              value={promptBuilder.openingMessage}
              onChange={(event) => onPromptBuilderChange("openingMessage", event.target.value)}
              className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Cerebro sugerido</h3>
                <p className="mt-2 text-sm text-slate-600">Puedes aceptarlo tal cual o editarlo manualmente.</p>
              </div>
              <button
                type="button"
                onClick={onUseRecommendedPrompt}
                className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Usar recomendacion
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-relaxed text-slate-100">
              {recommendedPrompt}
            </pre>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="wizard-model" className="block text-sm font-semibold text-slate-700">Modelo</label>
                <select
                  id="wizard-model"
                  value={llmModel}
                  onChange={(event) => onModelChange(event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  {AGENT_MODEL_OPTIONS.map((model) => (
                    <option key={model.value} value={model.value}>{model.label} ({model.badge})</option>
                  ))}
                </select>
                {errors.llmModel ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.llmModel}</p> : null}
              </div>

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
            </div>

            <div className="mt-6">
              <label htmlFor="wizard-system-prompt" className="block text-sm font-semibold text-slate-700">System prompt final</label>
              <textarea
                id="wizard-system-prompt"
                rows={12}
                value={systemPrompt}
                onChange={(event) => onSystemPromptChange(event.target.value)}
                className="mt-2 block w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="El wizard te propone una base, pero puedes editarla por completo."
              />
              {errors.systemPrompt ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.systemPrompt}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
