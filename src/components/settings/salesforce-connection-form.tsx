"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import { IntegrationStatusBadge } from "@/components/settings/integration-status-badge";

type SalesforceConnectionFormProps = {
  initialName: string;
  integrationId: string | null;
  isConnected: boolean;
  operationalView: IntegrationOperationalView;
  instanceUrl: string | null;
  grantedScopes: string[];
  callbackMessage: string | null;
  callbackStatus: "connected" | "error" | null;
};

function getStatusContainerClass(view: IntegrationOperationalView): string {
  if (view.tone === "rose") {
    return "border-rose-200 bg-rose-50";
  }

  if (view.tone === "amber") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-slate-50";
}

function requestReason(defaultValue: string): string | null {
  const reason = window.prompt("Motivo de desconexion", defaultValue);
  if (!reason) {
    return null;
  }

  const trimmed = reason.trim();
  return trimmed.length >= 8 ? trimmed : null;
}

export function SalesforceConnectionForm({
  initialName,
  integrationId,
  isConnected,
  operationalView,
  instanceUrl,
  grantedScopes,
  callbackMessage,
  callbackStatus,
}: SalesforceConnectionFormProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDisconnect() {
    if (!integrationId) {
      return;
    }

    const reason = requestReason(`Revocacion manual desde Settings para ${initialName}`);
    if (!reason) {
      setError("Debes indicar un motivo de al menos 8 caracteres.");
      return;
    }

    setIsDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/integrations/salesforce/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo desconectar Salesforce");
        return;
      }

      setMessage("Salesforce quedo desconectado correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-inset ring-sky-600/20">
            <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Salesforce CRM</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              OAuth org-level para habilitar tools CRM sobre leads, contactos y tareas.
            </p>
          </div>
        </div>
        <IntegrationStatusBadge view={operationalView} />
      </div>

      <div className="space-y-6 p-7">
        <div className={`rounded-lg border p-4 ${getStatusContainerClass(operationalView)}`}>
          <p className="text-sm font-semibold text-slate-900">{operationalView.summary}</p>
          {operationalView.detail ? <p className="mt-1 text-sm text-slate-600">{operationalView.detail}</p> : null}
          {operationalView.lastAuthError ? <p className="mt-2 text-xs font-medium text-rose-700">Ultimo error: {operationalView.lastAuthError}</p> : null}
        </div>

        {callbackMessage ? (
          <div className={`rounded-lg border p-4 ${callbackStatus === "error" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-sm font-medium ${callbackStatus === "error" ? "text-rose-800" : "text-emerald-800"}`} role={callbackStatus === "error" ? "alert" : "status"}>
              {callbackMessage}
            </p>
          </div>
        ) : null}

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800" role="status">{message}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800" role="alert">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-900">Conexion</p>
            <p className="mt-2 text-sm text-slate-600">
              {isConnected ? "La organizacion ya tiene una conexion Salesforce guardada." : "Todavia no hay una conexion Salesforce activa para esta organizacion."}
            </p>
            {instanceUrl ? <p className="mt-2 text-xs font-medium text-slate-500">Instance URL: {instanceUrl}</p> : null}
          </div>

          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-900">Scopes</p>
            {grantedScopes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {grantedScopes.map((scope) => (
                  <span key={scope} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700 ring-1 ring-inset ring-slate-200">
                    {scope}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Los scopes concedidos apareceran despues del callback OAuth.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50 px-7 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          El access token y el refresh token quedan cifrados en backend usando `integration_secrets`.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {integrationId ? (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isDisconnecting}
              className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDisconnecting ? "Desconectando..." : "Desconectar Salesforce"}
            </button>
          ) : null}

          <a
            href="/api/integrations/salesforce/start"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
          >
            {isConnected ? "Reconectar Salesforce" : "Conectar Salesforce"}
          </a>
        </div>
      </div>
    </section>
  );
}