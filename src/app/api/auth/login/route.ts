import { NextResponse } from "next/server";
import { incrementRateLimit } from "@/lib/redis";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route";
import { loginRequestSchema, type LoginRequest } from "@/lib/auth/credentials";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const RATE_LIMIT_KEY_PREFIX = "rate_limit:auth_login:";
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return realIp?.trim() || "unknown";
}

async function isRateLimited(ip: string): Promise<boolean> {
  try {
    const currentCount = await incrementRateLimit(
      `${RATE_LIMIT_KEY_PREFIX}${ip}`,
      RATE_LIMIT_WINDOW_SECONDS
    );

    return currentCount > RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("auth.login.rate_limit_error", {
      ip,
      error: error instanceof Error ? error.message : "unknown",
    });

    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const requestError = validateJsonMutationRequest(request);
    if (requestError) {
      return requestError;
    }

    const clientIp = getClientIp(request);
    if (await isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta nuevamente mas tarde." },
        { status: 429 }
      );
    }

    const parsedBody = await parseJsonRequestBody(request, loginRequestSchema);
    if (parsedBody.errorResponse) {
      return parsedBody.errorResponse;
    }

    const input: LoginRequest = parsedBody.data;
    const { supabase, applyCookies } = await createRouteHandlerSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (authError || !authData.user) {
      console.warn("auth.login.failed", {
        ip: clientIp,
        error: authError?.message ?? "invalid_credentials",
      });
      return NextResponse.json(
        { error: "Credenciales invalidas o acceso no autorizado." },
        { status: 401 }
      );
    }

    console.info("auth.login.succeeded", {
      ip: clientIp,
      userId: authData.user.id,
    });

    return applyCookies(NextResponse.json({ data: { success: true } }));
  } catch (error) {
    console.error("auth.login.unhandled_error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: "No se pudo iniciar sesion. Intenta de nuevo." },
      { status: 500 }
    );
  }
}