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
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center shadow-sm">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 className="mt-4 text-sm font-bold text-slate-900">Tokens IN / OUT</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">No hay datos históricos reportados aún para procesar.</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Tokens Computados</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Comparativa de volumen apilado IN vs OUT.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-slate-600">
          <span className="flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 ring-1 ring-inset ring-slate-900/5">
            <span className="h-2 w-2 rounded-full bg-slate-800" />
            Input: {formatNumber(totalInput)}
          </span>
          <span className="flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 ring-1 ring-inset ring-slate-900/5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Output: {formatNumber(totalOutput)}
          </span>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Gráfico de barars apiladas de Tokens de entrada y salida."
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
                    className="stroke-slate-100"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={CHART_PADDING_LEFT - 12}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-bold tracking-widest"
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
                <g key={month.monthKey} className="group">
                  <rect
                    x={barX}
                    y={CHART_PADDING_TOP}
                    width={barWidth}
                    height={chartInnerHeight}
                    rx={6}
                    className="fill-slate-50 transition-colors group-hover:fill-slate-100"
                  />

                  {outputHeight > 0 && (
                    <rect
                      x={barX}
                      y={outputY}
                      width={barWidth}
                      height={outputHeight}
                      rx={inputHeight > 0 ? 0 : 6}
                      className="fill-blue-500 transition-colors group-hover:fill-blue-600"
                    />
                  )}

                  {inputHeight > 0 && (
                    <rect
                      x={barX}
                      y={inputY}
                      width={barWidth}
                      height={inputHeight}
                      rx={6}
                      className="fill-slate-800 transition-colors group-hover:fill-slate-900"
                    >
                      <title>{`${month.label}: ${formatNumber(month.totalTokensInput)} IN / ${formatNumber(month.totalTokensOutput)} OUT`}</title>
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

                  {stackHeight > 0 && (
                    <text
                      x={centerX}
                      y={stackBaseY - stackHeight - 12}
                      textAnchor="middle"
                      className="fill-slate-700 text-[10px] font-bold tracking-widest"
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
