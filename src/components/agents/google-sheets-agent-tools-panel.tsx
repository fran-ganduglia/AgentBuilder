"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getDefaultGoogleSheetsAgentToolConfig,
  getGoogleSheetsActionDescription,
  getGoogleSheetsActionLabel,
  GOOGLE_SHEETS_TOOL_ACTIONS,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { Tables } from "@/types/database";

type AgentTool = Tables<"agent_tools">;
type Integration = Tables<"integrations">;

type AgentToolsResponse = {
  data?: {
    tools: AgentTool[];
    googleIntegration: Integration | null;
    googleOperationalView: IntegrationOperationalView;
    selectedGoogleSheetsToolId: string | null;
    selectedGoogleSheetsIntegrationId: string | null;
    selectedGoogleSheetsAllowedActions: GoogleSheetsToolAction[];
    hasDuplicateGoogleSheetsTools: boolean;
    hasMisalignedGoogleSheetsTools: boolean;
  };
  error?: string;
};

export function GoogleSheetsAgentToolsPanel({
  agentId,
  canEdit,
}: {
  agentId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [googleIntegration, setGoogleIntegration] = useState<Integration | null>(null);
  const [operationalView, setOperationalView] = useState<IntegrationOperationalView | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [hasDuplicateTools, setHasDuplicateTools] = useState(false);
  const [hasMisalignedTools, setHasMisalignedTools] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [selectedActions, setSelectedActions] = useState<GoogleSheetsToolAction[]>([
    ...getDefaultGoogleSheetsAgentToolConfig().allowed_actions,
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/tools`, {
        method: "GET",
        cache: "no-store",
      });
      const result = (await response.json()) as AgentToolsResponse;

      if (!response.ok || result.error || !result.data) {
        setError(result.error ?? "No se pudo cargar la configuracion de tools.");
        return;
      }

      setTools(result.data.tools);
      setGoogleIntegration(result.data.googleIntegration);
      setOperationalView(result.data.googleOperationalView);
      setSelectedToolId(result.data.selectedGoogleSheetsToolId);
      setSelectedIntegrationId(result.data.selectedGoogleSheetsIntegrationId);
      setHasDuplicateTools(result.data.hasDuplicateGoogleSheetsTools);
      setHasMisalignedTools(result.data.hasMisalignedGoogleSheetsTools);

      const tool = result.data.selectedGoogleSheetsToolId
        ? result.data.tools.find((item) => item.id === result.data?.selectedGoogleSheetsToolId) ?? null
        : null;

      if (tool) {
        setEnabled(tool.is_enabled ?? true);
        setSelectedActions(
          result.data.selectedGoogleSheetsAllowedActions.length
            ? result.data.selectedGoogleSheetsAllowedActions
            : [...getDefaultGoogleSheetsAgentToolConfig().allowed_actions]
        );
      } else {
        setEnabled(true);
        setSelectedActions([...getDefaultGoogleSheetsAgentToolConfig().allowed_actions]);
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  async function saveTool() {
    if (!googleIntegration) {
      setError("Primero conecta Google Workspace desde Settings > Integraciones.");
      return;
    }

    if (selectedActions.length === 0) {
      setError("Debes habilitar al menos una accion.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolType: "google_sheets",
          integrationId: googleIntegration.id,
          isEnabled: enabled,
          config: {
            provider: "google",
            surface: "google_sheets",
            allowed_actions: selectedActions,
          },
        }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo guardar la tool.");
        return;
      }

      setMessage("Tool Google Sheets guardada correctamente.");
      await loadTools();
      void router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTool() {
    const tool = selectedToolId ? tools.find((item) => item.id === selectedToolId) ?? null : null;
    if (!tool) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/tools`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentToolId: tool.id }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo eliminar la tool.");
        return;
      }

      setMessage("Tool Google Sheets eliminada.");
      await loadTools();
      void router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  const tool = selectedToolId ? tools.find((item) => item.id === selectedToolId) ?? null : null;
  const canSave = canEdit && !saving && Boolean(googleIntegration?.id) && selectedActions.length > 0;

  return (
    <section id="agent-tools-sheets" className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Agent tools</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">Google Sheets</h3>
          <p className="mt-1 text-sm text-slate-500">
            Habilita Google Sheets para este agente con lecturas directas en chat y operaciones de escritura, estructura y formato mediadas por approval inbox.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${tool && enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
          {tool ? (enabled ? "Tool habilitada" : "Tool deshabilitada") : "Sin tool guardada"}
        </span>
      </div>

      <div className="space-y-6 pt-6">
        {loading ? <p className="text-sm text-slate-500">Cargando configuracion de tools...</p> : null}
        {!loading && operationalView ? (
          <div className={`rounded-lg border p-4 ${operationalView.tone === "rose" ? "border-rose-200 bg-rose-50" : operationalView.tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
            <p className="text-sm font-semibold text-slate-900">Estado de la integracion: {operationalView.label}</p>
            <p className="mt-1 text-sm text-slate-600">{operationalView.detail ?? operationalView.summary}</p>
          </div>
        ) : null}
        {!loading && hasDuplicateTools ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Se detectaron multiples tools Google Sheets para este agente. La UI usa la configuracion compatible mas reciente.</div> : null}
        {!loading && hasMisalignedTools ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Hay tools Google Sheets historicas apuntando a otra integracion Google. Conviene limpiarlas para evitar diagnosticos confusos.</div> : null}
        {!loading && !googleIntegration ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Conecta Google Workspace en `/settings/integrations` antes de asignar esta tool al agente.</div> : null}

        {!loading ? (
          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Estado de la tool</p>
              <p className="text-xs text-slate-500">Si queda deshabilitada, el agente mantiene la configuracion pero Sheets no se ejecutara en chat ni en writes aprobadas.</p>
            </div>
            <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
          </label>
        ) : null}

        {!loading ? (
          <div>
            <p className="text-sm font-semibold text-slate-900">Acciones permitidas</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {GOOGLE_SHEETS_TOOL_ACTIONS.map((action) => (
                <label key={action} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <input type="checkbox" checked={selectedActions.includes(action)} disabled={!canEdit} onChange={() => setSelectedActions((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action])} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{getGoogleSheetsActionLabel(action)}</p>
                    <p className="mt-1 text-xs text-slate-500">{getGoogleSheetsActionDescription(action)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        {!loading && tool && selectedIntegrationId ? <p className="text-xs text-slate-500">Tool configurada para este agente: <span className="font-mono">{selectedToolId}</span> sobre integracion <span className="font-mono">{selectedIntegrationId}</span>.</p> : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">El spreadsheet y la hoja se pasan por request. La tool mantiene la integracion compartida `google` y no guarda un spreadsheet fijo.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {tool ? <button type="button" onClick={() => void removeTool()} disabled={!canEdit || saving} className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Procesando..." : "Eliminar tool"}</button> : null}
          <button type="button" onClick={() => void saveTool()} disabled={!canSave} className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando..." : tool ? "Guardar tool" : "Crear tool"}</button>
        </div>
      </div>
    </section>
  );
}
