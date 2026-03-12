import type { MonthlyUsage } from "@/lib/db/usage";
import {
  CHART_HEIGHT,
  CHART_PADDING_BOTTOM,
  CHART_PADDING_LEFT,
  CHART_PADDING_RIGHT,
  CHART_PADDING_TOP,
  CHART_WIDTH,
  MIN_BAR_HEIGHT,
  fillMissingMonths,
  formatCurrency,
  getTickValues,
} from "@/lib/utils/usage-chart";

type UsageCostChartProps = {
  history: MonthlyUsage[];
};

function formatCostTick(value: number): string {
  if (value >= 100) {
    return `$${value.toFixed(0)}`;
  }

  return `$${value.toFixed(2)}`;
}

export function UsageCostChart({ history }: UsageCostChartProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center shadow-sm">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="mt-4 text-sm font-bold text-slate-900">Costo Estimado</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">No hay facturación procesada ni reportada todavía.</p>
      </div>
    );
  }

  const filledHistory = fillMissingMonths(history);
  const totalCost = filledHistory.reduce((sum, month) => sum + month.estimatedCostUsd, 0);
  const averageCost = totalCost / filledHistory.length;
  const peakMonth = filledHistory.reduce((highest, month) =>
    month.estimatedCostUsd > highest.estimatedCostUsd ? month : highest
  );
  const maxCost = Math.max(...filledHistory.map((month) => month.estimatedCostUsd), 0.01);
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const step = chartInnerWidth / filledHistory.length;
  const barWidth = Math.min(56, Math.max(24, step * 0.58));
  const ticks = getTickValues(maxCost, (value) => Number(value.toFixed(2)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Estadística de Costos</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Estimación proyectada basada en tokens consumidos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5">
            Total {formatCurrency(totalCost)}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5">
            ~ {formatCurrency(averageCost)} / mes
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5 text-emerald-700">
            Pico de {formatCurrency(peakMonth.estimatedCostUsd)} ({peakMonth.label})
          </span>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Gráfico analítico de barras con costo proyectado por mes"
          >
            {ticks.map((tick, index) => {
              const y =
                CHART_PADDING_TOP + chartInnerHeight - (tick / maxCost) * chartInnerHeight;

              return (
                <g key={`${index}-${tick}`}>
                  <line
                    x1={CHART_PADDING_LEFT}
                    x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                    y1={y}
                    y2={y}
                    className="stroke-slate-100"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={CHART_PADDING_LEFT - 12}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-bold tracking-widest"
                  >
                    {formatCostTick(tick)}
                  </text>
                </g>
              );
            })}

            {filledHistory.map((month, index) => {
              const centerX = CHART_PADDING_LEFT + index * step + step / 2;
              const barHeight = month.estimatedCostUsd > 0
                ? Math.max((month.estimatedCostUsd / maxCost) * chartInnerHeight, MIN_BAR_HEIGHT)
                : 0;
              const barX = centerX - barWidth / 2;
              const barY = CHART_PADDING_TOP + chartInnerHeight - barHeight;
              const isPeak = month.monthKey === peakMonth.monthKey;

              return (
                <g key={month.monthKey} className="group">
                  <rect
                    x={barX}
                    y={CHART_PADDING_TOP}
                    width={barWidth}
                    height={chartInnerHeight}
                    rx={6}
                    className="fill-slate-50 transition-colors group-hover:fill-slate-100"
                  />

                  {barHeight > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx={6}
                      className={isPeak ? "fill-emerald-700 transition-colors group-hover:fill-emerald-800" : "fill-emerald-500 transition-colors group-hover:fill-emerald-600"}
                    >
                      <title>{`${month.label}: ${formatCurrency(month.estimatedCostUsd)} proyectados`}</title>
                    </rect>
                  )}

                  <text
                    x={centerX}
                    y={CHART_PADDING_TOP + chartInnerHeight + 20}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-bold uppercase tracking-widest"
                  >
                    {month.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
