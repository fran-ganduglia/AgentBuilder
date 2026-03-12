"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  EMAIL_MAX_LENGTH,
  loginRequestSchema,
  normalizeEmail,
} from "@/lib/auth/credentials";

type FormFields = {
  email: string;
  password: string;
  authorizeLogin: boolean;
};

const initialFields: FormFields = {
  email: "",
  password: "",
  authorizeLogin: false,
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";

  const [fields, setFields] = useState<FormFields>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(field: keyof FormFields, value: string | boolean) {
    setFields((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleEmailBlur() {
    setFields((prev) => ({ ...prev, email: normalizeEmail(prev.email) }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = loginRequestSchema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa los datos ingresados.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const result: { data?: { success: boolean }; error?: string } = await response.json();

      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo iniciar sesion.");
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("No se pudo iniciar sesion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      {registered ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          Cuenta creada con exito. Inicia sesion para continuar.
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={EMAIL_MAX_LENGTH}
          value={fields.email}
          onBlur={handleEmailBlur}
          onChange={(e) => handleChange("email", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="juan@empresa.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Contrasena
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={fields.password}
          onChange={(e) => handleChange("password", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Tu contrasena"
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={fields.authorizeLogin}
          onChange={(e) => handleChange("authorizeLogin", e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>Confirmo que quiero iniciar sesion con estas credenciales en este dispositivo.</span>
      </label>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Iniciando sesion..." : "Iniciar sesion"}
      </button>

      <div className="space-y-2 text-center text-sm text-gray-600">
        <p>
          No tenes cuenta?{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            Crear cuenta
          </Link>
        </p>
        <p>
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Olvide mi contrasena
          </Link>
        </p>
      </div>
    </form>
  );
}
