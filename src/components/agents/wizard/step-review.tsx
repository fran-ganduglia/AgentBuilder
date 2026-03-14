import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import {
  AUTOMATION_PRESET_LABELS,
  CHANNEL_LABELS,
  TOOL_SCOPE_PRESET_LABELS,
  getResolvedToolsForIntegration,
  getSetupProgress,
  type AgentSetupState,
} from "@/lib/agents/agent-setup";
import type { WorkflowTemplate } from "@/lib/agents/workflow-templates";
import { getWizardIntegrationById } from "@/lib/agents/wizard-integrations";

type StepReviewProps = {
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  setupState: AgentSetupState;
  workflowTemplate: WorkflowTemplate | null;
};

function isWriteAction(actionId: string): boolean {
  return ![
    "search",
    "read",
    "list",
    "check",
    "get",
  ].some((prefix) => actionId.startsWith(prefix));
}

function buildActionSummary(setupState: AgentSetupState): {
  auto: string[];
  confirm: string[];
  suggest: string[];
} {
  const selectedIntegrations = setupState.integrations.map((integrationId) => getWizardIntegrationById(integrationId));
  const auto: string[] = [];
  const confirm: string[] = [];
  const suggest: string[] = [];

  for (const integration of selectedIntegrations) {
    const resolvedTools = getResolvedToolsForIntegration(setupState, integration.id);

    if (resolvedTools.length === 0) {
      continue;
    }

    for (const actionId of resolvedTools) {
      const label = `${integration.name}: ${actionId}`;

      if (!isWriteAction(actionId)) {
        auto.push(label);
        continue;
      }

      if (setupState.automationPreset === "assisted") {
        confirm.push(label);
      } else {
        suggest.push(label);
      }
    }
  }

  return { auto, confirm, suggest };
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
  workflowTemplate,
}: StepReviewProps) {
  const progress = getSetupProgress(setupState);
  const modelLabel = AGENT_MODEL_OPTIONS.find((item) => item.value === llmModel)?.label ?? llmModel;
  const modelRecommendation = workflowTemplate?.recommendedModels.find((item) => item.model === llmModel) ?? null;
  const actionSummary = buildActionSummary(setupState);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 6</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Revision antes de crear</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          La instancia se crea en borrador, pero ya deja persistido el workflow template, el preset permitido, el alcance por integracion y las metricas observables a seguir.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Instancia</h3>
          <p className="mt-4 text-xl font-bold tracking-tight text-slate-900">{name}</p>
          <p className="mt-2 text-sm text-slate-600">{description || "Sin descripcion interna"}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            {workflowTemplate ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{workflowTemplate.name}</span> : null}
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{CHANNEL_LABELS[setupState.channel]}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{AUTOMATION_PRESET_LABELS[setupState.automationPreset ?? "copilot"]}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{TOOL_SCOPE_PRESET_LABELS[setupState.tool_scope_preset]}</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Requeridas</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {setupState.requiredIntegrations.length > 0
                  ? setupState.requiredIntegrations.map((integrationId) => getWizardIntegrationById(integrationId).name).join(", ")
                  : "Sin requeridas"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Opcionales</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {setupState.optionalIntegrations.length > 0
                  ? setupState.optionalIntegrations.map((integrationId) => getWizardIntegrationById(integrationId).name).join(", ")
                  : "Sin opcionales"}
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
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-sm leading-relaxed text-slate-100">
            {systemPrompt}
          </div>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Automatico</h3>
          <div className="mt-4">
            {renderLines(
              actionSummary.auto,
              "No hay lecturas o analisis automaticos definidos para esta instancia.",
              "rounded-xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-emerald-200"
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">Con confirmacion</h3>
          <div className="mt-4">
            {renderLines(
              actionSummary.confirm,
              "No hay escrituras con confirmacion para el preset elegido.",
              "rounded-xl bg-white/80 px-4 py-3 ring-1 ring-inset ring-amber-200"
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-sky-700">Solo sugerencia</h3>
          <div className="mt-4">
            {renderLines(
              actionSummary.suggest,
              "No hay side effects en sugerencia dentro del alcance actual.",
              "rounded-xl bg-white/80 px-4 py-3 ring-1 ring-inset ring-sky-200"
            )}
          </div>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Instance config</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Idioma</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{setupState.instanceConfig.language}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Owner</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{setupState.instanceConfig.ownerLabel || "Sin definir"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Routing</p>
              <p className="mt-2 text-sm text-slate-700">{setupState.instanceConfig.routingMode || "Sin definir"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Handoff</p>
              <p className="mt-2 text-sm text-slate-700">{setupState.instanceConfig.handoffThreshold || "Sin definir"}</p>
            </div>
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
