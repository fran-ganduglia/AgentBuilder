import type { Integration } from "@/types/app";
import type { IntegrationOperationalStatus, IntegrationOperationalView } from "@/lib/integrations/metadata";
import {
  getIntegrationOperationalView,
  getMetadataString,
} from "@/lib/integrations/metadata";
import {
  getMissingGoogleScopesForSurface,
  getRequiredGoogleScopesForSurface,
  hasAllGoogleScopesForSurface,
  type GoogleSurface,
} from "@/lib/integrations/google-scopes";

export type GoogleSurfaceOperationalView = {
  surface: GoogleSurface;
  title: string;
  summary: string;
  detail: string | null;
  status: IntegrationOperationalStatus;
  tone: IntegrationOperationalView["tone"];
  label: string;
  isConnected: boolean;
  isUsable: boolean;
  requiredScopes: string[];
  missingScopes: string[];
  grantedScopes: string[];
  accessTokenExpiresAt: string | null;
  lastAuthError: string | null;
  connectedEmail: string | null;
};

function getSurfaceTitle(surface: GoogleSurface): string {
  return surface === "gmail" ? "Gmail" : "Google Calendar";
}

export function getGoogleSurfaceOperationalView(
  integration: Integration | null | undefined,
  surface: GoogleSurface
): GoogleSurfaceOperationalView {
  const baseView = getIntegrationOperationalView(integration);
  const grantedScopes = baseView.grantedScopes;
  const requiredScopes = getRequiredGoogleScopesForSurface(surface);
  const missingScopes = getMissingGoogleScopesForSurface(grantedScopes, surface);
  const hasRequiredScopes = hasAllGoogleScopesForSurface(grantedScopes, surface);
  const connectedEmail = integration
    ? getMetadataString(integration.metadata, "connected_email")
    : null;

  if (!integration) {
    return {
      surface,
      title: getSurfaceTitle(surface),
      summary: "Sin integracion configurada",
      detail: "Todavia no hay una cuenta de Google Workspace conectada para esta organizacion.",
      status: "disconnected",
      tone: "slate",
      label: "Desconectado",
      isConnected: false,
      isUsable: false,
      requiredScopes,
      missingScopes,
      grantedScopes,
      accessTokenExpiresAt: null,
      lastAuthError: null,
      connectedEmail: null,
    };
  }

  if (baseView.status !== "connected" && baseView.status !== "expiring_soon") {
    return {
      surface,
      title: getSurfaceTitle(surface),
      summary: baseView.summary,
      detail: baseView.detail,
      status: baseView.status,
      tone: baseView.tone,
      label: baseView.label,
      isConnected: true,
      isUsable: false,
      requiredScopes,
      missingScopes,
      grantedScopes,
      accessTokenExpiresAt: baseView.accessTokenExpiresAt,
      lastAuthError: baseView.lastAuthError,
      connectedEmail,
    };
  }

  if (!hasRequiredScopes) {
    return {
      surface,
      title: getSurfaceTitle(surface),
      summary: "Faltan permisos para esta superficie",
      detail: `La integracion Google existe, pero faltan scopes para ${getSurfaceTitle(surface)}.`,
      status: "reauth_required",
      tone: "amber",
      label: "Scopes incompletos",
      isConnected: true,
      isUsable: false,
      requiredScopes,
      missingScopes,
      grantedScopes,
      accessTokenExpiresAt: baseView.accessTokenExpiresAt,
      lastAuthError: baseView.lastAuthError,
      connectedEmail,
    };
  }

  return {
    surface,
    title: getSurfaceTitle(surface),
    summary: "Superficie configurada",
    detail:
      surface === "gmail"
        ? "La conexion y los scopes de Gmail ya permiten lectura real y writes asistidas via approval inbox para borradores, labels y archivado."
        : "La conexion y los scopes de esta superficie ya quedaron preparados. La ejecucion en chat llegara en una proxima actualizacion.",
    status: baseView.status,
    tone: baseView.tone,
    label: "Configurada",
    isConnected: true,
    isUsable: true,
    requiredScopes,
    missingScopes,
    grantedScopes,
    accessTokenExpiresAt: baseView.accessTokenExpiresAt,
    lastAuthError: baseView.lastAuthError,
    connectedEmail,
  };
}
