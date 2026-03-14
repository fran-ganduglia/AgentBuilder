import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { buildHubSpotAuthorizeUrl } from "@/lib/integrations/hubspot";
import { env } from "@/lib/utils/env";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", env.APP_BASE_URL));
  }

  if (session.role !== "admin") {
    return NextResponse.redirect(new URL("/unauthorized", env.APP_BASE_URL));
  }

  const state = createOAuthState({
    provider: "hubspot",
    organizationId: session.organizationId,
    userId: session.user.id,
    redirectPath: "/settings/integrations",
  });

  return NextResponse.redirect(buildHubSpotAuthorizeUrl(state));
}
