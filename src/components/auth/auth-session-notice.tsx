"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthSessionNoticeProps = {
  email: string;
  intent: "login" | "register";
};

function getIntentCopy(intent: "login" | "register") {
  if (intent === "register") {
    return {
      title: "Ya hay una sesion activa en este navegador",
      description:
        "Antes de crear una cuenta nueva, confirma si quieres seguir con la sesion actual o cerrarla para evitar entrar por error a una cuenta de prueba.",
      logoutLabel: "Cerrar sesion y crear otra cuenta",
    };
  }

  return {
    title: "Ya hay una sesion activa en este navegador",
    description:
      "Para evitar accesos accidentales, el sistema no entra automaticamente. Confirma si quieres seguir con esta sesion o cerrarla para usar otra cuenta.",
    logoutLabel: "Cerrar sesion y usar otra cuenta",
  };
}

export function AuthSessionNotice({ email, intent }: AuthSessionNoticeProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = getIntentCopy(intent);

  async function handleLogout() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result: { error?: string } = await response.json();

      if (!response.ok) {
        setError(result.error ?? "No se pudo cerrar la sesion actual.");
        return;
      }

      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesion actual.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
      <p className="text-sm font-semibold text-amber-900">{copy.title}</p>
      <p className="mt-2 text-sm leading-6 text-amber-800">{copy.description}</p>
      <p className="mt-3 text-sm text-amber-900">
        Sesion detectada: <span className="font-medium">{email}</span>
      </p>

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Continuar con esta sesion
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Cerrando sesion..." : copy.logoutLabel}
        </button>
      </div>
    </div>
  );
}
