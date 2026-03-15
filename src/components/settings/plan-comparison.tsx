type PlanInfo = {
  id: string;
  name: string;
  priceMonthly: number | null;
  maxScopes: number | null;
  maxUsers: number | null;
  maxSessions: number | null;
};

type PlanComparisonProps = {
  plans: PlanInfo[];
  currentPlanId: string;
};

function formatNumber(value: number | null): string {
  if (value === null || value < 0 || value >= 999999) return "Ilimitado";
  return value.toLocaleString("es-ES");
}

function formatPrice(value: number | null): string {
  if (value === null) return "Custom";
  if (value === 0) return "Gratis";
  return `$${value}/mes`;
}

export function PlanComparison({ plans, currentPlanId }: PlanComparisonProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Plan</th>
            <th className="px-7 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Precio</th>
            <th className="px-7 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Scopes activos</th>
            <th className="px-7 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Usuarios</th>
            <th className="px-7 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Sesiones/mes</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return (
              <tr key={plan.id} className={`transition-colors ${isCurrent ? "bg-emerald-50/50" : "hover:bg-slate-50"}`}>
                <td className="px-7 py-5">
                  <span className={`font-bold ${isCurrent ? "text-emerald-900" : "text-slate-900"}`}>
                    {plan.name}
                  </span>
                  {isCurrent ? (
                    <span className="ml-3 inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Vigente
                    </span>
                  ) : null}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatPrice(plan.priceMonthly)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxScopes)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxUsers)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxSessions)}
                </td>
                <td className="px-7 py-5 text-right">
                  {!isCurrent && plan.priceMonthly !== 0 ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-slate-900"
                      disabled
                      title="Contactar a ventas para gestionar cambio"
                    >
                      Solicitar upgrade
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
