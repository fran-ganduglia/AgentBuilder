"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  EMAIL_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  PERSON_NAME_MAX_LENGTH,
  normalizeEmail,
  registerFormSchema,
  sanitizeTextInput,
} from "@/lib/auth/credentials";

type FormFields = {
  organizationName: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const initialFields: FormFields = {
  organizationName: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm() {
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(field: keyof FormFields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleBlur(field: "organizationName" | "fullName" | "email") {
    setFields((prev) => {
      if (field === "email") {
        return { ...prev, email: normalizeEmail(prev.email) };
      }

      return { ...prev, [field]: sanitizeTextInput(prev[field]) };
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = registerFormSchema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa los datos ingresados.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: parsed.data.organizationName,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          password: parsed.data.password,
        }),
      });

      const result: { data?: { success: boolean }; error?: string } = await response.json();

      if (!response.ok || result.error) {
        setError(result.error ?? "Error al crear la cuenta");
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div>
        <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
          Nombre de la organizacion
        </label>
        <input
          id="organizationName"
          type="text"
          required
          autoComplete="organization"
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          value={fields.organizationName}
          onBlur={() => handleBlur("organizationName")}
          onChange={(e) => handleChange("organizationName", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Mi Empresa S.A."
        />
      </div>

      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
          Nombre completo
        </label>
        <input
          id="fullName"
          type="text"
          required
          autoComplete="name"
          maxLength={PERSON_NAME_MAX_LENGTH}
          value={fields.fullName}
          onBlur={() => handleBlur("fullName")}
          onChange={(e) => handleChange("fullName", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Juan Perez"
        />
      </div>

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
          onBlur={() => handleBlur("email")}
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
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={fields.password}
          onChange={(e) => handleChange("password", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={`Minimo ${PASSWORD_MIN_LENGTH} caracteres`}
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
          value={fields.confirmPassword}
          onChange={(e) => handleChange("confirmPassword", e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Repite tu contrasena"
        />
      </div>

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
        {loading ? "Creando cuenta..." : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-gray-600">
        Ya tenes cuenta?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Inicia sesion
        </Link>
      </p>
    </form>
  );
}
