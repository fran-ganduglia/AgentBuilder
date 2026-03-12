import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { upsertSalesforceIntegration } from "@/lib/db/salesforce-integrations";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { buildConnectedIntegrationMetadata } from "@/lib/integrations/metadata";
import { exchangeSalesforceCode } from "@/lib/integrations/salesforce";
import { encryptSecret } from "@/lib/utils/secrets";
import { env } from "@/lib/utils/env";

function buildRedirectUrl(status: string, message: string): URL {
  const url = new URL("/settings/integrations", env.APP_BASE_URL);
  url.searchParams.set("salesforce_status", status);
  url.searchParams.set("salesforce_message", message);
  return url;
}

type VerifiedSalesforceState = {
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
        providerErrorDescription?.trim() || "Salesforce rechazo la autorizacion OAuth"
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(buildRedirectUrl("error", "Salesforce no devolvio un codigo de autorizacion"));
  }

  let state: VerifiedSalesforceState;

  try {
    state = verifyOAuthState(stateValue, "salesforce");
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
    return NextResponse.redirect(buildRedirectUrl("error", "Solo admin puede conectar Salesforce"));
  }

  if (
    session.user.id !== state.userId ||
    session.organizationId !== state.organizationId
  ) {
    return NextResponse.redirect(buildRedirectUrl("error", "La respuesta OAuth no coincide con la sesion activa"));
  }

  try {
    const oauthResult = await exchangeSalesforceCode(code);
    const metadata = buildConnectedIntegrationMetadata({
      current: null,
      grantedScopes: oauthResult.grantedScopes,
      providerMetadata: {
        provider: "salesforce",
        instance_url: oauthResult.instanceUrl,
        identity_url: oauthResult.identityUrl,
        token_type: oauthResult.tokenType,
        issued_at: oauthResult.issuedAt,
      },
    });

    const integrationResult = await upsertSalesforceIntegration({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: "Salesforce CRM",
      accessTokenEncrypted: encryptSecret(oauthResult.accessToken),
      refreshTokenEncrypted: oauthResult.refreshToken ? encryptSecret(oauthResult.refreshToken) : null,
      metadata,
    });

    if (integrationResult.error || !integrationResult.data) {
      console.error("integrations.salesforce_callback_persist_error", {
        organizationId: session.organizationId,
        error: integrationResult.error ?? "unknown",
      });
      return NextResponse.redirect(buildRedirectUrl("error", "No se pudo guardar la integracion de Salesforce"));
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "integration.salesforce_connected",
      resourceType: "integration",
      resourceId: integrationResult.data.id,
      newValue: {
        granted_scopes: oauthResult.grantedScopes,
        instance_url: oauthResult.instanceUrl,
      },
    });

    return NextResponse.redirect(buildRedirectUrl("connected", "Salesforce quedo conectado para la organizacion"));
  } catch (error) {
    console.error("integrations.salesforce_callback_error", {
      organizationId: session.organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.redirect(
      buildRedirectUrl(
        "error",
        error instanceof Error ? error.message : "No se pudo completar OAuth con Salesforce"
      )
    );
  }
}