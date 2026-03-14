import Link from "next/link";
import {
  CUSTOM_TOOL_SCOPE_TASK_KEY,
  TOOL_SCOPE_PRESET_DESCRIPTIONS,
  TOOL_SCOPE_PRESET_LABELS,
  TOOL_SCOPE_PRESETS,
  getAvailableToolScopeOptions,
  type ToolScopePreset,
} from "@/lib/agents/agent-setup";
import {
  getIntegrationPlanUpsell,
  getMaxIntegrations,
  hasIntegrationLimitReached,
  type OrganizationPlanName,
} from "@/lib/agents/agent-integration-limits";
import { getWizardIntegrationById, type WizardIntegrationId } from "@/lib/agents/wizard-integrations";

type ConnectionTone = "emerald" | "amber" | "rose" | "slate";

export type WizardIntegrationConnectionState = {
  label: string;
  summary: string;
  tone: ConnectionTone;
};

type StepIntegrationsScopeProps = {
  selectedIntegrationIds: WizardIntegrationId[];
  requiredIntegrationIds: WizardIntegrationId[];
  optionalIntegrationIds: WizardIntegrationId[];
  toolScopePreset: ToolScopePreset;
  customSelections: Partial<Record<WizardIntegrationId, string[]>>;
  connectionStates: Partial<Record<WizardIntegrationId, WizardIntegrationConnectionState>>;
  planName: OrganizationPlanName;
  onToggleOptionalIntegration: (integrationId: WizardIntegrationId) => void;
  onSelectPreset: (preset: ToolScopePreset) => void;
  onToggleCustomAction: (integrationId: WizardIntegrationId, actionId: string) => void;
};

const TONE_STYLES: Record<ConnectionTone, string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  slate: "bg-slate-100 text-slate-700",
};

function formatIntegrationCount(count: number): string {
  return `${count} integracion${count === 1 ? "" : "es"}`;
}

function renderIntegrationCard(input: {
  integrationId: WizardIntegrationId;
  selected: boolean;
  required: boolean;
  connectionState?: WizardIntegrationConnectionState;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const integration = getWizardIntegrationById(input.integrationId);

  return (
    <button
      key={integration.id}
      type="button"
      onClick={input.onClick}
      disabled={input.disabled}
      className={`rounded-2xl border p-5 text-left transition-all ${
        input.selected
          ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
      } ${input.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{integration.name}</p>
          <p className={`mt-2 text-sm leading-relaxed ${input.selected ? "text-slate-200" : "text-slate-600"}`}>
            {integration.description}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
          input.selected
            ? "bg-white/15 text-white"
            : input.required
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-700"
        }`}>
          {input.required ? "Requerida" : input.selected ? "Activa" : "Opcional"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${TONE_STYLES[input.connectionState?.tone ?? "slate"]}`}>
          {input.connectionState?.label ?? "Sin conectar"}
        </span>
        <p className={`text-xs ${input.selected ? "text-slate-300" : "text-slate-500"}`}>
          {input.connectionState?.summary ?? "Pendiente de configuracion"}
        </p>
      </div>
    </button>
  );
}

export function StepIntegrationsScope({
  selectedIntegrationIds,
  requiredIntegrationIds,
  optionalIntegrationIds,
  toolScopePreset,
  customSelections,
  connectionStates,
  planName,
  onToggleOptionalIntegration,
  onSelectPreset,
  onToggleCustomAction,
}: StepIntegrationsScopeProps) {
  const scopedIntegrations = selectedIntegrationIds.filter(
    (integrationId) => getAvailableToolScopeOptions(integrationId).length > 0
  );
  const maxIntegrations = getMaxIntegrations(planName);
  const upsell = getIntegrationPlanUpsell(planName);
  const selectedCount = selectedIntegrationIds.length;
  const hasReachedPlanLimit = hasIntegrationLimitReached(planName, selectedCount);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 3</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Conecta sistemas requeridos y opcionales</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Las integraciones requeridas quedan fijas por workflow template. Las opcionales pueden sumarse para enriquecer contexto sin bloquear la creacion del borrador.
        </p>
      </div>

      {maxIntegrations !== null && upsell ? (
        <div className={`rounded-2xl border p-5 shadow-sm ${hasReachedPlanLimit ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className={`text-sm font-semibold ${hasReachedPlanLimit ? "text-amber-900" : "text-slate-900"}`}>{upsell.title}</p>
              <p className={`text-sm ${hasReachedPlanLimit ? "text-amber-800" : "text-slate-600"}`}>
                {hasReachedPlanLimit
                  ? `Ya seleccionaste ${formatIntegrationCount(selectedCount)}. Para sumar otra integracion necesitas ampliar el plan.`
                  : `Puedes seleccionar hasta ${formatIntegrationCount(maxIntegrations)} por instancia. Llevas ${selectedCount}.`}
              </p>
            </div>
            <Link
              href={upsell.href}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${hasReachedPlanLimit ? "bg-amber-900 text-white hover:bg-amber-950" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              {upsell.ctaLabel}
            </Link>
          </div>
        </div>
      ) : null}

      {requiredIntegrationIds.length > 0 ? (
        <article className="space-y-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Requeridas</h3>
            <p className="mt-2 text-sm text-slate-600">Si una requerida no esta conectada, la instancia no se puede crear desde este wizard.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {requiredIntegrationIds.map((integrationId) => renderIntegrationCard({
              integrationId,
              selected: true,
              required: true,
              connectionState: connectionStates[integrationId],
              disabled: true,
            }))}
          </div>
        </article>
      ) : null}

      {optionalIntegrationIds.length > 0 ? (
        <article className="space-y-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Opcionales</h3>
            <p className="mt-2 text-sm text-slate-600">Puedes activarlas para dar mas contexto a la instancia. Si faltan, el borrador igual puede crearse.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {optionalIntegrationIds.map((integrationId) => {
              const isSelected = selectedIntegrationIds.includes(integrationId);
              const isDisabledByPlan =
                !isSelected && maxIntegrations !== null && hasReachedPlanLimit;

              return renderIntegrationCard({
                integrationId,
                selected: isSelected,
                required: false,
                connectionState: connectionStates[integrationId],
                disabled: isDisabledByPlan,
                onClick: () => onToggleOptionalIntegration(integrationId),
              });
            })}
          </div>
        </article>
      ) : null}

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Alcance tecnico de tools</h3>
            <p className="mt-2 text-sm text-slate-600">Mantiene el concepto actual del repo para decidir que tools se auto-vinculan por integracion.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {TOOL_SCOPE_PRESET_LABELS[toolScopePreset]}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {TOOL_SCOPE_PRESETS.map((preset) => {
            const isActive = preset === toolScopePreset;

            return (
              <button
                key={preset}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`rounded-2xl border p-5 text-left transition-all ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <p className="text-base font-bold">{TOOL_SCOPE_PRESET_LABELS[preset]}</p>
                <p className={`mt-3 text-sm leading-relaxed ${isActive ? "text-slate-200" : "text-slate-600"}`}>
                  {TOOL_SCOPE_PRESET_DESCRIPTIONS[preset]}
                </p>
              </button>
            );
          })}
        </div>
      </article>

      {toolScopePreset === "custom" ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Checklist granular</h3>
              <p className="mt-2 text-sm text-slate-600">Se persiste en `{CUSTOM_TOOL_SCOPE_TASK_KEY}` dentro del setup_state para mantener compatibilidad con el backend actual.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Custom</span>
          </div>

          {scopedIntegrations.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              Esta instancia no tiene integraciones con checklist granular disponible en este paso.
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {scopedIntegrations.map((integrationId) => {
                const options = getAvailableToolScopeOptions(integrationId);
                const selected = customSelections[integrationId] ?? [];

                return (
                  <div key={integrationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">{integrationId}</p>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-200">
                        {selected.length}/{options.length} acciones
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {options.map((option) => {
                        const isChecked = selected.includes(option.id);

                        return (
                          <label key={option.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                            isChecked ? "border-slate-900 bg-white" : "border-slate-200 bg-white/70 hover:border-slate-300"
                          }`}>
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                              checked={isChecked}
                              onChange={() => onToggleCustomAction(integrationId, option.id)}
                            />
                            <span>
                              <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                              <span className="mt-1 block text-sm text-slate-600">{option.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
