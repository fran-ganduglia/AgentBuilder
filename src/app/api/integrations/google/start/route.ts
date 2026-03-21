import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { getGoogleIntegrationConfig } from "@/lib/db/google-integration-config";
import { getPrimaryGoogleIntegration } from "@/lib/db/google-integrations";
import { buildGoogleAuthorizeUrl } from "@/lib/integrations/google";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import {
  getDesiredGoogleScopes,
  type GoogleSurface,
} from "@/lib/integrations/google-scopes";
import { env } from "@/lib/utils/env";

const startGoogleSchema = z.object({
  surface: z.enum(["gmail", "google_calendar", "google_sheets"]),
  reconnect: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", env.APP_BASE_URL));
  }

  if (session.role !== "admin") {
    return NextResponse.redirect(new URL("/unauthorized", env.APP_BASE_URL));
  }

  const requestUrl = new URL(request.url);
  const parsedQuery = startGoogleSchema.safeParse({
    surface: requestUrl.searchParams.get("surface"),
    reconnect: requestUrl.searchParams.get("reconnect") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.redirect(new URL("/settings/integrations", env.APP_BASE_URL));
  }

  const requestedSurface = parsedQuery.data.surface as GoogleSurface;
  const integrationResult = await getPrimaryGoogleIntegration(session.organizationId);
  const configResult =
    integrationResult.data
      ? await getGoogleIntegrationConfig(integrationResult.data.id, session.organizationId)
      : { data: null, error: null };

  const currentGrantedScopes = configResult.data?.grantedScopes ?? [];
  const desiredScopes = getDesiredGoogleScopes({
    currentGrantedScopes,
    requestedSurface,
  });
  const requiresScopeExpansion = desiredScopes.some(
    (scope) => !currentGrantedScopes.includes(scope)
  );
  const shouldPromptConsent =
    parsedQuery.data.reconnect ||
    requiresScopeExpansion ||
    !configResult.data?.refreshToken;

  const state = createOAuthState({
    provider: "google",
    organizationId: session.organizationId,
    userId: session.user.id,
    redirectPath: `/settings/integrations?google_surface=${requestedSurface}`,
  });

  return NextResponse.redirect(
    buildGoogleAuthorizeUrl({
      state,
      scopes: desiredScopes,
      promptConsent: shouldPromptConsent,
    })
  );
}
