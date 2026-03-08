"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  updatePasswordSchema,
  validateUpdatedPassword,
} from "@/lib/auth/credentials";

function clearRecoveryParams(): void {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState({}, document.title, url.toString());
}

async function initializeRecoverySession(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient();
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return "No se pudo validar el enlace de recuperacion. Solicita uno nuevo.";
    }

    clearRecoveryParams();
    return null;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return "No se pudo validar el enlace de recuperacion. Solicita uno nuevo.";
    }

    clearRecoveryParams();
    return null;
  }

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (error) {
      return "No se pudo validar el enlace de recuperacion. Solicita uno nuevo.";
    }

    clearRecoveryParams();
    return null;
  }

  return "El enlace de recuperacion es invalido o ya expiro.";
}

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function setupRecovery() {
      const setupError = await initializeRecoverySession();

      if (!isMounted) {
        return;
      }

      if (setupError) {
        setError(setupError);
        setIsRecoveryReady(false);
        setIsInitializing(false);
        return;
      }

      setIsRecoveryReady(true);
      setIsInitializing(false);
    }

    void setupRecovery();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isRecoveryReady) {
      setError("El enlace de recuperacion no es valido. Solicita uno nuevo.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    const parsed = updatePasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa la nueva contrasena.");
      return;
    }

    const passwordError = validateUpdatedPassword(parsed.data.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? "Error al actualizar la contrasena");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-sm font-medium text-green-800">
          Tu contrasena ha sido actualizada exitosamente.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Ir al login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Nueva contrasena
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500">{PASSWORD_POLICY_HINT}</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirmar contrasena
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting || isInitializing || !isRecoveryReady}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isInitializing
          ? "Validando enlace..."
          : isSubmitting
            ? "Actualizando..."
            : "Actualizar contrasena"}
      </button>
    </form>
  );
}
