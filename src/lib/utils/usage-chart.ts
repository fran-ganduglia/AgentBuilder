import type { MonthlyUsage } from "@/lib/db/usage";

export type FilledMonthUsage = MonthlyUsage & {
  label: string;
  monthKey: string;
};

export const CHART_HEIGHT = 220;
export const CHART_WIDTH = 760;
export const CHART_PADDING_TOP = 20;
export const CHART_PADDING_RIGHT = 20;
export const CHART_PADDING_BOTTOM = 42;
export const CHART_PADDING_LEFT = 52;
export const GRID_LINES = 4;
export const MIN_BAR_HEIGHT = 4;

export function formatNumber(value: number): string {
  return value.toLocaleString("es-ES");
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getMonthKey(periodStart: string): string {
  return periodStart.slice(0, 7);
}

function parseMonthKey(monthKey: string): { year: number; monthIndex: number } {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function buildMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function nextMonthKey(monthKey: string): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const nextMonthIndex = monthIndex + 1;

  if (nextMonthIndex < 12) {
    return buildMonthKey(year, nextMonthIndex);
  }

  return buildMonthKey(year + 1, 0);
}

export function getMonthLabel(monthKey: string): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const date = new Date(Date.UTC(year, monthIndex, 1));

  return capitalize(
    date.toLocaleDateString("es-ES", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    })
  );
}

export function fillMissingMonths(history: MonthlyUsage[]): FilledMonthUsage[] {
  const sorted = [...history].sort((a, b) =>
    compareMonthKeys(getMonthKey(a.periodStart), getMonthKey(b.periodStart))
  );

  const firstMonthKey = getMonthKey(sorted[0].periodStart);
  const lastMonthKey = getMonthKey(sorted[sorted.length - 1].periodStart);
  const historyMap = new Map(sorted.map((entry) => [getMonthKey(entry.periodStart), entry]));
  const filled: FilledMonthUsage[] = [];

  for (
    let currentMonthKey = firstMonthKey;
    compareMonthKeys(currentMonthKey, lastMonthKey) <= 0;
    currentMonthKey = nextMonthKey(currentMonthKey)
  ) {
    const existing = historyMap.get(currentMonthKey);
    const { year, monthIndex } = parseMonthKey(currentMonthKey);

    filled.push({
      periodStart: existing?.periodStart ?? new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
      totalMessages: existing?.totalMessages ?? 0,
      totalTokensInput: existing?.totalTokensInput ?? 0,
      totalTokensOutput: existing?.totalTokensOutput ?? 0,
      estimatedCostUsd: existing?.estimatedCostUsd ?? 0,
      monthKey: currentMonthKey,
      label: getMonthLabel(currentMonthKey),
    });
  }

  return filled;
}

export function getTickValues(maxValue: number, formatter: (value: number) => number = Math.round): number[] {
  return Array.from({ length: GRID_LINES + 1 }, (_, index) =>
    formatter((maxValue / GRID_LINES) * index)
  ).reverse();
}
