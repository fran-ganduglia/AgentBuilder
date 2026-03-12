"use client";

import { useState, type FormEvent } from "react";

type AgentQaImportFormProps = {
  agentId: string;
  onImported: (conversationId: string) => void;
  onCancel: () => void;
};

const EXAMPLE_PAYLOAD = JSON.stringify(
  {
    externalId: "wa-2026-03-11-001",
    contactName: "Cliente Demo",
    contactId: "+5491112345678",
    sourceLabel: "WhatsApp real",
    messages: [
      {
        role: "user",
        content: "Hola, quiero saber si puedo reprogramar mi turno.",
        createdAt: "2026-03-11T14:00:00.000Z",
      },
      {
        role: "assistant",
        content: "Claro, puedo ayudarte con eso. Decime tu nombre y el horario actual.",
        createdAt: "2026-03-11T14:00:12.000Z",
      },
    ],
  },
  null,
  2
);

export function AgentQaImportForm({ agentId, onImported, onCancel }: AgentQaImportFormProps) {
  const [payload, setPayload] = useState(EXAMPLE_PAYLOAD);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      const response = await fetch(`/api/agents/${agentId}/qa/whatsapp-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedPayload),
      });

      const result = (await response.json()) as {
        data?: { conversationId?: string };
        error?: string;
      };

      if (!response.ok || !result.data?.conversationId) {
        setErrorMessage(result.error ?? "No se pudo importar la conversacion.");
        return;
      }

      onImported(result.data.conversationId);
    } catch {
      setErrorMessage("El transcript debe ser un JSON valido con la estructura esperada.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Importar WhatsApp</p>
          <h3 className="mt-2 text-lg font-bold text-slate-950">Transcript solo lectura para QA</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Pega un JSON con `externalId`, alias/contacto y mensajes de texto. Si vuelves a importar el mismo `externalId`, se reutiliza la conversacion existente.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-900">Payload JSON</span>
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={18}
            spellCheck={false}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-950 px-4 py-4 font-mono text-xs text-emerald-100 shadow-inner outline-none transition-colors focus:border-emerald-500"
          />
        </label>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Soporta mensajes `user` y `assistant`, con texto y `createdAt` opcional en ISO 8601.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Importando..." : "Importar transcript"}
          </button>
        </div>
      </form>
    </div>
  );
}
