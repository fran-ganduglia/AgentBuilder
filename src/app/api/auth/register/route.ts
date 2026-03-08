import { NextResponse } from "next/server";
import { registerRequestSchema, type RegisterRequest } from "@/lib/auth/credentials";
import { checkPasswordAgainstBreaches, getCompromisedPasswordMessage } from "@/lib/auth/password-breach";
import { incrementRateLimit } from "@/lib/redis";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

type TrialPlan = {
  id: string;
};

type OrganizationInsertResult = {
  id: string;
};

function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return baseSlug || "organizacion";
}

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
      `rate_limit:auth_register:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS
    );

    return currentCount > RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("auth.register.rate_limit_error", {
      ip,
      error: error instanceof Error ? error.message : "unknown",
    });

    return false;
  }
}

async function createOrganizationWithUniqueSlug(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  organizationName: string,
  planId: string,
  trialEndsAt: string
): Promise<{ data: OrganizationInsertResult | null; error: string | null }> {
  const baseSlug = generateSlug(organizationName);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug,
        plan_id: planId,
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();

    if (!error && data) {
      return { data: data as OrganizationInsertResult, error: null };
    }

    if (error && error.code !== "23505") {
      return { data: null, error: error.message };
    }
  }

  return {
    data: null,
    error: "No se pudo generar un slug unico para la organizacion.",
  };
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsedBody = await parseJsonRequestBody(request, registerRequestSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const input: RegisterRequest = parsedBody.data;
  const breachCheck = await checkPasswordAgainstBreaches(input.password);
  if (!breachCheck.ok) {
    return NextResponse.json({ error: breachCheck.message }, { status: 503 });
  }

  if (breachCheck.compromised) {
    return NextResponse.json({ error: getCompromisedPasswordMessage() }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const { data: trialPlanData, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("name", "trial")
    .single();

  const trialPlan = trialPlanData as TrialPlan | null;

  if (planError || !trialPlan) {
    return NextResponse.json(
      { error: "No se pudo obtener el plan trial. Contacta soporte." },
      { status: 500 }
    );
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const message =
      authError?.message === "A user with this email address has already been registered"
        ? "Ya existe una cuenta con este email"
        : "No se pudo crear la cuenta. Intenta de nuevo.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userId = authData.user.id;
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: organization, error: organizationError } = await createOrganizationWithUniqueSlug(
    supabase,
    input.organizationName,
    trialPlan.id,
    trialEndsAt
  );

  if (organizationError || !organization) {
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: "No se pudo crear la organizacion. Intenta de nuevo." },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: userId,
    email: input.email,
    full_name: input.fullName,
    organization_id: organization.id,
    role: "admin",
  });

  if (profileError) {
    await supabase.from("organizations").delete().eq("id", organization.id);
    await supabase.auth.admin.deleteUser(userId);

    return NextResponse.json(
      { error: "No se pudo crear el perfil. Intenta de nuevo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { success: true } }, { status: 201 });
}