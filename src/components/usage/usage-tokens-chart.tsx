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

type UsageTokensChartProps = {
  history: MonthlyUsage[];
};

export function UsageTokensChart({ history }: UsageTokensChartProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Tokens in/out por mes</h2>
        <p className="mt-4 text-sm text-gray-500">No hay datos historicos disponibles.</p>
      </div>
    );
  }

  const filledHistory = fillMissingMonths(history);
  const totalInput = filledHistory.reduce((sum, month) => sum + month.totalTokensInput, 0);
  const totalOutput = filledHistory.reduce((sum, month) => sum + month.totalTokensOutput, 0);
  const maxCombinedTokens = Math.max(
    ...filledHistory.map((month) => month.totalTokensInput + month.totalTokensOutput),
    1
  );
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const step = chartInnerWidth / filledHistory.length;
  const barWidth = Math.min(56, Math.max(24, step * 0.58));
  const ticks = getTickValues(maxCombinedTokens);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tokens in/out por mes</h2>
          <p className="mt-1 text-sm text-gray-500">
            Comparacion mensual entre tokens de entrada y de salida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            Input: {formatNumber(totalInput)}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            Output: {formatNumber(totalOutput)}
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Grafico de barras apiladas con tokens de entrada y salida por mes"
          >
            {ticks.map((tick, index) => {
              const y =
                CHART_PADDING_TOP + chartInnerHeight - (tick / maxCombinedTokens) * chartInnerHeight;

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
              const totalMonthTokens = month.totalTokensInput + month.totalTokensOutput;
              const inputHeight = month.totalTokensInput > 0
                ? Math.max((month.totalTokensInput / maxCombinedTokens) * chartInnerHeight, MIN_BAR_HEIGHT)
                : 0;
              const outputHeight = month.totalTokensOutput > 0
                ? Math.max((month.totalTokensOutput / maxCombinedTokens) * chartInnerHeight, MIN_BAR_HEIGHT)
                : 0;
              const stackHeight = totalMonthTokens > 0
                ? Math.max((totalMonthTokens / maxCombinedTokens) * chartInnerHeight, MIN_BAR_HEIGHT)
                : 0;
              const barX = centerX - barWidth / 2;
              const stackBaseY = CHART_PADDING_TOP + chartInnerHeight;
              const outputY = stackBaseY - outputHeight;
              const inputY = outputY - inputHeight;

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

                  {outputHeight > 0 && (
                    <rect
                      x={barX}
                      y={outputY}
                      width={barWidth}
                      height={outputHeight}
                      rx={inputHeight > 0 ? 0 : 10}
                      className="fill-indigo-500"
                    />
                  )}

                  {inputHeight > 0 && (
                    <rect
                      x={barX}
                      y={inputY}
                      width={barWidth}
                      height={inputHeight}
                      rx={10}
                      className="fill-sky-500"
                    >
                      <title>{`${month.label}: ${formatNumber(month.totalTokensInput)} input / ${formatNumber(month.totalTokensOutput)} output`}</title>
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

                  {stackHeight > 0 && (
                    <text
                      x={centerX}
                      y={stackBaseY - stackHeight - 8}
                      textAnchor="middle"
                      className="fill-gray-700 text-[10px]"
                    >
                      {formatNumber(totalMonthTokens)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
