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
  formatNumber,
  getTickValues,
} from "@/lib/utils/usage-chart";

type UsageTrendChartProps = {
  history: MonthlyUsage[];
};

export function UsageTrendChart({ history }: UsageTrendChartProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Mensajes por mes</h2>
        <p className="mt-4 text-sm text-gray-500">No hay datos historicos disponibles.</p>
      </div>
    );
  }

  const filledHistory = fillMissingMonths(history);
  const totalMessages = filledHistory.reduce((sum, month) => sum + month.totalMessages, 0);
  const averageMessages = Math.round(totalMessages / filledHistory.length);
  const peakMonth = filledHistory.reduce((highest, month) =>
    month.totalMessages > highest.totalMessages ? month : highest
  );
  const maxMessages = Math.max(...filledHistory.map((month) => month.totalMessages), 1);
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const step = chartInnerWidth / filledHistory.length;
  const barWidth = Math.min(56, Math.max(24, step * 0.58));
  const ticks = getTickValues(maxMessages);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mensajes por mes</h2>
          <p className="mt-1 text-sm text-gray-500">
            Volumen mensual de mensajes procesados por tus agentes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Total: {formatNumber(totalMessages)}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Promedio: {formatNumber(averageMessages)}/mes
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Pico: {peakMonth.label} ({formatNumber(peakMonth.totalMessages)})
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Grafico de barras con mensajes por mes"
          >
            {ticks.map((tick, index) => {
              const y =
                CHART_PADDING_TOP + chartInnerHeight - (tick / maxMessages) * chartInnerHeight;

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
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}

            {filledHistory.map((month, index) => {
              const centerX = CHART_PADDING_LEFT + index * step + step / 2;
              const barHeight = month.totalMessages > 0
                ? Math.max((month.totalMessages / maxMessages) * chartInnerHeight, MIN_BAR_HEIGHT)
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
                      className={isPeak ? "fill-blue-600" : "fill-blue-500"}
                    >
                      <title>{`${month.label}: ${formatNumber(month.totalMessages)} mensajes`}</title>
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
