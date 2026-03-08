import { NextResponse } from "next/server";
import {
  resetPasswordRequestSchema,
  updatePasswordSchema,
  validateUpdatedPassword,
} from "@/lib/auth/credentials";
import { checkPasswordAgainstBreaches, getCompromisedPasswordMessage } from "@/lib/auth/password-breach";
import { incrementRateLimit } from "@/lib/redis";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const RATE_LIMIT_KEY_PREFIX = "rate:password_reset:";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const key = `${RATE_LIMIT_KEY_PREFIX}${ip}`;
    const current = await incrementRateLimit(key, RATE_LIMIT_WINDOW_SECONDS);
    return current <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo mas tarde." },
      { status: 429 }
    );
  }

  const parsedBody = await parseJsonRequestBody(request, resetPasswordRequestSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const supabase = createServiceSupabaseClient();

  await supabase.auth.resetPasswordForEmail(parsedBody.data.email, {
    redirectTo: `${new URL(request.url).origin}/reset-password`,
  });

  console.info("auth.reset_password.requested", { ip });

  return NextResponse.json({
    data: { message: "Si existe una cuenta con ese email, recibiras un enlace de recuperacion." },
  });
}

export async function PATCH(request: Request) {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  try {
    const parsedBody = await parseJsonRequestBody(request, updatePasswordSchema);
    if (parsedBody.errorResponse) {
      return parsedBody.errorResponse;
    }

    const passwordError = validateUpdatedPassword(parsedBody.data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const breachCheck = await checkPasswordAgainstBreaches(parsedBody.data.password);
    if (!breachCheck.ok) {
      return NextResponse.json({ error: breachCheck.message }, { status: 503 });
    }

    if (breachCheck.compromised) {
      return NextResponse.json({ error: getCompromisedPasswordMessage() }, { status: 400 });
    }

    const { supabase, applyCookies } = await createRouteHandlerSupabaseClient();

    const { error } = await supabase.auth.updateUser({
      password: parsedBody.data.password,
    });

    if (error) {
      console.error("auth.reset_password.update_failed", {
        error: error.message,
      });
      return NextResponse.json(
        { error: "No se pudo actualizar la contrasena. El enlace puede haber expirado." },
        { status: 400 }
      );
    }

    console.info("auth.reset_password.updated");

    return applyCookies(
      NextResponse.json({
        data: { message: "Contrasena actualizada exitosamente." },
      })
    );
  } catch (error) {
    console.error("auth.reset_password.unhandled_error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: "No se pudo actualizar la contrasena. Intenta de nuevo." },
      { status: 500 }
    );
  }
}