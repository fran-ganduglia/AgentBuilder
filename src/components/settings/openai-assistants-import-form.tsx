"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AssistantRow = {
  id: string;
  name: string;
  description: string;
  model: string;
  alreadyImported: boolean;
};

type OpenAIAssistantsImportFormProps = {
  integrationId: string;
  disabledReason?: string | null;
};

export function OpenAIAssistantsImportForm({
  integrationId,
  disabledReason = null,
}: OpenAIAssistantsImportFormProps) {
  const router = useRouter();
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(!disabledReason);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAssistants = useCallback(async () => {
    if (disabledReason) {
      setIsLoading(false);
      setAssistants([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/integrations/${integrationId}/assistants`, {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as {
        data?: AssistantRow[];
        error?: string;
      };

      if (!response.ok || result.error || !result.data) {
        setError(result.error ?? "No se pudieron cargar los assistants");
        return;
      }

      setAssistants(result.data);
    } catch {
      setError("No se pudieron cargar los assistants desde el servidor.");
    } finally {
      setIsLoading(false);
    }
  }, [disabledReason, integrationId]);

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  const importableAssistants = assistants.filter((assistant) => !assistant.alreadyImported);

  function toggleAssistant(assistantId: string) {
    setSelectedIds((current) =>
      current.includes(assistantId)
        ? current.filter((id) => id !== assistantId)
        : [...current, assistantId]
    );
  }

  async function handleImport() {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/integrations/${integrationId}/agents/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantIds: selectedIds }),
      });

      const result = (await response.json()) as {
        data?: {
          imported: Array<{ name: string }>;
          duplicates: string[];
          failed: Array<{ assistantId: string; error: string }>;
        };
        error?: string;
      };

      if (!response.ok || result.error || !result.data) {
        setError(result.error ?? "No se pudieron importar los assistants");
        return;
      }

      const importedCount = result.data.imported.length;
      const duplicateCount = result.data.duplicates.length;
      const failedCount = result.data.failed.length;
      setSelectedIds([]);
      setSuccess(
        `Operacion exitosa: ${importedCount} importados, ${duplicateCount} duplicados y ${failedCount} fallidos.`
      );
      await loadAssistants();
      router.refresh();
    } catch {
      setError("No se pudo importar desde el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-inset ring-sky-600/20">
            <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Importacion masiva de assistants</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona los perfiles que deseas clonar y administrar dentro de la infraestructura local.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
          Detecciones remotas: {assistants.length}
        </span>
      </div>

      <div className="p-7">
        {disabledReason ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {disabledReason}
          </div>
        ) : null}

        {success ? (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {success}
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-10 opacity-70">
            <svg className="h-8 w-8 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm font-medium text-slate-500">Cargando catalogo remoto...</p>
          </div>
        ) : assistants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">
              {disabledReason ?? "No hay assistants configurados en la cuenta remota conectada."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assistants.map((assistant) => {
              const isSelected = selectedIds.includes(assistant.id);
              return (
                <label
                  key={assistant.id}
                  className={`group flex items-start gap-4 rounded-xl border p-4 transition-all ${
                    assistant.alreadyImported
                      ? "cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-60 grayscale"
                      : isSelected
                        ? "cursor-pointer border-slate-300 bg-slate-50 shadow-sm ring-1 ring-inset ring-slate-900/5"
                        : "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAssistant(assistant.id)}
                      disabled={assistant.alreadyImported || isSubmitting || isLoading}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 transition-colors focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="truncate text-sm font-bold tracking-tight text-slate-900">{assistant.name}</p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 ring-1 ring-inset ring-slate-200">
                        {assistant.model}
                      </span>
                      {assistant.alreadyImported ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-600/30">
                          Espejado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs font-mono text-slate-400">{assistant.id}</p>
                    {assistant.description ? (
                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{assistant.description}</p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 bg-slate-50 px-7 py-5 sm:flex-row sm:items-center">
        <span className="flex-1 text-xs font-medium text-slate-500">
          {importableAssistants.length} perfiles habilitados para transferencia hacia local.
        </span>
        <button
          type="button"
          onClick={() => void loadAssistants()}
          disabled={Boolean(disabledReason) || isLoading || isSubmitting}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Consultando..." : "Actualizar catalogo"}
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={Boolean(disabledReason) || selectedIds.length === 0 || isSubmitting || isLoading}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSubmitting ? "Importando..." : `Ejecutar espejo (${selectedIds.length})`}
        </button>
      </div>
    </section>
  );
}
