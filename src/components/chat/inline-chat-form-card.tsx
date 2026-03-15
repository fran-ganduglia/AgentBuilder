"use client";

import type { ChatConfirmationProvider } from "@/lib/chat/inline-forms";

type InlineChatConfirmationCardProps = {
  provider: ChatConfirmationProvider;
  summary?: string;
  disabled?: boolean;
  onConfirm: () => void;
  onDismiss?: () => void;
  surfaceLabel?: string;
};

function getProviderLabel(provider: ChatConfirmationProvider): string {
  return provider === "salesforce" ? "Salesforce" : provider;
}

export function InlineChatConfirmationCard({
  provider,
  summary,
  disabled = false,
  onConfirm,
  onDismiss,
  surfaceLabel = "Confirmacion inline",
}: InlineChatConfirmationCardProps) {
  return (
    <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm ring-1 ring-amber-100/70">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">
          {surfaceLabel}
        </p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Ocultar
          </button>
        ) : null}
      </div>
      <h4 className="mt-1 text-sm font-semibold text-slate-900">
        Ejecutar escritura en {getProviderLabel(provider)}
      </h4>
      <p className="mt-1 text-sm text-slate-600">
        El backend ya dejo la accion pendiente. Este boton solo envia `confirmo`
        para reutilizar el flujo seguro existente.
      </p>
      {summary ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-white/80 px-3 py-2 text-sm text-slate-700">
          {summary}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ejecutar
        </button>
      </div>
    </div>
  );
}
