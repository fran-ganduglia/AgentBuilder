import type { IntegrationOperationalView } from "@/lib/integrations/metadata";

const TONE_STYLES: Record<IntegrationOperationalView["tone"], string> = {
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  amber: "bg-amber-100 text-amber-800 ring-amber-600/20",
  rose: "bg-rose-100 text-rose-800 ring-rose-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

export function IntegrationStatusBadge({
  view,
}: {
  view: IntegrationOperationalView;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${TONE_STYLES[view.tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {view.label}
    </span>
  );
}
