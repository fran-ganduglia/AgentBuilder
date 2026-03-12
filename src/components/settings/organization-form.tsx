"use client";

import { useState } from "react";
import { useToast } from "@/lib/hooks/use-toast";

type OrganizationFormProps = {
  initialName: string;
};

export function OrganizationForm({ initialName }: OrganizationFormProps) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? "Error al actualizar la organización");
        return;
      }

      toast("Organización actualizada", "success");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div>
        <label htmlFor="orgName" className="block text-sm font-semibold tracking-wide text-slate-900">
          Nombre público
        </label>
        <input
          id="orgName"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 p-4 border border-rose-200">
          <p className="text-sm font-medium text-rose-800" role="alert">
            {error}
          </p>
        </div>
      )}

      <div className="mt-6 flex shrink-0 items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || name === initialName}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSubmitting ? (
             <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
          ) : null}
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
