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
  { value: "editor", label: "Editor", description: "Crea y edita agentes del espacio" },
  { value: "viewer", label: "Viewer", description: "Auditor de estadísticas en dashboard" },
  { value: "operador", label: "Operador", description: "Ejecución de agentes delegados" },
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
        setErrorMessage("Todos los campos personales son requeridos.");
        setIsSubmitting(false);
        return;
      }

      if (role === "operador" && selectedAgentIds.length === 0) {
        setErrorMessage("Debes asignar al menos un agente para perfilar como Operador.");
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
          setErrorMessage(json.error ?? "Dolo: La invitación ha fallado de emitir.");
          return;
        }

        if (json.data?.warning) {
          setSuccessMessage(`Completado. ${json.data.warning}`);
        } else {
          setSuccessMessage(`Llamado emitido asincronamente para ${trimmedEmail}`);
        }

        resetForm();
      } catch {
        setErrorMessage("Timeout de red. Por favor reintenta.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, fullName, role, selectedAgentIds, resetForm]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-800">{errorMessage}</p>
        </div>
      )}

      <div className="grid gap-5">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-semibold tracking-wide text-slate-900">
            Email destino
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:font-normal hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50"
            placeholder="empleado@empresa.com"
          />
        </div>

        <div>
          <label htmlFor="invite-name" className="block text-sm font-semibold tracking-wide text-slate-900">
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
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:font-normal hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50"
            placeholder="John Doe"
          />
        </div>

        <div className="pt-2">
          <label className="block text-sm font-semibold tracking-wide text-slate-900 mb-3">Roles de Privilegios</label>
          <div className="grid gap-3">
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
                className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  role === option.value
                    ? "border-slate-900 bg-slate-50 ring-1 ring-inset ring-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="flex w-full items-center justify-between">
                  <p className={`text-sm font-bold uppercase tracking-wider ${role === option.value ? 'text-slate-900' : 'text-slate-700'}`}>
                    {option.label}
                  </p>
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${role === option.value ? 'border-slate-900' : 'border-slate-300'}`}>
                    {role === option.value && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {role === "operador" && (
          <div className="animate-in fade-in slide-in-from-top-2 pt-2">
            <label className="block text-sm font-semibold tracking-wide text-slate-900">
              Inventario Accesible
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Marca los agentes que recaerán sobre el perímetro de delegación de este usuario.
            </p>
            {agents.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <p className="text-xs font-medium text-slate-500">
                  Inventario en cero. Crea tu Agente primero.
                </p>
              </div>
            ) : (
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner scrollbar-thin scrollbar-track-slate-50 scrollbar-thumb-slate-200">
                {agents.map((agent) => {
                  const isChecked = selectedAgentIds.includes(agent.id);
                  return (
                    <label
                      key={agent.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        isChecked ? "border-slate-300 bg-white shadow-sm" : "border-transparent bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleAgentToggle(agent.id)}
                        disabled={isSubmitting}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 transition-colors focus:ring-slate-900 focus:ring-offset-1 disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-bold ${isChecked ? "text-slate-900" : "text-slate-700"}`}>
                          {agent.name}
                        </p>
                        <p className="text-xs uppercase tracking-wider text-slate-500">{agent.status}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
             <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
          ) : null}
          {isSubmitting ? "Tramitando Ingreso..." : "Extender Invitación"}
        </button>
      </div>
    </form>
  );
}
