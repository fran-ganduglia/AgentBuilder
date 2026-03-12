import Link from "next/link";

type PlanLimitBannerProps = {
  usagePercent: number;
  totalMessages: number;
  planLimit: number;
};

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

export function PlanLimitBanner({ usagePercent, totalMessages, planLimit }: PlanLimitBannerProps) {
  if (usagePercent < 80) {
    return null;
  }

  const isOver = usagePercent >= 100;

  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border px-6 py-5 shadow-sm ${
        isOver
          ? "border-rose-200 bg-rose-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start sm:items-center gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
          isOver ? "bg-rose-100 ring-rose-600/20 text-rose-600" : "bg-amber-100 ring-amber-600/20 text-amber-600"
        }`}>
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {isOver ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        </div>
        <div>
          <h3 className={`text-sm font-bold ${isOver ? "text-rose-900" : "text-amber-900"}`}>
             {isOver ? "Alerta Resolutiva de Límite Alcanzado" : "Alerta Temprana de Consumo"}
          </h3>
          <p
            className={`mt-1 text-sm font-medium ${
              isOver ? "text-rose-800" : "text-amber-800"
            }`}
          >
            {isOver
              ? `Has excedido o alcanzado el límite operativo de mensajes de tu ciclo (${formatNumber(planLimit)}/mes).`
              : `Estás utilizando el ${usagePercent}% de tu cuota de mensajes asignada en el ciclo actual (${formatNumber(totalMessages)} / ${formatNumber(planLimit)} limitados).`}
          </p>
        </div>
      </div>
      <Link
        href="/settings/billing"
        className={`inline-flex shrink-0 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-bold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isOver
            ? "bg-white border border-rose-300 text-rose-800 hover:bg-rose-50 hover:shadow-md focus:ring-rose-500"
            : "bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 hover:shadow-md focus:ring-amber-500"
        }`}
      >
        Gestor de Planes
      </Link>
    </div>
  );
}
