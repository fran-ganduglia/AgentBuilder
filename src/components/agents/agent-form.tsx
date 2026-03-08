"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { Agent, AgentStatus } from "@/types/app";

type AgentFormProps = {
  agent?: Agent;
};

const agentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: z.string().min(1, "El modelo es requerido"),
  llmTemperature: z.number().min(0).max(1, "La temperatura maxima es 1.0"),
  status: z.enum(["draft", "active", "paused", "archived"]),
});

type FormFields = {
  name: string;
  systemPrompt: string;
  llmModel: string;
  llmTemperature: number;
  status: AgentStatus;
};

const LLM_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "gemini-pro", label: "Gemini Pro" },
] as const;

const AGENT_STATUSES: Array<{ value: AgentStatus; label: string }> = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "archived", label: "Archivado" },
];

export function AgentForm({ agent }: AgentFormProps) {
  const router = useRouter();
  const isEditing = agent !== undefined;

  const [fields, setFields] = useState<FormFields>({
    name: agent?.name ?? "",
    systemPrompt: agent?.system_prompt ?? "",
    llmModel: agent?.llm_model ?? "gemini-pro",
    llmTemperature: agent?.llm_temperature ?? 0.7,
    status: (agent?.status as AgentStatus | undefined) ?? "draft",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange<K extends keyof FormFields>(field: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSubmitError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = agentSchema.safeParse(fields);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormFields, string>> = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0] as keyof FormFields | undefined;
        if (key && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      const url = isEditing ? `/api/agents/${agent.id}` : "/api/agents";
      const method = isEditing ? "PATCH" : "POST";
      const payload = isEditing
        ? parsed.data
        : {
            name: parsed.data.name,
            systemPrompt: parsed.data.systemPrompt,
            llmModel: parsed.data.llmModel,
            llmTemperature: parsed.data.llmTemperature,
          };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result: { data?: unknown; error?: string } = await response.json();

      if (!response.ok || result.error) {
        setSubmitError(result.error ?? "Error al guardar el agente");
        return;
      }

      router.push(isEditing ? `/agents/${agent.id}` : "/agents");
      router.refresh();
    } catch {
      setSubmitError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nombre del agente
        </label>
        <input
          id="name"
          type="text"
          value={fields.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Asistente de ventas"
        />
        {errors.name ? (
          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700">
          System prompt
        </label>
        <textarea
          id="systemPrompt"
          rows={6}
          value={fields.systemPrompt}
          onChange={(e) => handleChange("systemPrompt", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Sos un asistente de ventas amable y profesional..."
        />
        {errors.systemPrompt ? (
          <p className="mt-1 text-sm text-red-600">{errors.systemPrompt}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="llmModel" className="block text-sm font-medium text-gray-700">
          Modelo
        </label>
        <select
          id="llmModel"
          value={fields.llmModel}
          onChange={(e) => handleChange("llmModel", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {LLM_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
        {errors.llmModel ? (
          <p className="mt-1 text-sm text-red-600">{errors.llmModel}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="llmTemperature" className="block text-sm font-medium text-gray-700">
          Temperatura: {fields.llmTemperature.toFixed(1)}
        </label>
        <input
          id="llmTemperature"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={fields.llmTemperature}
          onChange={(e) => handleChange("llmTemperature", parseFloat(e.target.value))}
          className="mt-2 w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>Preciso (0.0)</span>
          <span>Creativo (1.0)</span>
        </div>
        {errors.llmTemperature ? (
          <p className="mt-1 text-sm text-red-600">{errors.llmTemperature}</p>
        ) : null}
      </div>

      {isEditing ? (
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Estado
          </label>
          <select
            id="status"
            value={fields.status}
            onChange={(e) => handleChange("status", e.target.value as AgentStatus)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {AGENT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            El chat solo funciona cuando el agente esta en estado Activo.
          </p>
        </div>
      ) : null}

      {submitError ? (
        <p className="text-sm text-red-600" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear agente"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/agents")}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
