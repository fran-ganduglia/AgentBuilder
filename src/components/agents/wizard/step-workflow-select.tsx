import {
  getVisibleWorkflowTemplates,
  type WorkflowTemplate,
  type WorkflowTemplateId,
} from "@/lib/agents/workflow-templates";

type StepWorkflowSelectProps = {
  selectedWorkflowTemplateId: WorkflowTemplateId | null;
  error?: string;
  onSelectWorkflow: (workflowTemplateId: WorkflowTemplateId) => void;
};

function groupLabel(template: WorkflowTemplate): string {
  if (template.isAdvanced) return "Modo avanzado";
  if (template.phase === 2) return "Wave 1 vendible";
  if (template.phase === 3) return "Wave 2 roadmap";
  return "Catalogo";
}

export function StepWorkflowSelect({
  selectedWorkflowTemplateId,
  error,
  onSelectWorkflow,
}: StepWorkflowSelectProps) {
  const templates = getVisibleWorkflowTemplates();

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 1</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Elige el workflow template</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          El objeto principal ahora es una instancia configurada de workflow. Primero eliges el template del catalogo y despues creas una instancia con su chat dedicado.
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {templates.map((template) => {
          const isSelected = selectedWorkflowTemplateId === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectWorkflow(template.id)}
              className={`rounded-3xl border p-6 text-left transition-all ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-900/10"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  isSelected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                }`}>
                  {groupLabel(template)}
                </span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  isSelected ? "bg-emerald-400/20 text-emerald-100" : "bg-emerald-50 text-emerald-700"
                }`}>
                  {template.category}
                </span>
              </div>

              <div className="mt-4">
                <p className="text-xl font-bold tracking-tight">{template.name}</p>
                <p className={`mt-2 text-sm leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                  {template.tagline}
                </p>
                <p className={`mt-4 text-sm leading-relaxed ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                  {template.description}
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl p-4 ${isSelected ? "bg-white/10" : "bg-slate-50"}`}>
                  <p className="text-xs font-semibold uppercase tracking-widest">Requeridas</p>
                  <p className="mt-2 text-sm font-semibold">
                    {template.requiredIntegrations.length > 0
                      ? template.requiredIntegrations.join(", ")
                      : "Sin requeridas"}
                  </p>
                </div>
                <div className={`rounded-2xl p-4 ${isSelected ? "bg-white/10" : "bg-slate-50"}`}>
                  <p className="text-xs font-semibold uppercase tracking-widest">Preset permitido</p>
                  <p className="mt-2 text-sm font-semibold">
                    {template.allowedAutomationPresets.join(", ")}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
