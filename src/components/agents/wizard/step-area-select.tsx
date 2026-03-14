import { AGENT_AREAS, AGENT_AREA_LABELS, type AgentArea } from "@/lib/agents/agent-setup";

type StepAreaSelectProps = {
  name: string;
  selectedAreas: AgentArea[];
  error?: string;
  onNameChange: (value: string) => void;
  onToggleArea: (area: AgentArea) => void;
};

export function StepAreaSelect({
  name,
  selectedAreas,
  error,
  onNameChange,
  onToggleArea,
}: StepAreaSelectProps) {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 1</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Proposito y alcance</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Define el nombre del agente y las areas de negocio que debe cubrir. Puedes combinar varias sin quedar atado a un solo template.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="wizard-name" className="block text-sm font-semibold text-slate-700">
            Nombre del agente
          </label>
          <input
            id="wizard-name"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            placeholder="Ej. Revenue Copilot"
          />
          {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Resumen</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{name.trim() || "Tu agente todavia no tiene nombre"}</p>
            <p className="mt-2 text-sm text-slate-600">
              {selectedAreas.length > 0
                ? `Trabajara sobre ${selectedAreas.map((area) => AGENT_AREA_LABELS[area].toLowerCase()).join(", ")}.`
                : "Selecciona al menos un area para orientar modelo, tools y recomendaciones."}
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Areas de negocio</h3>
              <p className="mt-2 text-sm text-slate-600">Multi-select. Un mismo agente puede operar en varias superficies desde el inicio.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {selectedAreas.length} seleccionadas
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {AGENT_AREAS.map((area) => {
              const isSelected = selectedAreas.includes(area);

              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => onToggleArea(area)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-bold">{AGENT_AREA_LABELS[area]}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${
                      isSelected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {isSelected ? "Activa" : "Sumar"}
                    </span>
                  </div>
                  <p className={`mt-3 text-sm leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                    {area === "sales" ? "Calificacion, seguimiento comercial y pipeline." : null}
                    {area === "marketing" ? "Campanas, mensajes y automatizaciones de crecimiento." : null}
                    {area === "analysis" ? "Analisis, consolidacion y razonamiento sobre datos." : null}
                    {area === "support" ? "Soporte, FAQs y resolucion de consultas operativas." : null}
                  </p>
                </button>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
