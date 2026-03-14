import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import {
  getPrimaryGoogleIntegration,
  upsertGoogleIntegration,
} from "@/lib/db/google-integrations";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import {
  buildConnectedIntegrationMetadata,
  getGoogleCalendarTimezoneMetadata,
} from "@/lib/integrations/metadata";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { encryptSecret } from "@/lib/utils/secrets";
import { env } from "@/lib/utils/env";

type VerifiedGoogleState = {
  provider: string;
  organizationId: string;
  userId: string;
  redirectPath: string;
  expiresAt: number;
};

function buildRedirectUrl(
  redirectPath: string,
  status: string,
  message: string
): URL {
  const url = new URL(redirectPath, env.APP_BASE_URL);
  url.searchParams.set("google_status", status);
  url.searchParams.set("google_message", message);
  return url;
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const stateValue = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");

  let state: VerifiedGoogleState;

  try {
    state = verifyOAuthState(stateValue, "google") as VerifiedGoogleState;
  } catch (error) {
    return NextResponse.redirect(
      buildRedirectUrl(
        "/settings/integrations",
        "error",
        error instanceof Error ? error.message : "El state de OAuth es invalido"
      )
    );
  }

  if (providerError) {
    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "error",
        requestUrl.searchParams.get("error_description")?.trim() ||
          "Google rechazo la autorizacion OAuth"
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "error",
        "Google no devolvio un codigo de autorizacion"
      )
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "error",
        "Tu sesion expiro antes de completar OAuth"
      )
    );
  }

  if (session.role !== "admin") {
    return NextResponse.redirect(
      buildRedirectUrl(state.redirectPath, "error", "Solo admin puede conectar Google")
    );
  }

  if (session.user.id !== state.userId || session.organizationId !== state.organizationId) {
    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "error",
        "La respuesta OAuth no coincide con la sesion activa"
      )
    );
  }

  try {
    const existingIntegrationResult = await getPrimaryGoogleIntegration(session.organizationId);
    const existingConfigResult =
      existingIntegrationResult.data
        ? await getGoogleIntegrationConfig(
            existingIntegrationResult.data.id,
            session.organizationId
          )
        : { data: null, error: null };
    const oauthResult = await exchangeGoogleCode(code);
    const nextTokenGeneration =
      (existingConfigResult.data?.tokenGeneration ?? 0) + 1;
    const lastRefreshedAt = new Date().toISOString();
    const existingTimezoneMetadata = getGoogleCalendarTimezoneMetadata(
      existingIntegrationResult.data?.metadata ?? null
    );
    const metadata = buildConnectedIntegrationMetadata({
      current: existingIntegrationResult.data?.metadata ?? null,
      grantedScopes: oauthResult.grantedScopes,
      accessTokenExpiresAt: oauthResult.accessTokenExpiresAt,
      providerMetadata: {
        provider: "google",
        token_type: oauthResult.tokenType,
        token_generation: nextTokenGeneration,
        last_refreshed_at: lastRefreshedAt,
        connected_email: oauthResult.connectedEmail,
        workspace_customer_id: oauthResult.workspaceCustomerId,
        google_calendar_primary_timezone:
          oauthResult.googleCalendarPrimaryTimezone ??
          existingTimezoneMetadata.primaryTimezone,
        google_calendar_user_timezone:
          oauthResult.googleCalendarUserTimezone ??
          existingTimezoneMetadata.userTimezone,
      },
    });

    const integrationResult = await upsertGoogleIntegration({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: "Google Workspace",
      accessTokenEncrypted: encryptSecret(oauthResult.accessToken),
      ...(oauthResult.refreshToken
        ? { refreshTokenEncrypted: encryptSecret(oauthResult.refreshToken) }
        : existingConfigResult.data
          ? {}
          : { refreshTokenEncrypted: null }),
      metadata,
    });

    if (integrationResult.error || !integrationResult.data) {
      return NextResponse.redirect(
        buildRedirectUrl(
          state.redirectPath,
          "error",
          "No se pudo guardar la integracion de Google"
        )
      );
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "integration.google_connected",
      resourceType: "integration",
      resourceId: integrationResult.data.id,
      newValue: {
        granted_scopes: oauthResult.grantedScopes,
        connected_email: oauthResult.connectedEmail,
        workspace_customer_id: oauthResult.workspaceCustomerId,
      },
    });

    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "connected",
        "Google Workspace quedo conectado para la organizacion"
      )
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRedirectUrl(
        state.redirectPath,
        "error",
        error instanceof Error
          ? error.message
          : "No se pudo completar OAuth con Google"
      )
    );
  }
}
