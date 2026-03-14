import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { upsertHubSpotIntegration } from "@/lib/db/hubspot-integrations";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { buildConnectedIntegrationMetadata } from "@/lib/integrations/metadata";
import { exchangeHubSpotCode } from "@/lib/integrations/hubspot";
import { encryptSecret } from "@/lib/utils/secrets";
import { env } from "@/lib/utils/env";

function buildRedirectUrl(status: string, message: string): URL {
  const url = new URL("/settings/integrations", env.APP_BASE_URL);
  url.searchParams.set("hubspot_status", status);
  url.searchParams.set("hubspot_message", message);
  return url;
}

type VerifiedHubSpotState = {
  provider: string;
  organizationId: string;
  userId: string;
  redirectPath: string;
  expiresAt: number;
};

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const stateValue = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (providerError) {
    return NextResponse.redirect(
      buildRedirectUrl(
        "error",
        providerErrorDescription?.trim() || "HubSpot rechazo la autorizacion OAuth"
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(buildRedirectUrl("error", "HubSpot no devolvio un codigo de autorizacion"));
  }

  let state: VerifiedHubSpotState;

  try {
    state = verifyOAuthState(stateValue, "hubspot");
  } catch (error) {
    return NextResponse.redirect(
      buildRedirectUrl(
        "error",
        error instanceof Error ? error.message : "El state de OAuth es invalido"
      )
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(buildRedirectUrl("error", "Tu sesion expiro antes de completar OAuth"));
  }

  if (session.role !== "admin") {
    return NextResponse.redirect(buildRedirectUrl("error", "Solo admin puede conectar HubSpot"));
  }

  if (session.user.id !== state.userId || session.organizationId !== state.organizationId) {
    return NextResponse.redirect(buildRedirectUrl("error", "La respuesta OAuth no coincide con la sesion activa"));
  }

  try {
    const oauthResult = await exchangeHubSpotCode(code);
    const metadata = buildConnectedIntegrationMetadata({
      current: null,
      grantedScopes: oauthResult.grantedScopes,
      accessTokenExpiresAt: oauthResult.accessTokenExpiresAt,
      providerMetadata: {
        provider: "hubspot",
        hub_id: oauthResult.hubId,
        token_type: oauthResult.tokenType,
        token_generation: 1,
        last_refreshed_at: new Date().toISOString(),
      },
    });

    const integrationResult = await upsertHubSpotIntegration({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: "HubSpot CRM",
      accessTokenEncrypted: encryptSecret(oauthResult.accessToken),
      refreshTokenEncrypted: oauthResult.refreshToken ? encryptSecret(oauthResult.refreshToken) : null,
      metadata,
    });

    if (integrationResult.error || !integrationResult.data) {
      return NextResponse.redirect(buildRedirectUrl("error", "No se pudo guardar la integracion de HubSpot"));
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "integration.hubspot_connected",
      resourceType: "integration",
      resourceId: integrationResult.data.id,
      newValue: {
        granted_scopes: oauthResult.grantedScopes,
        hub_id: oauthResult.hubId,
      },
    });

    return NextResponse.redirect(buildRedirectUrl("connected", "HubSpot quedo conectado para la organizacion"));
  } catch (error) {
    return NextResponse.redirect(
      buildRedirectUrl(
        "error",
        error instanceof Error ? error.message : "No se pudo completar OAuth con HubSpot"
      )
    );
  }
}
