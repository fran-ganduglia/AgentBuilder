"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  WHATSAPP_CONNECTION_FIELD_HELP,
  type WhatsAppConnectionFieldKey,
  type WhatsAppConnectionView,
} from "@/lib/agents/whatsapp-connection";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import { IntegrationStatusBadge } from "@/components/settings/integration-status-badge";
import { IntegrationRevokeButton } from "@/components/settings/integration-revoke-actions";

type WhatsAppConnectionFormContext = "settings" | "wizard";

type WhatsAppConnectionFormProps = WhatsAppConnectionView & {
  context?: WhatsAppConnectionFormContext;
  canSubmit?: boolean;
  showTutorialLinks?: boolean;
  integrationId?: string | null;
  operationalView?: IntegrationOperationalView;
};

const FORM_COPY: Record<
  WhatsAppConnectionFormContext,
  {
    title: string;
    description: string;
    connectedCta: string;
    idleCta: string;
    secondaryNote: string | null;
    padding: string;
  }
> = {
  settings: {
    title: "WhatsApp Cloud API",
    description: "Conecta la WABA y deja QA listo para observar conversaciones reales en modo solo lectura.",
    connectedCta: "Actualizar conexion WhatsApp",
    idleCta: "Conectar WhatsApp",
    secondaryNote: null,
    padding: "px-7 py-5",
  },
  wizard: {
    title: "Conexion real de WhatsApp",
    description:
      "Valida la WABA desde el wizard con la misma API real de integraciones. El draft del agente sigue siendo independiente de esta conexion.",
    connectedCta: "Actualizar conexion en wizard",
    idleCta: "Conectar WhatsApp desde wizard",
    secondaryNote:
      "Si ahora falla la validacion o todavia no tienes todo listo, igual puedes seguir eligiendo template y preparar el borrador.",
    padding: "px-6 py-5",
  },
};

function getStatusContainerClass(view: IntegrationOperationalView | null): string {
  if (!view) {
    return "border-slate-200 bg-slate-50";
  }

  if (view.tone === "rose") {
    return "border-rose-200 bg-rose-50";
  }

  if (view.tone === "amber") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-slate-50";
}

export function WhatsAppConnectionForm({
  initialName,
  initialWabaId,
  isConnected,
  accessTokenHint,
  context = "settings",
  canSubmit = true,
  showTutorialLinks = false,
  integrationId = null,
  operationalView,
}: WhatsAppConnectionFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [wabaId, setWabaId] = useState(initialWabaId);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const copy = FORM_COPY[context];
  const isReadOnly = !canSubmit;

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    setWabaId(initialWabaId);
  }, [initialWabaId]);

  async function submitConnection() {
    if (isReadOnly) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          wabaId: wabaId.trim(),
          accessToken: accessToken.trim(),
          appSecret: appSecret.trim(),
          verifyToken: verifyToken.trim(),
        }),
      });

      const result = (await response.json()) as {
        data?: { sourcesCount?: number };
        error?: string;
      };

      if (!response.ok || result.error) {
        setError(result.error ?? "No se pudo conectar WhatsApp Cloud API");
        return;
      }

      setAccessToken("");
      setAppSecret("");
      setVerifyToken("");
      setSuccess(
        result.data?.sourcesCount !== undefined
          ? `Conexion validada. Se detectaron ${result.data.sourcesCount} fuentes disponibles para vincular desde QA.`
          : "Conexion validada correctamente."
      );
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Reintenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleWizardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (context !== "wizard" || event.key !== "Enter") {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.tagName === "BUTTON" || target?.tagName === "A") {
      return;
    }

    event.preventDefault();
    if (!isSubmitDisabled) {
      void submitConnection();
    }
  }

  const isSubmitDisabled =
    isReadOnly ||
    isSubmitting ||
    accessToken.trim().length === 0 ||
    appSecret.trim().length === 0 ||
    verifyToken.trim().length === 0 ||
    wabaId.trim().length === 0;

  const content = (
    <>
      <div className={`flex flex-col gap-2 border-b border-slate-100 bg-slate-50 sm:flex-row sm:items-center sm:justify-between ${copy.padding}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/20">
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{copy.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{copy.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {operationalView ? (
            <IntegrationStatusBadge view={operationalView} />
          ) : isConnected ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
              Conexion activa {accessTokenHint ? `(${accessTokenHint})` : ""}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-500/10">
              Desconectado
            </span>
          )}
        </div>
      </div>

      <div className={`space-y-6 ${context === "wizard" ? "p-6" : "p-7"}`}>
        {operationalView ? (
          <div className={`rounded-lg border p-4 ${getStatusContainerClass(operationalView)}`}>
            <p className="text-sm font-semibold text-slate-900">{operationalView.summary}</p>
            {operationalView.detail ? <p className="mt-1 text-sm text-slate-600">{operationalView.detail}</p> : null}
            {operationalView.lastAuthError ? <p className="mt-2 text-xs font-medium text-rose-700">Ultimo error: {operationalView.lastAuthError}</p> : null}
          </div>
        ) : null}

        {isReadOnly ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              Solo un admin puede validar y guardar credenciales reales de WhatsApp. Puedes revisar esta seccion y seguir preparando el template del agente.
            </p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800" role="status">
              {success}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800" role="alert">
              {error}
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor={`whatsapp-name-${context}`} className="block text-sm font-semibold tracking-wide text-slate-900">
              Nombre de la conexion
            </label>
            <input
              id={`whatsapp-name-${context}`}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              disabled={isReadOnly || isSubmitting}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor={`whatsapp-waba-id-${context}`} className="block text-sm font-semibold tracking-wide text-slate-900">
              WABA ID
            </label>
            <input
              id={`whatsapp-waba-id-${context}`}
              type="text"
              value={wabaId}
              onChange={(event) => setWabaId(event.target.value)}
              placeholder="1234567890"
              disabled={isReadOnly || isSubmitting}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <FieldHelp fieldKey="wabaId" visible={showTutorialLinks} />
          </div>

          <div>
            <label htmlFor={`whatsapp-access-token-${context}`} className="block text-sm font-semibold tracking-wide text-slate-900">
              Access token
            </label>
            <input
              id={`whatsapp-access-token-${context}`}
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="EAAG..."
              disabled={isReadOnly || isSubmitting}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <FieldHelp fieldKey="accessToken" visible={showTutorialLinks} />
          </div>

          <div>
            <label htmlFor={`whatsapp-app-secret-${context}`} className="block text-sm font-semibold tracking-wide text-slate-900">
              App secret
            </label>
            <input
              id={`whatsapp-app-secret-${context}`}
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              disabled={isReadOnly || isSubmitting}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <FieldHelp fieldKey="appSecret" visible={showTutorialLinks} />
          </div>
        </div>

        <div>
          <label htmlFor={`whatsapp-verify-token-${context}`} className="block text-sm font-semibold tracking-wide text-slate-900">
            Verify token del webhook
          </label>
          <input
            id={`whatsapp-verify-token-${context}`}
            type="password"
            value={verifyToken}
            onChange={(event) => setVerifyToken(event.target.value)}
            placeholder="Token que tambien configuraras en Meta"
            disabled={isReadOnly || isSubmitting}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-white focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          />
          <FieldHelp fieldKey="verifyToken" visible={showTutorialLinks} />
        </div>
      </div>

      <div className={`flex flex-col gap-4 border-t border-slate-100 bg-slate-50 sm:flex-row sm:items-center sm:justify-between ${context === "wizard" ? "px-6 py-4" : "px-7 py-4"}`}>
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Access token, app secret y verify token quedan cifrados en backend usando integration_secrets.
          </p>
          {copy.secondaryNote ? <p className="text-xs text-slate-500">{copy.secondaryNote}</p> : null}
          {context === "settings" ? (
            <IntegrationRevokeButton integrationId={integrationId ?? null} integrationName={initialName} disabled={isSubmitting} />
          ) : null}
        </div>
        <button
          type={context === "settings" ? "submit" : "button"}
          onClick={context === "wizard" ? () => void submitConnection() : undefined}
          disabled={isSubmitDisabled}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSubmitting
            ? "Validando handshake..."
            : isReadOnly
              ? "Requiere admin"
              : isConnected
                ? copy.connectedCta
                : copy.idleCta}
        </button>
      </div>
    </>
  );

  if (context === "settings") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitConnection();
        }}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {content}
      </form>
    );
  }

  return (
    <div
      role="group"
      onKeyDown={handleWizardKeyDown}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {content}
    </div>
  );
}

function FieldHelp({
  fieldKey,
  visible,
}: {
  fieldKey: WhatsAppConnectionFieldKey;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  const help = WHATSAPP_CONNECTION_FIELD_HELP[fieldKey];

  return (
    <p className="mt-2 text-xs leading-relaxed text-slate-500">
      {help.description}{" "}
      {help.link ? (
        <a
          href={help.link.href}
          target={help.link.external ? "_blank" : undefined}
          rel={help.link.external ? "noreferrer" : undefined}
          className="font-semibold text-emerald-700 underline decoration-emerald-200 underline-offset-2"
        >
          {help.link.label}
        </a>
      ) : null}
    </p>
  );
}
