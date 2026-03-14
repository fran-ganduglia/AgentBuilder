import {
  AUTOMATION_PRESET_DESCRIPTIONS,
  AUTOMATION_PRESET_LABELS,
} from "@/lib/agents/agent-setup";
import type {
  AutomationPreset,
  SuccessMetricId,
  WorkflowInstanceConfig,
  WorkflowTemplate,
} from "@/lib/agents/workflow-templates";

const SUCCESS_METRIC_LABELS: Record<SuccessMetricId, string> = {
  conversation_volume: "Volumen de conversaciones",
  messages_processed: "Mensajes procesados",
  actions_executed: "Acciones ejecutadas",
  action_success_rate: "Exito/fallo de acciones",
  human_escalations: "Escalaciones a humano",
  confirmation_requests: "Confirmaciones solicitadas",
  latency_p95: "Latencia promedio y p95",
  integration_incidents: "Incidentes por integracion",
};

type StepWorkflowRulesProps = {
  workflowTemplate: WorkflowTemplate | null;
  automationPreset: AutomationPreset | null;
  instanceConfig: WorkflowInstanceConfig;
  successMetrics: SuccessMetricId[];
  onAutomationPresetChange: (value: AutomationPreset) => void;
  onInstanceConfigChange: (patch: Partial<WorkflowInstanceConfig>) => void;
  onToggleSuccessMetric: (metric: SuccessMetricId) => void;
};

export function StepWorkflowRules({
  workflowTemplate,
  automationPreset,
  instanceConfig,
  successMetrics,
  onAutomationPresetChange,
  onInstanceConfigChange,
  onToggleSuccessMetric,
}: StepWorkflowRulesProps) {
  const allowedPresets = workflowTemplate?.allowedAutomationPresets ?? [];

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 4</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Reglas y gobernanza</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          El preset de automatizacion queda restringido por template. Tambien puedes ajustar el enrutamiento operativo, el threshold de handoff y las metricas observables a seguir.
        </p>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Automation preset</h3>
            <p className="mt-2 text-sm text-slate-600">La instancia solo puede usar presets permitidos por su workflow template.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {automationPreset ?? "Sin definir"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {allowedPresets.map((preset) => {
            const isActive = automationPreset === preset;

            return (
              <button
                key={preset}
                type="button"
                onClick={() => onAutomationPresetChange(preset)}
                className={`rounded-2xl border p-5 text-left transition-all ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <p className="text-base font-bold">{AUTOMATION_PRESET_LABELS[preset]}</p>
                <p className={`mt-3 text-sm leading-relaxed ${isActive ? "text-slate-200" : "text-slate-600"}`}>
                  {AUTOMATION_PRESET_DESCRIPTIONS[preset]}
                </p>
              </button>
            );
          })}
        </div>
      </article>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Reglas operativas</h3>
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="routing-mode" className="block text-sm font-semibold text-slate-700">Routing / owner</label>
              <textarea
                id="routing-mode"
                rows={3}
                value={instanceConfig.routingMode}
                onChange={(event) => onInstanceConfigChange({ routingMode: event.target.value })}
                className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="handoff-threshold" className="block text-sm font-semibold text-slate-700">Threshold de handoff</label>
              <textarea
                id="handoff-threshold"
                rows={3}
                value={instanceConfig.handoffThreshold}
                onChange={(event) => onInstanceConfigChange({ handoffThreshold: event.target.value })}
                className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="schedule-summary" className="block text-sm font-semibold text-slate-700">Horarios</label>
                <textarea
                  id="schedule-summary"
                  rows={3}
                  value={instanceConfig.scheduleSummary}
                  onChange={(event) => onInstanceConfigChange({ scheduleSummary: event.target.value })}
                  className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="tone-summary" className="block text-sm font-semibold text-slate-700">Tono operativo</label>
                <textarea
                  id="tone-summary"
                  rows={3}
                  value={instanceConfig.toneSummary}
                  onChange={(event) => onInstanceConfigChange({ toneSummary: event.target.value })}
                  className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Metricas observables</h3>
          <p className="mt-2 text-sm text-slate-600">Solo se muestran metricas directamente medibles en esta fase.</p>

          <div className="mt-5 space-y-3">
            {(workflowTemplate?.successMetrics ?? []).map((metric) => {
              const isSelected = successMetrics.includes(metric);

              return (
                <label
                  key={metric}
                  className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                    isSelected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSuccessMetric(metric)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-sm font-semibold text-slate-900">{SUCCESS_METRIC_LABELS[metric]}</span>
                </label>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
