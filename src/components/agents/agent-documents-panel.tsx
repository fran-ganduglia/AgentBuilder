"use client";

import { useRef, useState } from "react";
import type { Tables } from "@/types/database";
import { formatFileSize } from "@/lib/utils/format";

type AgentDocument = Tables<"agent_documents">;

type AgentDocumentsPanelProps = {
  agentId: string;
  initialDocuments: AgentDocument[];
  canUpload: boolean;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusLabel(status: string | null): string {
  if (status === "ready") return "Integrado";
  if (status === "processing") return "Vectorizando";
  if (status === "error") return "Error";
  return status ?? "Desconocido";
}

function getStatusClasses(status: string | null): string {
  if (status === "ready") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "processing") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  if (status === "error") return "bg-rose-50 text-rose-700 ring-rose-600/20";
  return "bg-slate-50 text-slate-700 ring-slate-600/20";
}

export function AgentDocumentsPanel({
  agentId,
  initialDocuments,
  canUpload,
}: AgentDocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<AgentDocument[]>(initialDocuments);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo antes de subirlo.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/agents/${agentId}/documents`, {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as {
        data?: AgentDocument;
        error?: string;
      };

      if (!response.ok || !result.data) {
        setError(result.error ?? "No se pudo subir el documento.");
        return;
      }

      setDocuments((prev) => [result.data as AgentDocument, ...prev]);
      setSuccessMessage("Archivo recibido. El procesamiento en segundo plano ya comenzo.");

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch {
      setError("No se pudo conectar para subir el documento. Reintenta.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section id="agent-documents-panel" className="space-y-6">
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(135deg,_#ffffff,_#f8fafc)] shadow-sm">
        <div className="px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Base de conocimientos</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Repositorio documental del agente</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Sube PDF, TXT, CSV o DOCX para darle contexto consultable al agente. El procesamiento es asincrono y los chunks se generan en segundo plano.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Archivos</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{documents.length}</p>
              <p className="text-xs text-slate-500">en esta base</p>
            </div>
          </div>
        </div>
      </div>

      {canUpload ? (
        <form onSubmit={handleUpload} className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-6 shadow-sm transition-colors hover:border-slate-400 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Subir nuevo material</p>
              <p className="mt-1 text-sm text-slate-500">Maximo 10MB por archivo. La vectorizacion se dispara automaticamente.</p>
            </div>
            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {isUploading ? "Subiendo..." : "Subir archivo"}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.csv,.docx"
            disabled={isUploading}
            className="mt-5 block w-full cursor-pointer text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-200 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-300 disabled:opacity-50"
          />
        </form>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-800">No tienes permisos de edicion para subir material desde este rol.</p>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800" role="alert">{error}</p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800" role="status">{successMessage}</p>
        </div>
      ) : null}

      <div className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <h3 className="text-lg font-bold tracking-tight text-slate-950">Biblioteca cargada</h3>
          <p className="mt-1 text-sm text-slate-500">Sigue el estado de indexacion y revisa rapidamente el material disponible.</p>
        </div>

        <div className="p-4 sm:p-6">
          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
              <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h4 className="mt-3 text-sm font-bold text-slate-900">Sin documentos todavia</h4>
              <p className="mt-1 text-sm text-slate-500">Este agente sigue dependiendo solo de su system prompt.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-200">
                      <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{document.file_name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="uppercase tracking-wider">{document.file_type.replace(".", "")}</span>
                        <span aria-hidden="true">/</span>
                        <span>{formatFileSize(document.file_size_bytes)}</span>
                        <span aria-hidden="true">/</span>
                        <span>{formatDate(document.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ring-1 ring-inset ${getStatusClasses(document.status)}`}>
                        {getStatusLabel(document.status)}
                      </span>
                      {document.error_message ? (
                        <p className="mt-1 max-w-[180px] truncate text-[11px] text-rose-600">{document.error_message}</p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Chunks</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{document.chunk_count ?? 0}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

