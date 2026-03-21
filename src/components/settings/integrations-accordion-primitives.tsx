"use client";

// Shared primitives used by integrations-accordion.tsx.
// Kept in a separate file to respect the 300-line limit per module.

export type EcosystemId = "comunicacion" | "crm" | "google";
export type EcosystemStatus = "conectado" | "parcial" | "sin_conexion";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: EcosystemStatus }) {
  if (status === "conectado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Conectado
      </span>
    );
  }
  if (status === "parcial") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Parcial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Sin conexion
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chevron
// ---------------------------------------------------------------------------

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Ecosystem icons
// ---------------------------------------------------------------------------

export function IconComunicacion() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 ring-1 ring-inset ring-green-600/20">
      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    </div>
  );
}

export function IconCRM() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-inset ring-sky-600/20">
      <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
  );
}

export function IconGoogle() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-600/20">
      <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accordion item
// ---------------------------------------------------------------------------

type AccordionItemProps = {
  id: EcosystemId;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: EcosystemStatus;
  isOpen: boolean;
  onToggle: (id: EcosystemId) => void;
  children: React.ReactNode;
};

export function AccordionItem({
  id,
  icon,
  title,
  description,
  status,
  isOpen,
  onToggle,
  children,
}: AccordionItemProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-4 rounded-xl px-6 py-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
        aria-expanded={isOpen}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-sm text-slate-500">{description}</p>
        </div>
        <StatusBadge status={status} />
        <ChevronIcon open={isOpen} />
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 px-6 py-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}
