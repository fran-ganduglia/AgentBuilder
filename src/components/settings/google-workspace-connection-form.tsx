"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoogleSurface } from "@/lib/integrations/google-scopes";
import type { GoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";

type GoogleWorkspaceConnectionFormProps = {
  integrationId: string | null;
  gmailView: GoogleSurfaceOperationalView;
  calendarView: GoogleSurfaceOperationalView;
  sheetsView: GoogleSurfaceOperationalView;
  callbackSurface: GoogleSurface | null;
  callbackMessage: string | null;
  callbackStatus: "connected" | "error" | null;
};

function getStatusContainerClass(tone: GoogleSurfaceOperationalView["tone"]): string {
  if (tone === "rose") return "border-rose-200 bg-rose-50";
  if (tone === "amber") return "border-amber-200 bg-amber-50";
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50";
  return "border-slate-200 bg-slate-50";
}

function requestReason(defaultValue: string): string | null {
  const reason = window.prompt("Motivo de desconexion", defaultValue);
  if (!reason) return null;
  const trimmed = reason.trim();
  return trimmed.length >= 8 ? trimmed : null;
}

function GoogleSurfaceCard(input: {
  view: GoogleSurfaceOperationalView;
  callbackMessage: string | null;
  callbackStatus: "connected" | "error" | null;
}) {
  const actionLabel = !input.view.isConnected
    ? `Conectar ${input.view.title}`
    : input.view.status === "reauth_required" ||
        input.view.status === "revoked" ||
        input.view.status === "error"
      ? `Reconectar ${input.view.title}`
      : input.view.isUsable
        ? `Reconectar ${input.view.title}`
        : `Completar ${input.view.title}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{input.view.title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {input.view.surface === "gmail"
                ? "Lectura real y writes asistidas en chat web para borradores, labels y archivado. `send_reply`, adjuntos y bodies completos siguen fuera de esta etapa."
                : input.view.surface === "google_sheets"
                  ? "Lecturas directas en chat y operaciones completas de escritura, estructura y formato via approval inbox + worker, siempre con spreadsheet URL/ID explicito."
                : "Configuracion de disponibilidad y agenda para lecturas reales en chat web. La API `/run` y las escrituras siguen fuera de esta etapa."}
            </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${input.view.tone === "rose" ? "bg-rose-100 text-rose-800" : input.view.tone === "amber" ? "bg-amber-100 text-amber-800" : input.view.tone === "emerald" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
          {input.view.label}
        </span>
      </div>

      <div className={`mt-5 rounded-lg border p-4 ${getStatusContainerClass(input.view.tone)}`}>
        <p className="text-sm font-semibold text-slate-900">{input.view.summary}</p>
        {input.view.detail ? (
          <p className="mt-1 text-sm text-slate-600">{input.view.detail}</p>
        ) : null}
        {input.view.lastAuthError ? (
          <p className="mt-2 text-xs font-medium text-rose-700">
            Ultimo error: {input.view.lastAuthError}
          </p>
        ) : null}
      </div>

      {input.callbackMessage ? (
        <div className={`mt-4 rounded-lg border p-4 ${input.callbackStatus === "error" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className={`text-sm font-medium ${input.callbackStatus === "error" ? "text-rose-800" : "text-emerald-800"}`}>
            {input.callbackMessage}
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Permisos requeridos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {input.view.requiredScopes.map((scope) => {
              const missing = input.view.missingScopes.includes(scope);

              return (
                <span
                  key={scope}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.15em] ring-1 ring-inset ${missing ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}
                >
                  {scope}
                </span>
              );
            })}
          </div>
        </div>

        {input.view.connectedEmail ? (
          <p className="text-xs font-medium text-slate-500">
            Cuenta conectada: {input.view.connectedEmail}
          </p>
        ) : null}

        {input.view.accessTokenExpiresAt ? (
          <p className="text-xs font-medium text-slate-500">
            Expira: {new Date(input.view.accessTokenExpiresAt).toLocaleString("es-AR")}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <p className="text-xs text-slate-500">
          La fuente de verdad de permisos es `integrations.metadata.granted_scopes`.
        </p>
        <a
          href={`/api/integrations/google/start?surface=${input.view.surface}${input.view.isConnected ? "&reconnect=1" : ""}`}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
        >
          {actionLabel}
        </a>
      </div>
    </div>
  );
}

export function GoogleWorkspaceConnectionForm({
  integrationId,
  gmailView,
  calendarView,
  sheetsView,
  callbackSurface,
  callbackMessage,
  callbackStatus,
}: GoogleWorkspaceConnectionFormProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDisconnect() {
    if (!integrationId) {
      return;
    }

    const reason = requestReason(
      "Revocacion manual desde Settings para Google Workspace"
    );
    if (!reason) {
      setError("Debes indicar un motivo de al menos 8 caracteres.");
      return;
    }

    setIsDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo desconectar Google Workspace");
        return;
      }

      setMessage("Google Workspace quedo desconectado correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-600/20">
            <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Google Workspace</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Una sola integracion org-level `google` para dejar Gmail, Google Calendar y Google Sheets configurados por superficie.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-7">
        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">{message}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <GoogleSurfaceCard
            view={gmailView}
            callbackMessage={callbackSurface === "gmail" ? callbackMessage : null}
            callbackStatus={callbackSurface === "gmail" ? callbackStatus : null}
          />
          <GoogleSurfaceCard
            view={calendarView}
            callbackMessage={callbackSurface === "google_calendar" ? callbackMessage : null}
            callbackStatus={callbackSurface === "google_calendar" ? callbackStatus : null}
          />
          <GoogleSurfaceCard
            view={sheetsView}
            callbackMessage={callbackSurface === "google_sheets" ? callbackMessage : null}
            callbackStatus={callbackSurface === "google_sheets" ? callbackStatus : null}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50 px-7 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-slate-500">
          Desconectar revoca Gmail, Google Calendar y Google Sheets juntos porque comparten la misma integracion `google`.
        </p>
        {integrationId ? (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={isDisconnecting}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDisconnecting ? "Desconectando..." : "Desconectar Google Workspace"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
