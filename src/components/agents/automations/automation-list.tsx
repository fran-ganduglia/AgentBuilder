"use client";

import { useEffect, useState } from "react";
import { AutomationModal } from "@/components/agents/automations/automation-modal";
import type { AgentScope } from "@/lib/agents/agent-scope";
import type { AutomationExample } from "@/lib/agents/automation-suggestions";
import type { AgentAutomation } from "@/lib/db/agent-automations";

type AutomationListProps = {
  agentId: string;
  agentScope: AgentScope | null;
  canEdit: boolean;
};

function formatTrigger(automation: AgentAutomation): string {
  if (automation.trigger_type === "schedule") {
    const cron = (automation.trigger_config as Record<string, unknown>).cron;
    return typeof cron === "string" ? `Cron: ${cron}` : "Cron";
  }

  if (automation.trigger_type === "event") {
    const integration = (automation.trigger_config as Record<string, unknown>).integration;
    const event = (automation.trigger_config as Record<string, unknown>).event;
    return typeof integration === "string" && typeof event === "string"
      ? `${integration}: ${event}`
      : "Evento";
  }

  return "Webhook";
}

function formatLastRun(automation: AgentAutomation): string {
  if (!automation.last_run_at) return "Nunca ejecutada";

  const date = new Date(automation.last_run_at);
  return date.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatActionPreview(automation: AgentAutomation): string {
  const actionConfig = automation.action_config as Record<string, unknown>;
  const instruction = typeof actionConfig.instruction === "string" ? actionConfig.instruction : null;
  const expectedOutput = typeof actionConfig.expected_output === "string" ? actionConfig.expected_output : null;

  if (instruction && expectedOutput) {
    return `${instruction} Output esperado: ${expectedOutput}`;
  }

  if (instruction) {
    return instruction;
  }

  const prompt = typeof actionConfig.prompt === "string" ? actionConfig.prompt : null;
  return prompt ?? "Sin instruccion visible";
}

function StatusBadge({ status }: { status: AgentAutomation["last_run_status"] }) {
  if (!status) return null;

  const config = {
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
    skipped: "bg-slate-100 text-slate-600",
  }[status];

  const label = { success: "Ok", failed: "Error", skipped: "Omitida" }[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${config}`}>
      {label}
    </span>
  );
}

export function AutomationList({ agentId, agentScope, canEdit }: AutomationListProps) {
  const [automations, setAutomations] = useState<AgentAutomation[]>([]);
  const [examples, setExamples] = useState<AutomationExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExample, setSelectedExample] = useState<AutomationExample | null>(null);
  const [selectedAutomation, setSelectedAutomation] = useState<AgentAutomation | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [automationsRes, examplesRes] = await Promise.all([
          fetch(`/api/agents/${agentId}/automations`),
          fetch(`/api/agents/${agentId}/automations/recommended`),
        ]);

        const [automationsData, examplesData] = await Promise.all([
          automationsRes.json() as Promise<{ data?: AgentAutomation[] }>,
          examplesRes.json() as Promise<{ data?: AutomationExample[] }>,
        ]);

        if (!cancelled) {
          setAutomations(automationsData.data ?? []);
          setExamples(examplesData.data ?? []);
        }
      } catch {
        // Errors silently ignored; user sees empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  async function handleToggleEnabled(automation: AgentAutomation) {
    setTogglingId(automation.id);
    try {
      const response = await fetch(
        `/api/agents/${agentId}/automations/${automation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled: !automation.is_enabled }),
        }
      );

      const result = (await response.json()) as { data?: AgentAutomation };
      if (result.data) {
        setAutomations((prev) =>
          prev.map((item) => (item.id === automation.id ? result.data! : item))
        );
      }
    } catch {
      // Silently ignore toggle errors
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(automationId: string) {
    const confirmed = window.confirm("Eliminar esta automatizacion? Esta accion no se puede deshacer.");
    if (!confirmed) return;

    try {
      await fetch(`/api/agents/${agentId}/automations/${automationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      setAutomations((prev) => prev.filter((automation) => automation.id !== automationId));
    } catch {
      // Silently ignore delete errors
    }
  }

  function handleSaved(automation: AgentAutomation) {
    setAutomations((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === automation.id);
      if (existingIndex === -1) {
        return [...prev, automation];
      }

      return prev.map((item) => (item.id === automation.id ? automation : item));
    });
    setSelectedExample(null);
    setSelectedAutomation(null);
    setModalOpen(false);
  }

  const visibleExamples = examples.filter(
    (example) => !automations.some((automation) => automation.name === example.name)
  );

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-slate-400">Cargando automatizaciones...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Automatizaciones</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Tareas programadas o por evento que usan el mismo runtime del agente y respetan approvals para escrituras sensibles.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setSelectedExample(null);
              setSelectedAutomation(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            + Nueva automatizacion
          </button>
        ) : null}
      </div>

      {automations.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-600">Sin automatizaciones configuradas</p>
          <p className="mt-1 text-sm text-slate-400">
            Crea una automatizacion para que el agente ejecute tareas programadas con el mismo runtime operativo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((automation) => (
            <li
              key={automation.id}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{automation.name}</p>
                  <StatusBadge status={automation.last_run_status} />
                </div>
                {automation.description ? (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{automation.description}</p>
                ) : null}
                <p className="mt-1 text-[12px] text-slate-400">
                  {formatTrigger(automation)} | Ultima ejecucion: {formatLastRun(automation)}
                </p>
                <p className="mt-2 text-sm text-slate-600">{formatActionPreview(automation)}</p>
              </div>

              {canEdit ? (
                <div className="flex flex-shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAutomation(automation);
                      setSelectedExample(null);
                      setModalOpen(true);
                    }}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={togglingId === automation.id}
                    onClick={() => handleToggleEnabled(automation)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 ${automation.is_enabled ? "bg-emerald-500" : "bg-slate-200"}`}
                    aria-label={automation.is_enabled ? "Desactivar" : "Activar"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${automation.is_enabled ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(automation.id)}
                    className="text-sm font-medium text-rose-500 hover:text-rose-700"
                  >
                    Eliminar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {visibleExamples.length > 0 && canEdit ? (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Ejemplos editables
          </p>
          <ul className="space-y-2">
            {visibleExamples.map((example) => (
              <li
                key={example.id}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700">{example.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{example.description}</p>
                  <p className="mt-2 text-xs text-slate-400">{example.expectedOutput}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExample(example);
                    setSelectedAutomation(null);
                    setModalOpen(true);
                  }}
                  className="flex-shrink-0 text-sm font-semibold text-slate-900 hover:underline"
                >
                  Usar ejemplo
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {modalOpen ? (
        <AutomationModal
          agentId={agentId}
          agentScope={agentScope}
          initialExample={selectedExample}
          initialAutomation={selectedAutomation}
          onSaved={handleSaved}
          onClose={() => {
            setSelectedExample(null);
            setSelectedAutomation(null);
            setModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
