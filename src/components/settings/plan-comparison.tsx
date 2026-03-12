type PlanInfo = {
  id: string;
  name: string;
  priceMonthly: number;
  maxAgents: number;
  maxUsers: number;
  maxMessages: number;
};

type PlanComparisonProps = {
  plans: PlanInfo[];
  currentPlanId: string;
};

function formatNumber(value: number): string {
  if (value >= 999999) return "Ilimitado";
  return value.toLocaleString("es-ES");
}

function formatPrice(value: number): string {
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
            <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Precio</th>
            <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Agentes</th>
            <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Usuarios</th>
            <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-right">Mensajes/mes</th>
            <th className="col-span-1"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return (
              <tr key={plan.id} className={`transition-colors ${isCurrent ? "bg-emerald-50/50" : "hover:bg-slate-50"}`}>
                <td className="px-7 py-5">
                  <span className={`font-bold capitalize ${isCurrent ? "text-emerald-900" : "text-slate-900"}`}>
                    {plan.name}
                  </span>
                  {isCurrent && (
                    <span className="ml-3 inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Vigente
                    </span>
                  )}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatPrice(plan.priceMonthly)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxAgents)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxUsers)}
                </td>
                <td className={`px-7 py-5 text-right font-medium ${isCurrent ? "text-emerald-800" : "text-slate-600"}`}>
                  {formatNumber(plan.maxMessages)}
                </td>
                <td className="px-7 py-5 text-right">
                  {!isCurrent && plan.priceMonthly > 0 && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-slate-900"
                      disabled
                      title="Contactar a ventas para gestionar cambio"
                    >
                      Solicitar Upgrade
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
