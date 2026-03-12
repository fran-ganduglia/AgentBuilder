"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  SALESFORCE_CRM_ACTIONS,
  getDefaultSalesforceAgentToolConfig,
  getSalesforceActionDescription,
  getSalesforceActionLabel,
  type SalesforceCrmAction,
} from "@/lib/integrations/salesforce-tools";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { Tables } from "@/types/database";

type AgentTool = Tables<"agent_tools">;
type Integration = Tables<"integrations">;

type AgentToolsPanelProps = {
  agentId: string;
  canEdit: boolean;
};

type AgentToolsResponse = {
  data?: {
    tools: AgentTool[];
    salesforceIntegration: Integration | null;
    salesforceOperationalView: IntegrationOperationalView;
    selectedSalesforceToolId: string | null;
    selectedSalesforceIntegrationId: string | null;
    selectedSalesforceAllowedActions: SalesforceCrmAction[];
    hasDuplicateSalesforceTools: boolean;
    hasMisalignedSalesforceTools: boolean;
    hasAlignedSelectedSalesforceTool: boolean;
    selectedSalesforceLookupEnabled: boolean;
    promptBlocksSalesforceAccess: boolean;
    salesforcePromptConflictSnippet: string | null;
  };
  error?: string;
};

export function AgentToolsPanel({ agentId, canEdit }: AgentToolsPanelProps) {
  const router = useRouter();
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [salesforceIntegration, setSalesforceIntegration] = useState<Integration | null>(null);
  const [operationalView, setOperationalView] = useState<IntegrationOperationalView | null>(null);
  const [selectedSalesforceToolId, setSelectedSalesforceToolId] = useState<string | null>(null);
  const [selectedSalesforceIntegrationId, setSelectedSalesforceIntegrationId] = useState<string | null>(null);
  const [hasDuplicateSalesforceTools, setHasDuplicateSalesforceTools] = useState(false);
  const [hasMisalignedSalesforceTools, setHasMisalignedSalesforceTools] = useState(false);
  const [selectedSalesforceLookupEnabled, setSelectedSalesforceLookupEnabled] = useState(true);
  const [promptBlocksSalesforceAccess, setPromptBlocksSalesforceAccess] = useState(false);
  const [salesforcePromptConflictSnippet, setSalesforcePromptConflictSnippet] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [selectedActions, setSelectedActions] = useState<SalesforceCrmAction[]>([
    ...getDefaultSalesforceAgentToolConfig().allowed_actions,
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

      const data = result.data;

      setTools(data.tools);
      setSalesforceIntegration(data.salesforceIntegration);
      setOperationalView(data.salesforceOperationalView);
      setSelectedSalesforceToolId(data.selectedSalesforceToolId);
      setSelectedSalesforceIntegrationId(data.selectedSalesforceIntegrationId);
      setHasDuplicateSalesforceTools(data.hasDuplicateSalesforceTools);
      setHasMisalignedSalesforceTools(data.hasMisalignedSalesforceTools);
      setSelectedSalesforceLookupEnabled(data.selectedSalesforceLookupEnabled);
      setPromptBlocksSalesforceAccess(data.promptBlocksSalesforceAccess);
      setSalesforcePromptConflictSnippet(data.salesforcePromptConflictSnippet);

      const crmTool = data.selectedSalesforceToolId
        ? data.tools.find((tool) => tool.id === data.selectedSalesforceToolId) ?? null
        : null;

      if (crmTool) {
        setEnabled(crmTool.is_enabled ?? true);
        setSelectedActions(
          data.selectedSalesforceAllowedActions.length
            ? data.selectedSalesforceAllowedActions
            : [...getDefaultSalesforceAgentToolConfig().allowed_actions]
        );
      } else {
        setEnabled(true);
        setSelectedActions([...getDefaultSalesforceAgentToolConfig().allowed_actions]);
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

  function toggleAction(action: SalesforceCrmAction) {
    setSelectedActions((current) =>
      current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action]
    );
  }

  async function saveTool() {
    if (!salesforceIntegration) {
      setError("Primero conecta Salesforce desde Settings > Integraciones.");
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
          toolType: "crm",
          integrationId: salesforceIntegration.id,
          isEnabled: enabled,
          config: {
            provider: "salesforce",
            allowed_actions: selectedActions,
          },
        }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo guardar la tool.");
        return;
      }

      setMessage("Tool CRM guardada correctamente.");
      await loadTools();
      void router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTool() {
    const crmTool = selectedSalesforceToolId
      ? tools.find((tool) => tool.id === selectedSalesforceToolId) ?? null
      : null;

    if (!crmTool) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/tools`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentToolId: crmTool.id }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo eliminar la tool.");
        return;
      }

      setMessage("Tool CRM eliminada.");
      await loadTools();
      void router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  const crmTool = selectedSalesforceToolId
    ? tools.find((tool) => tool.id === selectedSalesforceToolId) ?? null
    : null;

  const canSave =
    canEdit &&
    !saving &&
    Boolean(salesforceIntegration?.id) &&
    selectedActions.length > 0 &&
    operationalView?.status !== "revoked" &&
    operationalView?.status !== "reauth_required";

  return (
    <section id="agent-tools" className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Agent tools</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">CRM Salesforce</h3>
          <p className="mt-1 text-sm text-slate-500">
            Habilita lecturas automaticas y escrituras confirmadas para leads, accounts, opportunities, cases y tasks.
          </p>
        </div>
        {crmTool ? (
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
            {enabled ? "Tool habilitada" : "Tool deshabilitada"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Sin tool guardada
          </span>
        )}
      </div>

      <div className="space-y-6 pt-6">
        {loading ? <p className="text-sm text-slate-500">Cargando configuracion de tools...</p> : null}

        {!loading && operationalView ? (
          <div className={`rounded-lg border p-4 ${operationalView.tone === "rose" ? "border-rose-200 bg-rose-50" : operationalView.tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
            <p className="text-sm font-semibold text-slate-900">Estado de la integracion: {operationalView.label}</p>
            <p className="mt-1 text-sm text-slate-600">{operationalView.detail ?? operationalView.summary}</p>
          </div>
        ) : null}

        {!loading && hasDuplicateSalesforceTools ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Se detectaron multiples tools CRM de Salesforce para este agente. El chat usara la tool seleccionada mas reciente y compatible para evitar lecturas falsas.
          </div>
        ) : null}

        {!loading && hasMisalignedSalesforceTools ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            Hay tools CRM historicas apuntando a otra integracion Salesforce. La UI ya muestra la tool canonica, pero conviene revisar y limpiar las filas viejas para evitar diagnosticos confusos.
          </div>
        ) : null}

        {!loading && crmTool && !selectedSalesforceLookupEnabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            La tool CRM seleccionada no tiene habilitada la accion <span className="font-semibold">Buscar lead/contact</span> (`lookup_records`). Las busquedas directas por nombre en el chat no podran disparar lookup automatico hasta volver a guardarla con esa accion activa.
          </div>
        ) : null}

        {!loading && promptBlocksSalesforceAccess ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            El system prompt guardado del agente todavia contiene instrucciones compatibles con &quot;no tengo acceso al CRM&quot;. Aunque Salesforce este conectado, el modelo puede seguir respondiendo asi hasta corregir ese prompt.
            {salesforcePromptConflictSnippet ? (
              <p className="mt-2 rounded-md bg-white/70 px-3 py-2 font-mono text-xs text-rose-900">{salesforcePromptConflictSnippet}</p>
            ) : null}
          </div>
        ) : null}

        {!loading && !salesforceIntegration ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Conecta Salesforce en `/settings/integrations` antes de asignar esta tool al agente.
          </div>
        ) : null}

        {!loading ? (
          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Estado de la tool</p>
              <p className="text-xs text-slate-500">Si queda deshabilitada, la configuracion se conserva pero no podra ejecutarse.</p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </label>
        ) : null}

        {!loading ? (
          <div>
            <p className="text-sm font-semibold text-slate-900">Acciones permitidas</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SALESFORCE_CRM_ACTIONS.map((action) => (
                <label key={action} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(action)}
                    disabled={!canEdit}
                    onChange={() => toggleAction(action)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{getSalesforceActionLabel(action)}</p>
                    <p className="mt-1 text-xs text-slate-500">{getSalesforceActionDescription(action)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}

        {!canEdit ? (
          <p className="text-xs text-slate-500">Solo admin y editor pueden modificar tools del agente.</p>
        ) : null}
        {!loading && crmTool && selectedSalesforceIntegrationId ? (
          <p className="text-xs text-slate-500">
            Tool seleccionada para el chat: <span className="font-mono">{selectedSalesforceToolId}</span> sobre integracion <span className="font-mono">{selectedSalesforceIntegrationId}</span>.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Las escrituras requeriran confirmacion conversacional desde `/api/chat` antes de impactar en Salesforce.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {crmTool ? (
            <button
              type="button"
              onClick={() => void removeTool()}
              disabled={!canEdit || saving}
              className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Procesando..." : "Eliminar tool"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void saveTool()}
            disabled={!canSave}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : crmTool ? "Guardar tool" : "Crear tool"}
          </button>
        </div>
      </div>
    </section>
  );
}

