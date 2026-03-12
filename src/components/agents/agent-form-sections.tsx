import { AGENT_MODEL_OPTIONS } from "@/lib/agents/agent-config";
import type { AgentStatus, Integration } from "@/types/app";
import { AGENT_STATUSES, getTemperatureLabel, type AgentFormErrors, type AgentFormFields } from "@/components/agents/agent-form-shared";

type ChangeHandler = <K extends keyof AgentFormFields>(field: K, value: AgentFormFields[K]) => void;

type IdentitySectionProps = {
  fields: AgentFormFields;
  errors: AgentFormErrors;
  onChange: ChangeHandler;
  disabled?: boolean;
};

export function AgentIdentitySection({ fields, errors, onChange, disabled = false }: IdentitySectionProps) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,_#ffffff,_#f8fafc)] p-6 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Identidad</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Perfil publico del agente</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
          Character core
        </span>
      </div>

      <div className="mt-6 grid gap-5">
        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-slate-700">Nombre publico</label>
          <input
            id="name"
            type="text"
            value={fields.name}
            onChange={(event) => onChange("name", event.target.value)}
            disabled={disabled}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            placeholder="Ej. Asistente Financiero"
          />
          {errors.name ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-slate-700">Descripcion interna</label>
          <textarea
            id="description"
            rows={3}
            value={fields.description}
            onChange={(event) => onChange("description", event.target.value)}
            disabled={disabled}
            className="mt-2 block w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            placeholder="De que se encarga este agente en tu organizacion"
          />
          {errors.description ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.description}</p> : null}
        </div>
      </div>
    </section>
  );
}

type BehaviorSectionProps = {
  fields: AgentFormFields;
  errors: AgentFormErrors;
  promptWords: number;
  promptLines: number;
  onChange: ChangeHandler;
  disabled?: boolean;
};

export function AgentBehaviorSection({
  fields,
  errors,
  promptWords,
  promptLines,
  onChange,
  disabled = false,
}: BehaviorSectionProps) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Comportamiento</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">System prompt final</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Escribe la personalidad, los limites y la forma de responder. La informacion cambiante o extensa conviene llevarla a la base documental.
          </p>
        </div>
        <div className="hidden rounded-2xl bg-slate-950 px-4 py-3 text-right text-slate-100 sm:block">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Prompt vivo</p>
          <p className="mt-2 text-sm font-semibold">{promptWords} palabras</p>
          <p className="text-xs text-slate-400">{promptLines} lineas</p>
        </div>
      </div>

      <textarea
        id="systemPrompt"
        rows={14}
        value={fields.systemPrompt}
        onChange={(event) => onChange("systemPrompt", event.target.value)}
        disabled={disabled}
        className="mt-6 block w-full resize-y rounded-[1.5rem] border border-slate-300 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        placeholder="Eres una IA experta en..."
      />
      {errors.systemPrompt ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.systemPrompt}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-700">Consejo</p>
          <p className="mt-1 text-sm text-slate-600">Evita meter credenciales, politicas secretas o datos privados en el prompt.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-700">Separacion de contexto</p>
          <p className="mt-1 text-sm text-slate-600">Usa la base de conocimientos para material de soporte y deja el prompt para reglas estables.</p>
        </div>
      </div>
    </section>
  );
}

type EngineSectionProps = {
  fields: AgentFormFields;
  errors: AgentFormErrors;
  onChange: ChangeHandler;
  disabled?: boolean;
};

export function AgentEngineSection({ fields, errors, onChange, disabled = false }: EngineSectionProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Motor</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Modelo seleccionado</h2>
        <div className="relative mt-6">
          <select
            id="llmModel"
            value={fields.llmModel}
            onChange={(event) => onChange("llmModel", event.target.value)}
            disabled={disabled}
            className="block w-full appearance-none rounded-2xl border border-slate-300 bg-slate-50 py-3 pl-4 pr-10 text-sm font-medium text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          >
            {AGENT_MODEL_OPTIONS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label} ({model.badge})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        </div>
        {errors.llmModel ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.llmModel}</p> : null}
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Ajuste creativo</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Temperatura</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
            {fields.llmTemperature.toFixed(2)}
          </span>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Preciso</span>
            <span>{getTemperatureLabel(fields.llmTemperature)}</span>
            <span>Creativo</span>
          </div>
          <input
            id="llmTemperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={fields.llmTemperature}
            onChange={(event) => onChange("llmTemperature", parseFloat(event.target.value))}
            disabled={disabled}
            className="mt-5 w-full accent-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {errors.llmTemperature ? <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.llmTemperature}</p> : null}
      </div>
    </section>
  );
}

type StateSectionProps = {
  fields: AgentFormFields;
  isEditing: boolean;
  canCreateConnectedAgent: boolean;
  availableIntegrations: Integration[];
  onChange: ChangeHandler;
  statusDisabled?: boolean;
};

export function AgentStateSection({
  fields,
  isEditing,
  canCreateConnectedAgent,
  availableIntegrations,
  onChange,
  statusDisabled = false,
}: StateSectionProps) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Estado</p>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Operacion del agente</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {isEditing ? (
          <div>
            <label htmlFor="status" className="block text-sm font-semibold text-slate-700">Estado de produccion</label>
            <select
              id="status"
              value={fields.status}
              onChange={(event) => onChange("status", event.target.value as AgentStatus)}
              disabled={statusDisabled}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              {AGENT_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        {!isEditing && canCreateConnectedAgent ? (
          <div>
            <label htmlFor="integrationId" className="block text-sm font-semibold text-slate-700">Integracion externa</label>
            <select
              id="integrationId"
              value={fields.integrationId}
              onChange={(event) => onChange("integrationId", event.target.value)}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">Alojamiento local</option>
              {availableIntegrations.map((integration) => (
                <option key={integration.id} value={integration.id}>{integration.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </section>
  );
}
