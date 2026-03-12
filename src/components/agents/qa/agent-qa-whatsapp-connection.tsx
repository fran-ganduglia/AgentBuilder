"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgentConnection } from "@/types/app";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type WhatsAppSource = {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
  platformType: string | null;
  wabaId: string;
};

type AgentQaWhatsAppConnectionProps = {
  agentId: string;
  agentStatus: string;
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  whatsappIntegrationId: string | null;
  onConnected: () => void;
  onRefreshed: () => void;
  onError: (message: string) => void;
};

function getConnectionLabel(connection: AgentConnection | null): string {
  if (!connection?.metadata || typeof connection.metadata !== "object" || Array.isArray(connection.metadata)) {
    return connection?.provider_agent_id ?? "Fuente conectada";
  }

  const displayPhoneNumber = Reflect.get(connection.metadata, "display_phone_number");
  return typeof displayPhoneNumber === "string" && displayPhoneNumber.length > 0
    ? displayPhoneNumber
    : connection.provider_agent_id;
}

export function AgentQaWhatsAppConnection({
  agentId,
  agentStatus,
  connection,
  connectionSummary,
  whatsappIntegrationId,
  onConnected,
  onRefreshed,
  onError,
}: AgentQaWhatsAppConnectionProps) {
  const [sources, setSources] = useState<WhatsAppSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLoadSources() {
    if (!whatsappIntegrationId) {
      return;
    }

    setIsLoadingSources(true);
    onError("");

    try {
      const response = await fetch(`/api/integrations/${whatsappIntegrationId}/whatsapp-sources`, {
        method: "GET",
        cache: "no-store",
      });
      const result = (await response.json()) as { data?: WhatsAppSource[]; error?: string };

      if (!response.ok || !result.data) {
        onError(result.error ?? "No se pudieron cargar las fuentes WhatsApp");
        return;
      }

      setSources(result.data);
      setSelectedSourceId(result.data[0]?.phoneNumberId ?? "");
      setShowPicker(true);
    } catch {
      onError("No se pudieron cargar las fuentes WhatsApp");
    } finally {
      setIsLoadingSources(false);
    }
  }

  async function handleAttachSource() {
    if (!selectedSourceId || !whatsappIntegrationId) {
      return;
    }

    setIsSubmitting(true);
    onError("");

    try {
      const response = await fetch(`/api/agents/${agentId}/qa/whatsapp-source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: whatsappIntegrationId,
          phoneNumberId: selectedSourceId,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        onError(result.error ?? "No se pudo conectar la fuente WhatsApp");
        return;
      }

      setShowPicker(false);
      onConnected();
    } catch {
      onError("No se pudo conectar la fuente WhatsApp");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRefresh() {
    setIsSubmitting(true);
    onError("");

    try {
      const response = await fetch(`/api/agents/${agentId}/qa/whatsapp-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        onError(result.error ?? "No se pudo refrescar la fuente WhatsApp");
        return;
      }

      onRefreshed();
    } catch {
      onError("No se pudo refrescar la fuente WhatsApp");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (connectionSummary.classification === "channel_connected" && connection) {
    return (
      <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Canal real conectado</p>
            <h3 className="mt-2 text-lg font-bold text-slate-950">{getConnectionLabel(connection)}</h3>
            <p className="mt-2 text-sm text-slate-700">
              El inbox QA recibe conversaciones reales de este numero en modo solo lectura. El chat operativo local queda deshabilitado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Refrescando..." : "Refrescar"}
          </button>
        </div>
      </div>
    );
  }

  if (!whatsappIntegrationId) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">WhatsApp conectado</p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">Primero conecta Meta Cloud API en Settings</h3>
        <p className="mt-2 text-sm text-slate-600">
          Cuando la organizacion tenga una integracion WhatsApp activa, podras elegir aqui un numero real para observar conversaciones desde QA.
        </p>
        <Link href="/settings/integrations" className="mt-4 inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
          Ir a Integraciones
        </Link>
      </div>
    );
  }

  if (agentStatus !== "active") {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">WhatsApp conectado</p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">Activa el agente para conectar una fuente real</h3>
        <p className="mt-2 text-sm text-slate-600">
          El attach inicial de WhatsApp se hace desde QA sobre agentes activos. Una vez conectado, QA sigue disponible como inbox principal del canal real.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Canal real opcional</p>
          <h3 className="mt-2 text-lg font-bold text-slate-950">Conecta una fuente WhatsApp a este agente</h3>
          <p className="mt-2 text-sm text-slate-600">
            Esto habilita sandbox + QA sobre conversaciones reales y reemplaza el chat operativo local para este agente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLoadSources()}
          disabled={isLoadingSources || isSubmitting}
          className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoadingSources ? "Cargando fuentes..." : "Conectar fuente WhatsApp"}
        </button>
      </div>

      {showPicker ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Selecciona un numero disponible</p>
          <div className="space-y-2">
            {sources.map((source) => (
              <label key={source.phoneNumberId} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <input
                  type="radio"
                  name="whatsapp-source"
                  checked={selectedSourceId === source.phoneNumberId}
                  onChange={() => setSelectedSourceId(source.phoneNumberId)}
                  className="mt-1 h-4 w-4"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{source.displayPhoneNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {source.verifiedName ?? "Sin nombre verificado"}
                    {source.qualityRating ? ` | Calidad ${source.qualityRating}` : ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAttachSource()}
              disabled={!selectedSourceId || isSubmitting}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Conectando..." : "Guardar fuente"}
            </button>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
