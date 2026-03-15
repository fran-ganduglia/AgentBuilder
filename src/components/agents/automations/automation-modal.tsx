"use client";

import { useEffect, useState } from "react";
import { AGENT_SCOPE_LABELS, type AgentScope } from "@/lib/agents/agent-scope";
import type { AutomationExample } from "@/lib/agents/automation-suggestions";
import type { AgentAutomation } from "@/lib/db/agent-automations";

type Step = "trigger" | "action" | "review";

type TriggerConfig = {
  type: "schedule" | "event";
  cron: string;
  timezone: string;
};

type ActionConfig = {
  instruction: string;
  expectedOutput: string;
  deliveryTarget: string;
  approvalMode: "writes_require_approval";
};

type AutomationModalProps = {
  agentId: string;
  agentScope?: AgentScope | null;
  initialExample?: AutomationExample | null;
  initialAutomation?: AgentAutomation | null;
  onSaved: (automation: AgentAutomation) => void;
  onClose: () => void;
};

const CRON_PRESETS = [
  { label: "Lunes a viernes a las 9am", value: "0 9 * * 1-5" },
  { label: "Todos los dias a las 8am", value: "0 8 * * *" },
  { label: "Todos los viernes a las 5pm", value: "0 17 * * 5" },
  { label: "Personalizado", value: "custom" },
] as const;

export function AutomationModal({
  agentId,
  agentScope,
  initialExample,
  initialAutomation,
  onSaved,
  onClose,
}: AutomationModalProps) {
  const [step, setStep] = useState<Step>("trigger");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerConfig>({
    type: "schedule",
    cron: "0 9 * * 1-5",
    timezone: "America/Buenos_Aires",
  });
  const [selectedPreset, setSelectedPreset] = useState<string>("0 9 * * 1-5");
  const [action, setAction] = useState<ActionConfig>({
    instruction: "",
    expectedOutput: "",
    deliveryTarget: "",
    approvalMode: "writes_require_approval",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(initialAutomation);

  useEffect(() => {
    if (initialAutomation) {
      const actionConfig = initialAutomation.action_config as Record<string, unknown>;
      const triggerConfig = initialAutomation.trigger_config as Record<string, unknown>;

      setName(initialAutomation.name);
      setDescription(initialAutomation.description ?? "");
      setTrigger({
        type: initialAutomation.trigger_type === "event" ? "event" : "schedule",
        cron:
          typeof triggerConfig.cron === "string"
            ? triggerConfig.cron
            : "0 9 * * 1-5",
        timezone:
          typeof triggerConfig.timezone === "string"
            ? triggerConfig.timezone
            : "America/Buenos_Aires",
      });
      setSelectedPreset(
        typeof triggerConfig.cron === "string" &&
          CRON_PRESETS.some((preset) => preset.value === triggerConfig.cron)
          ? triggerConfig.cron
          : "custom"
      );
      setAction({
        instruction:
          typeof actionConfig.instruction === "string" ? actionConfig.instruction : "",
        expectedOutput:
          typeof actionConfig.expected_output === "string"
            ? actionConfig.expected_output
            : "",
        deliveryTarget:
          typeof actionConfig.delivery_target === "string"
            ? actionConfig.delivery_target
            : "",
        approvalMode: "writes_require_approval",
      });
      return;
    }

    if (!initialExample) {
      return;
    }

    setName(initialExample.name);
    setDescription(initialExample.description);
    setTrigger({
      type: initialExample.triggerType,
      cron:
        typeof initialExample.triggerConfig.cron === "string"
          ? initialExample.triggerConfig.cron
          : "0 9 * * 1-5",
      timezone:
        typeof initialExample.triggerConfig.timezone === "string"
          ? initialExample.triggerConfig.timezone
          : "America/Buenos_Aires",
    });
    setSelectedPreset(
      typeof initialExample.triggerConfig.cron === "string"
        ? initialExample.triggerConfig.cron
        : "custom"
    );
    setAction({
      instruction: initialExample.instruction,
      expectedOutput: initialExample.expectedOutput,
      deliveryTarget: initialExample.deliveryTarget,
      approvalMode: initialExample.approvalMode,
    });
  }, [initialAutomation, initialExample]);

  function handlePresetChange(value: string) {
    setSelectedPreset(value);
    if (value !== "custom") {
      setTrigger((prev) => ({ ...prev, cron: value }));
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("El nombre es requerido");
      return;
    }

    if (!action.instruction.trim()) {
      setError("La instruccion es requerida");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const automationPath = initialAutomation
        ? `/api/agents/${agentId}/automations/${initialAutomation.id}`
        : `/api/agents/${agentId}/automations`;

      const response = await fetch(automationPath, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          trigger: {
            type: trigger.type,
            config: {
              cron: trigger.cron,
              timezone: trigger.timezone,
            },
          },
          instruction: action.instruction.trim(),
          expectedOutput: action.expectedOutput.trim() || undefined,
          deliveryTarget: action.deliveryTarget.trim() || undefined,
          approvalMode: action.approvalMode,
        }),
      });

      const result = (await response.json()) as { data?: AgentAutomation; error?: string };

      if (!response.ok || !result.data) {
        setError(result.error ?? (isEditing
          ? "No se pudo actualizar la automatizacion"
          : "No se pudo crear la automatizacion"));
        return;
      }

      onSaved(result.data);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? "Editar automatizacion" : "Nueva automatizacion"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {step === "trigger" && "Paso 1: Nombre y disparador"}
              {step === "action" && "Paso 2: Instruccion y salida esperada"}
              {step === "review" && `Paso 3: Revisar y ${isEditing ? "guardar" : "crear"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-medium text-rose-800">{error}</p>
          </div>
        ) : null}

        {agentScope ? (
          <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <p className="text-sm font-semibold text-sky-900">
              Esta automatizacion corre dentro de un agente de {AGENT_SCOPE_LABELS[agentScope].toLowerCase()}.
            </p>
            <p className="mt-1 text-sm text-sky-800">
              Si la instruccion queda fuera de ese alcance, se bloquea o debe revisarse antes de ejecutarse.
            </p>
          </div>
        ) : null}

        {step === "trigger" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Nombre <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej: Resumen semanal de pipeline"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Descripcion
              </label>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Para que sirve esta automatizacion"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Frecuencia</label>
              <div className="mt-1.5 space-y-2">
                {CRON_PRESETS.map((preset) => (
                  <label key={preset.value} className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="cron-preset"
                      value={preset.value}
                      checked={selectedPreset === preset.value}
                      onChange={() => handlePresetChange(preset.value)}
                    />
                    <span className="text-sm text-slate-700">{preset.label}</span>
                  </label>
                ))}
              </div>

              {selectedPreset === "custom" ? (
                <input
                  type="text"
                  value={trigger.cron}
                  onChange={(event) => setTrigger((prev) => ({ ...prev, cron: event.target.value }))}
                  placeholder="0 9 * * 1-5"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Zona horaria</label>
              <select
                value={trigger.timezone}
                onChange={(event) => setTrigger((prev) => ({ ...prev, timezone: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="America/Buenos_Aires">Argentina (ART)</option>
                <option value="America/Mexico_City">Mexico (CST)</option>
                <option value="America/Bogota">Colombia (COT)</option>
                <option value="America/Santiago">Chile (CLT)</option>
                <option value="America/Lima">Peru (PET)</option>
                <option value="Europe/Madrid">Espana (CET)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        ) : null}

        {step === "action" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Instruccion <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={action.instruction}
                onChange={(event) => setAction((prev) => ({ ...prev, instruction: event.target.value }))}
                rows={5}
                placeholder="Ej: Revisa las oportunidades abiertas sin actividad en los ultimos 7 dias y prioriza que hacer."
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                maxLength={2000}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Output esperado</label>
                <textarea
                  value={action.expectedOutput}
                  onChange={(event) => setAction((prev) => ({ ...prev, expectedOutput: event.target.value }))}
                  rows={4}
                  placeholder="Ej: Un resumen accionable con riesgos, oportunidades y siguientes pasos."
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Destino de entrega</label>
                <textarea
                  value={action.deliveryTarget}
                  onChange={(event) => setAction((prev) => ({ ...prev, deliveryTarget: event.target.value }))}
                  rows={4}
                  placeholder="Ej: chat del agente, documento interno o inbox de approvals."
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  maxLength={500}
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Nombre</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{name}</p>
              </div>
              {description ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Descripcion</p>
                  <p className="mt-0.5 text-sm text-slate-700">{description}</p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Disparador</p>
                <p className="mt-0.5 font-mono text-sm text-slate-700">{trigger.cron}</p>
                <p className="text-xs text-slate-400">{trigger.timezone}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Instruccion</p>
                <p className="mt-0.5 text-sm text-slate-700">{action.instruction}</p>
              </div>
              {action.expectedOutput ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Output esperado</p>
                  <p className="mt-0.5 text-sm text-slate-700">{action.expectedOutput}</p>
                </div>
              ) : null}
              {action.deliveryTarget ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Destino</p>
                  <p className="mt-0.5 text-sm text-slate-700">{action.deliveryTarget}</p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Approval mode</p>
                <p className="mt-0.5 text-sm text-slate-700">writes_require_approval</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => {
              if (step === "trigger") {
                onClose();
              } else if (step === "action") {
                setStep("trigger");
              } else {
                setStep("action");
              }
            }}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            {step === "trigger" ? "Cancelar" : "Volver"}
          </button>

          {step === "review" ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting
                ? isEditing
                  ? "Guardando..."
                  : "Creando..."
                : isEditing
                  ? "Guardar cambios"
                  : "Crear automatizacion"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (step === "trigger") setStep("action");
                else setStep("review");
              }}
              className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              Siguiente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
