import type { WorkflowInstanceConfig, WorkflowTemplate } from "@/lib/agents/workflow-templates";

type StepInstanceConfigProps = {
  workflowTemplate: WorkflowTemplate | null;
  name: string;
  description: string;
  instanceConfig: WorkflowInstanceConfig;
  error?: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onInstanceConfigChange: (patch: Partial<WorkflowInstanceConfig>) => void;
};

export function StepInstanceConfig({
  workflowTemplate,
  name,
  description,
  instanceConfig,
  error,
  onNameChange,
  onDescriptionChange,
  onInstanceConfigChange,
}: StepInstanceConfigProps) {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 2</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Crea la workflow instance</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          La organizacion puede tener varias instancias del mismo template. Cada una entra por su propio chat y puede variar owner, idioma, horarios y tono operativo.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="instance-name" className="block text-sm font-semibold text-slate-700">
            Nombre de la instancia
          </label>
          <input
            id="instance-name"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            placeholder="Ej. Follow-up Latam"
          />
          {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}

          <label htmlFor="instance-description" className="mt-5 block text-sm font-semibold text-slate-700">
            Descripcion interna
          </label>
          <textarea
            id="instance-description"
            rows={3}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            placeholder="Segmento, owner o regla principal de esta instancia"
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="instance-language" className="block text-sm font-semibold text-slate-700">
                Idioma
              </label>
              <input
                id="instance-language"
                type="text"
                value={instanceConfig.language}
                onChange={(event) => onInstanceConfigChange({ language: event.target.value })}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="instance-owner" className="block text-sm font-semibold text-slate-700">
                Owner o cola
              </label>
              <input
                id="instance-owner"
                type="text"
                value={instanceConfig.ownerLabel}
                onChange={(event) => onInstanceConfigChange({ ownerLabel: event.target.value })}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Preview</p>
          <p className="mt-3 text-2xl font-bold tracking-tight">{name.trim() || "Nueva workflow instance"}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {workflowTemplate?.name ?? "Selecciona un workflow"} con chat dedicado, configuracion propia y multiples instancias por organizacion.
          </p>

          <div className="mt-6 space-y-3 text-sm">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Routing</p>
              <p className="mt-2">{instanceConfig.routingMode || workflowTemplate?.defaultInstanceConfig.routingMode || "Define como se segmenta esta instancia."}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Tono</p>
              <p className="mt-2">{instanceConfig.toneSummary || workflowTemplate?.defaultInstanceConfig.toneSummary || "Define el tono operativo."}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
