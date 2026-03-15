import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import {
  CHANNEL_LABELS,
  TOOL_SCOPE_PRESET_LABELS,
  getResolvedToolsForIntegration,
  getSetupProgress,
  type AgentSetupState,
} from "@/lib/agents/agent-setup";
import {
  AGENT_CAPABILITY_LABELS,
  type PublicWorkflowDefinition,
} from "@/lib/agents/public-workflow";
import { AGENT_SCOPE_LABELS } from "@/lib/agents/agent-scope";
import { getWizardIntegrationById } from "@/lib/agents/wizard-integrations";

type StepReviewProps = {
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  setupState: AgentSetupState;
  workflow: PublicWorkflowDefinition;
};

function isWriteAction(actionId: string): boolean {
  return !["search", "read", "list", "check", "get"].some((prefix) => actionId.startsWith(prefix));
}

function buildActionSummary(setupState: AgentSetupState): {
  auto: string[];
  confirm: string[];
} {
  const selectedIntegrations = setupState.integrations.map((integrationId) => getWizardIntegrationById(integrationId));
  const auto: string[] = [];
  const confirm: string[] = [];

  for (const integration of selectedIntegrations) {
    const resolvedTools = getResolvedToolsForIntegration(setupState, integration.id);

    for (const actionId of resolvedTools) {
      const label = `${integration.name}: ${actionId}`;

      if (!isWriteAction(actionId)) {
        auto.push(label);
        continue;
      }

      confirm.push(label);
    }
  }

  return { auto, confirm };
}

function renderLines(lines: string[], empty: string, className: string) {
  if (lines.length === 0) {
    return <p className={className}>{empty}</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {lines.map((line) => (
        <p key={line} className={className}>{line}</p>
      ))}
    </div>
  );
}

export function StepReview({
  name,
  description,
  llmModel,
  llmTemperature,
  systemPrompt,
  setupState,
  workflow,
}: StepReviewProps) {
  const progress = getSetupProgress(setupState);
  const modelLabel = AGENT_MODEL_OPTIONS.find((item) => item.value === llmModel)?.label ?? llmModel;
  const modelRecommendation = workflow.recommendedModels.find((item) => item.model === llmModel) ?? null;
  const actionSummary = buildActionSummary(setupState);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 6</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Revision antes de crear</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          El agente se crea en borrador con un scope publico definido, capacidades activas, integraciones seleccionadas y prompt compilado.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Agente</h3>
          <p className="mt-4 text-xl font-bold tracking-tight text-slate-900">{name}</p>
          <p className="mt-2 text-sm text-slate-600">{description || "Sin descripcion interna"}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{workflow.name}</span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">{AGENT_SCOPE_LABELS[setupState.agentScope]}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{CHANNEL_LABELS[setupState.channel]}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{TOOL_SCOPE_PRESET_LABELS[setupState.tool_scope_preset]}</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Integraciones</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {setupState.integrations.length > 0
                  ? setupState.integrations.map((integrationId) => getWizardIntegrationById(integrationId).name).join(", ")
                  : "Sin integraciones"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Scope</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {AGENT_SCOPE_LABELS[setupState.agentScope]}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Capacidades</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {setupState.capabilities.map((capability) => AGENT_CAPABILITY_LABELS[capability]).join(", ")}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Modelo</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Modelo elegido</p>
              <p className="mt-2 text-base font-bold text-slate-900">{modelLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Temperatura</p>
              <p className="mt-2 text-base font-bold text-slate-900">{llmTemperature.toFixed(2)}</p>
            </div>
          </div>
          {modelRecommendation ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Tradeoff orientativo</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                Costo {modelRecommendation.costBand} | Velocidad {modelRecommendation.latencyBand} | Razonamiento {modelRecommendation.reasoningBand}
              </p>
              <p className="mt-2 text-sm text-slate-600">{modelRecommendation.tradeoffCopy}</p>
            </div>
          ) : null}
          <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-relaxed text-slate-100">
            {systemPrompt}
          </pre>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Automatico</h3>
          <div className="mt-4">
            {renderLines(
              actionSummary.auto,
              "No hay lecturas o analisis automaticos definidos para este agente.",
              "rounded-xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-emerald-200"
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">Con approval</h3>
          <div className="mt-4">
            {renderLines(
              actionSummary.confirm,
              "No hay escrituras con approval dentro del alcance actual.",
              "rounded-xl bg-white/80 px-4 py-3 ring-1 ring-inset ring-amber-200"
            )}
          </div>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Instrucciones de negocio</h3>
          <div className="mt-5 space-y-3 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Objetivo:</span> {setupState.businessInstructions.objective || "Sin definir"}</p>
            <p><span className="font-semibold text-slate-900">Contexto:</span> {setupState.businessInstructions.context || "Sin definir"}</p>
            <p><span className="font-semibold text-slate-900">Tareas:</span> {setupState.businessInstructions.tasks || "Sin definir"}</p>
            <p><span className="font-semibold text-slate-900">Restricciones:</span> {setupState.businessInstructions.restrictions || "Sin definir"}</p>
            <p><span className="font-semibold text-slate-900">Handoff:</span> {setupState.businessInstructions.handoffCriteria || "Sin definir"}</p>
            <p><span className="font-semibold text-slate-900">Fuera de scope:</span> rechazar y derivar</p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Setup guiado</h3>
              <p className="mt-2 text-sm text-slate-600">Compatibilidad preservada con el checklist persistido del repo actual.</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-right ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Estado inicial</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{progress.completed}/{progress.total}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {setupState.successMetrics.map((metric) => (
              <span key={metric} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {metric}
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
