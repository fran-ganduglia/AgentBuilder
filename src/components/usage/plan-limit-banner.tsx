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
      className={`rounded-lg border px-4 py-3 ${
        isOver
          ? "border-red-300 bg-red-50"
          : "border-yellow-300 bg-yellow-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <p
          className={`text-sm font-medium ${
            isOver ? "text-red-800" : "text-yellow-800"
          }`}
        >
          {isOver
            ? `Has alcanzado el limite de mensajes de tu plan (${formatNumber(planLimit)}/mes).`
            : `Estas usando el ${usagePercent}% de tus mensajes mensuales (${formatNumber(totalMessages)}/${formatNumber(planLimit)}).`}
        </p>
        <Link
          href="/settings/billing"
          className={`ml-4 shrink-0 text-sm font-medium underline ${
            isOver ? "text-red-700" : "text-yellow-700"
          }`}
        >
          Ver planes
        </Link>
      </div>
    </div>
  );
}
