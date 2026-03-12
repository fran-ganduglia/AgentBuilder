import type { OrganizationUsage } from "@/lib/db/usage";

type UsageSummaryCardsProps = {
  usage: OrganizationUsage;
};

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function UsageSummaryCards({ usage }: UsageSummaryCardsProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Mensajes procesados</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {formatNumber(usage.totalMessages)}
          </p>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            <span>{usage.usagePercent}% de cuota</span>
            <span>{formatNumber(usage.planLimit)} MSJs</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-900/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usage.usagePercent >= 100
                  ? "bg-rose-500"
                  : usage.usagePercent >= 80
                    ? "bg-amber-400"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(usage.usagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Volumen de Tokens</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {formatNumber(usage.totalTokensInput + usage.totalTokensOutput)}
          </p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span className="h-2 w-2 rounded-full bg-slate-800" />
            <span className="text-slate-800">{formatNumber(usage.totalTokensInput)}</span> IN
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-blue-600">{formatNumber(usage.totalTokensOutput)}</span> OUT
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Costo proyectado</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {formatCost(usage.estimatedCostUsd)}
          </p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          <span>Plan Suscrito</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-800 ring-1 ring-inset ring-slate-500/10">
            {usage.planName}
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Conversaciones</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {formatNumber(usage.totalConversations)}
          </p>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total histórico consolidado</p>
        </div>
      </div>
    </div>
  );
}
