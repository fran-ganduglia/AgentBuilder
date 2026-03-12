"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import { IntegrationStatusBadge } from "@/components/settings/integration-status-badge";
import { IntegrationRevokeButton } from "@/components/settings/integration-revoke-actions";

type OpenAIConnectionFormProps = {
  initialName: string;
  isConnected: boolean;
  apiKeyHint: string | null;
  integrationId: string | null;
  operationalView: IntegrationOperationalView;
};

export function OpenAIConnectionForm({
  initialName,
  isConnected,
  apiKeyHint,
  integrationId,
  operationalView,
}: OpenAIConnectionFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [apiKey, setApiKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/integrations/openai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          apiKey: apiKey.trim(),
        }),
      });

      const result = (await response.json()) as {
        data?: { assistantsCount?: number };
        error?: string;
      };

      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo conectar OpenAI");
        return;
      }

      setApiKey("");
      setSuccess(
        result.data?.assistantsCount !== undefined
          ? `Conexion validada. Se detectaron ${result.data.assistantsCount} assistants listos para importar.`
          : "Conexion validada correctamente."
      );
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Reintenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/20">
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">OpenAI Assistants</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Conecta una API key para interactuar con infraestructura remota.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <IntegrationStatusBadge view={operationalView} />
          {isConnected && apiKeyHint ? (
            <span className="text-xs font-semibold text-slate-500">{apiKeyHint}</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-6 p-7">
        <div className={`rounded-lg border p-4 ${operationalView.tone === "rose" ? "border-rose-200 bg-rose-50" : operationalView.tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <p className="text-sm font-semibold text-slate-900">{operationalView.summary}</p>
          {operationalView.detail ? <p className="mt-1 text-sm text-slate-600">{operationalView.detail}</p> : null}
          {operationalView.lastAuthError ? <p className="mt-2 text-xs font-medium text-rose-700">Ultimo error: {operationalView.lastAuthError}</p> : null}
        </div>

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800" role="status">
              {success}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800" role="alert">
              {error}
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="openai-name" className="block text-sm font-semibold tracking-wide text-slate-900">
              Nombre de la red
            </label>
            <input
              id="openai-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="openai-api-key" className="block text-sm font-semibold tracking-wide text-slate-900">
              API key de OpenAI
            </label>
            <input
              id="openai-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={isConnected ? "Ingresa una nueva key para rotarla" : "sk-..."}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50 px-7 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Toda credencial se valida y se resguarda solo en backend.
          </p>
          <IntegrationRevokeButton integrationId={integrationId} integrationName={initialName} disabled={isSubmitting} />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || apiKey.trim().length === 0}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSubmitting ? "Validando handshake..." : isConnected ? "Rotar y actualizar key" : "Conectar OpenAI"}
        </button>
      </div>
    </form>
  );
}

