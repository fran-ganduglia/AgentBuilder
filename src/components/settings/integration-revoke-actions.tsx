"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IntegrationRevokeButtonProps = {
  integrationId: string | null;
  integrationName: string;
  disabled?: boolean;
};

type RevokeAllIntegrationsButtonProps = {
  disabled?: boolean;
};

async function postRevocation(url: string, reason: string): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });

  const result = (await response.json()) as { error?: string };
  if (!response.ok || result.error) {
    return result.error ?? "No se pudo completar la revocacion";
  }

  return null;
}

function requestReason(defaultValue: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const reason = window.prompt("Motivo de revocacion", defaultValue);
  if (!reason) {
    return null;
  }

  const trimmed = reason.trim();
  return trimmed.length >= 8 ? trimmed : null;
}

export function IntegrationRevokeButton({
  integrationId,
  integrationName,
  disabled = false,
}: IntegrationRevokeButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!integrationId) {
    return null;
  }

  async function handleClick() {
    const reason = requestReason(`Revocacion manual desde Settings para ${integrationName}`);
    if (!reason) {
      setError("Debes indicar un motivo de al menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const requestError = await postRevocation(`/api/integrations/${integrationId}/revoke`, reason);
      if (requestError) {
        setError(requestError);
        return;
      }

      setMessage("Integracion revocada correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isSubmitting}
        className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Revocando..." : "Revocar integracion"}
      </button>
      {message ? <p className="text-xs font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

export function RevokeAllIntegrationsButton({
  disabled = false,
}: RevokeAllIntegrationsButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const reason = requestReason("Revocacion masiva preventiva desde Settings");
    if (!reason) {
      setError("Debes indicar un motivo de al menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const requestError = await postRevocation("/api/integrations/revoke-all", reason);
      if (requestError) {
        setError(requestError);
        return;
      }

      setMessage("Se revocaron las integraciones activas de la organizacion.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isSubmitting}
        className="inline-flex items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Revocando todo..." : "Revocar todas las integraciones"}
      </button>
      {message ? <p className="text-xs font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
