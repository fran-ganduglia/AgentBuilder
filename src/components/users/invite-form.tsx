"use client";

import { useState, useCallback } from "react";
import type { Agent } from "@/types/app";

type InviteFormProps = {
  agents: Agent[];
};

type InviteRole = "editor" | "viewer" | "operador";

type ApiResponse = {
  data?: { success: boolean; warning?: string };
  error?: string;
};

const roleOptions: { value: InviteRole; label: string; description: string }[] = [
  { value: "editor", label: "Editor", description: "Crea y edita agentes" },
  { value: "viewer", label: "Viewer", description: "Solo lectura del dashboard" },
  { value: "operador", label: "Operador", description: "Usa agentes asignados" },
];

export function InviteForm({ agents }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAgentToggle = useCallback((agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  }, []);

  const resetForm = useCallback(() => {
    setEmail("");
    setFullName("");
    setRole("editor");
    setSelectedAgentIds([]);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      const trimmedEmail = email.trim();
      const trimmedName = fullName.trim();

      if (!trimmedEmail || !trimmedName) {
        setErrorMessage("Email y nombre son requeridos");
        setIsSubmitting(false);
        return;
      }

      if (role === "operador" && selectedAgentIds.length === 0) {
        setErrorMessage("Selecciona al menos un agente para el rol operador");
        setIsSubmitting(false);
        return;
      }

      const body: Record<string, unknown> = {
        email: trimmedEmail,
        fullName: trimmedName,
        role,
      };

      if (role === "operador") {
        body.agentIds = selectedAgentIds;
      }

      try {
        const response = await fetch("/api/users/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json: ApiResponse = await response.json();

        if (!response.ok || json.error) {
          setErrorMessage(json.error ?? "No se pudo enviar la invitacion");
          return;
        }

        if (json.data?.warning) {
          setSuccessMessage(`Invitacion enviada. ${json.data.warning}`);
        } else {
          setSuccessMessage(`Invitacion enviada a ${trimmedEmail}`);
        }

        resetForm();
      } catch {
        setErrorMessage("No se pudo conectar con el servidor");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, fullName, role, selectedAgentIds, resetForm]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {successMessage && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="usuario@empresa.com"
          />
        </div>

        <div>
          <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700">
            Nombre completo
          </label>
          <input
            id="invite-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={isSubmitting}
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Juan Perez"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Rol</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setRole(option.value);
                if (option.value !== "operador") {
                  setSelectedAgentIds([]);
                }
              }}
              disabled={isSubmitting}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                role === option.value
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-gray-200 hover:border-gray-300"
              } disabled:opacity-50`}
            >
              <p className="text-sm font-medium text-gray-900">{option.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {role === "operador" && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Agentes asignados
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Selecciona los agentes que este usuario podra utilizar
          </p>
          {agents.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">
              No hay agentes disponibles. Crea un agente primero.
            </p>
          ) : (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {agents.map((agent) => (
                <label
                  key={agent.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.includes(agent.id)}
                    onChange={() => handleAgentToggle(agent.id)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">{agent.status}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting ? "Enviando invitacion..." : "Enviar invitacion"}
        </button>
      </div>
    </form>
  );
}
