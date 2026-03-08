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
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Costo por mes</h2>
        <p className="mt-4 text-sm text-gray-500">No hay datos historicos disponibles.</p>
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
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Costo por mes</h2>
          <p className="mt-1 text-sm text-gray-500">
            Estimacion mensual de costo basada en tokens consumidos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Total: {formatCurrency(totalCost)}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Promedio: {formatCurrency(averageCost)}/mes
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Pico: {peakMonth.label} ({formatCurrency(peakMonth.estimatedCostUsd)})
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Grafico de barras con costo estimado por mes"
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
                    className="stroke-gray-200"
                    strokeDasharray="4 6"
                  />
                  <text
                    x={CHART_PADDING_LEFT - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-gray-400 text-[11px]"
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
                <g key={month.monthKey}>
                  <rect
                    x={barX}
                    y={CHART_PADDING_TOP}
                    width={barWidth}
                    height={chartInnerHeight}
                    rx={10}
                    className="fill-gray-100"
                  />

                  {barHeight > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx={10}
                      className={isPeak ? "fill-emerald-600" : "fill-emerald-500"}
                    >
                      <title>{`${month.label}: ${formatCurrency(month.estimatedCostUsd)}`}</title>
                    </rect>
                  )}

                  <text
                    x={centerX}
                    y={CHART_PADDING_TOP + chartInnerHeight + 18}
                    textAnchor="middle"
                    className="fill-gray-500 text-[11px]"
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
