import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route";
import { validateSameOriginMutationRequest } from "@/lib/utils/request-security";

export async function POST(request: Request): Promise<NextResponse> {
  const requestError = validateSameOriginMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  try {
    const { supabase, applyCookies } = await createRouteHandlerSupabaseClient();
    await supabase.auth.signOut();

    return applyCookies(NextResponse.json({ data: { success: true } }));
  } catch (error) {
    console.error("auth.logout.unhandled_error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: "No se pudo cerrar la sesion. Intenta de nuevo." },
      { status: 500 }
    );
  }
}