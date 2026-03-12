"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentConnection } from "@/types/app";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type AgentConnectionPanelProps = {
  agentId: string;
  connection: AgentConnection;
  connectionSummary: AgentConnectionSummary;
  canResync?: boolean;
  showSensitiveDetails?: boolean;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin sincronizaciones registradas";
  }

  return new Date(value).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMetadataString(connection: AgentConnection, key: string): string | null {
  if (!connection.metadata || typeof connection.metadata !== "object" || Array.isArray(connection.metadata)) {
    return null;
  }

  const value = Reflect.get(connection.metadata, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatSyncError(connection: AgentConnection): string | null {
  if (!connection.last_sync_error) {
    return null;
  }

  if (connection.provider_type === "whatsapp") {
    if (connection.last_sync_error === "whatsapp_source_not_found") {
      return "La fuente WhatsApp ya no aparece disponible en Meta Cloud API.";
    }

    if (connection.last_sync_error === "integration_revoked") {
      return "La integracion del canal fue revocada o necesita reconexion antes de volver a sincronizar.";
    }

    if (connection.last_sync_error === "whatsapp_refresh_failed") {
      return "No se pudo reconciliar el canal WhatsApp. Reintenta desde QA.";
    }

    if (connection.last_sync_error === "whatsapp_webhook_processing_failed") {
      return "Hubo un fallo al ingerir mensajes reales desde el webhook de WhatsApp.";
    }

    return "La ultima sincronizacion del canal WhatsApp fallo. Revisa los logs del servidor para ver el detalle.";
  }

  if (connection.last_sync_error === "integration_revoked") {
    return "La integracion remota fue revocada o quedo fuera de servicio hasta reconectarla.";
  }

  if (connection.last_sync_error === "provider_sync_failed") {
    return "Fallo la sincronizacion con OpenAI. Reintenta o revisa la credencial configurada.";
  }

  if (connection.last_sync_error === "local_sync_failed") {
    return "OpenAI se actualizo, pero fallo la persistencia local. Ejecuta una resincronizacion.";
  }

  return "La ultima sincronizacion fallo. Revisa los logs del servidor para ver el detalle.";
}

function getPanelCopy(connection: AgentConnection, summary: AgentConnectionSummary) {
  if (summary.classification === "channel_connected") {
    return {
      title: "Canal WhatsApp conectado",
      subtitle: getMetadataString(connection, "display_phone_number") ?? connection.provider_agent_id,
      syncLabel: "Ultimo refresh",
      actionLabel: "Forzar sync",
    };
  }

  return {
    title: "Vinculo de infraestructura remota",
    subtitle: connection.provider_agent_id,
    syncLabel: "Ultimo check",
    actionLabel: "Forzar sync",
  };
}

export function AgentConnectionPanel({
  agentId,
  connection,
  connectionSummary,
  canResync = false,
  showSensitiveDetails = false,
}: AgentConnectionPanelProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncError = formatSyncError(connection);
  const copy = getPanelCopy(connection, connectionSummary);

  async function handleResync() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/resync`, {
        method: "POST",
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo resincronizar el agente");
        return;
      }

      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  let statusRingColor = "bg-sky-500 ring-sky-500/20";
  if (connection.sync_status === "error") {
    statusRingColor = "bg-rose-500 ring-rose-500/20";
  } else if (connection.sync_status === "syncing") {
    statusRingColor = "bg-amber-500 ring-amber-500/20 animate-pulse";
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-900 p-7 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-inset ring-slate-700">
            <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold tracking-wide text-white">{copy.title}</h2>
            {showSensitiveDetails ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-mono text-slate-400">
                {connectionSummary.classification === "channel_connected" ? "[Phone ID]" : "[Provider ID]"}
                <span className="text-slate-300">{copy.subtitle}</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-1 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <span>Estado general:</span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  <span className={`inline-block h-2 w-2 rounded-full ring-4 ${statusRingColor}`}></span>
                  {connection.sync_status}
                </span>
              </div>
              <p>{copy.syncLabel}: <span className="text-slate-200">{formatDate(connection.last_synced_at)}</span></p>
            </div>

            {syncError ? (
              <div className="mt-4 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2">
                <p className="text-sm font-medium text-rose-400">{syncError}</p>
              </div>
            ) : null}
          </div>
        </div>

        {canResync ? (
          <button
            type="button"
            onClick={handleResync}
            disabled={isSubmitting}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-sky-500 px-5 py-2 text-sm font-bold text-slate-950 transition-all hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <svg className="mr-2 h-4 w-4 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="mr-2 h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {copy.actionLabel}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-rose-400">{error}</p> : null}
    </div>
  );
}

