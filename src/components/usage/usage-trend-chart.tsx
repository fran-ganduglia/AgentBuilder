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
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center shadow-sm">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <h3 className="mt-4 text-sm font-bold text-slate-900">Mensajes por mes</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">No hay datos históricos reportados aún.</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Volumen General</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Mensajes netos procesados agrupados por mes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5">
            Total {formatNumber(totalMessages)}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5">
            ~ {formatNumber(averageMessages)} / mes
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 ring-1 ring-inset ring-slate-900/5 text-blue-700">
            Pico de {formatNumber(peakMonth.totalMessages)} ({peakMonth.label})
          </span>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Gráfico de barras analítico para mensajes"
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
              const barHeight = month.totalMessages > 0
                ? Math.max((month.totalMessages / maxMessages) * chartInnerHeight, MIN_BAR_HEIGHT)
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
                      className={isPeak ? "fill-blue-600 transition-colors group-hover:fill-blue-700" : "fill-slate-800 transition-colors group-hover:fill-slate-900"}
                    >
                      <title>{`${month.label}: ${formatNumber(month.totalMessages)} mensajes`}</title>
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
