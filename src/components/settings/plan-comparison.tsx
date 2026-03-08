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
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Comparacion de planes</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500">Plan</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Precio</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Agentes</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Usuarios</th>
              <th className="px-6 py-3 font-medium text-gray-500 text-right">Mensajes/mes</th>
              <th className="px-6 py-3 font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              return (
                <tr key={plan.id} className={isCurrent ? "bg-blue-50" : "hover:bg-gray-50"}>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900 capitalize">{plan.name}</span>
                    {isCurrent && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Actual
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatPrice(plan.priceMonthly)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatNumber(plan.maxAgents)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatNumber(plan.maxUsers)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatNumber(plan.maxMessages)}</td>
                  <td className="px-6 py-4 text-right">
                    {!isCurrent && plan.priceMonthly > 0 && (
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        disabled
                        title="Proximamente"
                      >
                        Upgrade
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
