import {
  AGENT_SCOPE_DESCRIPTIONS,
  AGENT_SCOPE_LABELS,
  type AgentScope,
} from "@/lib/agents/agent-scope";

type StepWorkflowSelectProps = {
  selectedScope: AgentScope;
  error?: string;
  onSelectScope: (scope: AgentScope) => void;
};

export function StepWorkflowSelect({
  selectedScope,
  error,
  onSelectScope,
}: StepWorkflowSelectProps) {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 1</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Elige el tipo de agente
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Todos los agentes nuevos comparten el mismo workflow tecnico, pero su identidad publica
          y su policy operativa arrancan por scope.
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {(["support", "sales", "operations"] as const).map((scope) => {
          const isActive = selectedScope === scope;

          return (
            <button
              key={scope}
              type="button"
              onClick={() => onSelectScope(scope)}
              className={`rounded-3xl border p-6 text-left shadow-sm transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-900/10"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-md"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  Tipo de agente
                </span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  isActive ? "bg-emerald-400/20 text-emerald-100" : "bg-emerald-50 text-emerald-700"
                }`}>
                  {AGENT_SCOPE_LABELS[scope]}
                </span>
              </div>

              <div className="mt-4">
                <p className="text-xl font-bold tracking-tight">{AGENT_SCOPE_LABELS[scope]}</p>
                <p className={`mt-3 text-sm leading-relaxed ${
                  isActive ? "text-slate-200" : "text-slate-600"
                }`}>
                  {AGENT_SCOPE_DESCRIPTIONS[scope]}
                </p>
              </div>

              <div className={`mt-5 rounded-2xl p-4 ${
                isActive ? "bg-white/10" : "bg-slate-50 ring-1 ring-inset ring-slate-200"
              }`}>
                <p className="text-xs font-semibold uppercase tracking-widest">Policy fuera de scope</p>
                <p className="mt-2 text-sm font-semibold">
                  Rechazar y derivar antes de usar tools sensibles
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
