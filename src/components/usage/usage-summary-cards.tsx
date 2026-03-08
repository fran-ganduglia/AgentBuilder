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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-medium text-gray-500">Mensajes del mes</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {formatNumber(usage.totalMessages)}
        </p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{usage.usagePercent}% usado</span>
            <span>{formatNumber(usage.planLimit)} limite</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${
                usage.usagePercent >= 100
                  ? "bg-red-500"
                  : usage.usagePercent >= 80
                    ? "bg-yellow-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(usage.usagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-medium text-gray-500">Tokens consumidos</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {formatNumber(usage.totalTokensInput + usage.totalTokensOutput)}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {formatNumber(usage.totalTokensInput)} in / {formatNumber(usage.totalTokensOutput)} out
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-medium text-gray-500">Costo estimado</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {formatCost(usage.estimatedCostUsd)}
        </p>
        <p className="mt-1 text-xs text-gray-400">Plan {usage.planName}</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-medium text-gray-500">Conversaciones</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">
          {formatNumber(usage.totalConversations)}
        </p>
      </div>
    </div>
  );
}
