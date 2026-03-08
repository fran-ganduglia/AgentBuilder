import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { insertAuditLog } from "@/lib/db/audit";
import { incrementRateLimit } from "@/lib/redis";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";
import type { Tables } from "@/types/database";
import type { TablesInsert } from "@/types/database";

type PlanLimits = Pick<Tables<"plans">, "max_users">;
type OrganizationPlan = Pick<Tables<"organizations">, "plan_id">;
type UserInsert = TablesInsert<"users">;
type PermissionInsert = TablesInsert<"user_agent_permissions">;

const inviteRoles = ["editor", "viewer", "operador"] as const;

const inviteSchema = z
  .object({
    email: z.string().email("Debe ser un email valido"),
    fullName: z
      .string()
      .min(1, "El nombre es requerido")
      .max(200, "El nombre no puede superar 200 caracteres"),
    role: z.enum(inviteRoles, {
      errorMap: () => ({ message: "Rol invalido. Debe ser editor, viewer u operador" }),
    }),
    agentIds: z
      .array(z.string().uuid("Cada agentId debe ser un UUID valido"))
      .optional(),
  })
  .refine(
    (data) => {
      if (data.role === "operador") {
        return data.agentIds && data.agentIds.length > 0;
      }
      return true;
    },
    {
      message: "agentIds es requerido cuando el rol es operador",
      path: ["agentIds"],
    }
  );

async function checkUserLimit(
  organizationId: string,
  planId: string
): Promise<{ allowed: boolean; message?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: planData } = await supabase
    .from("plans")
    .select("max_users")
    .eq("id", planId)
    .single();

  const plan = planData as PlanLimits | null;

  if (!plan) {
    return { allowed: false, message: "No se pudo verificar el plan" };
  }

  if (plan.max_users <= 0) {
    return { allowed: true };
  }

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const currentUsers = count ?? 0;

  if (currentUsers >= plan.max_users) {
    return {
      allowed: false,
      message: `Limite de usuarios alcanzado (${plan.max_users}). Actualiza tu plan para invitar mas usuarios.`,
    };
  }

  return { allowed: true };
}

async function validateAgentsBelongToOrg(
  agentIds: string[],
  organizationId: string
): Promise<{ valid: boolean; message?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("id", agentIds);

  if (error) {
    return { valid: false, message: "No se pudieron verificar los agentes" };
  }

  const foundIds = new Set((data ?? []).map((a) => (a as { id: string }).id));
  const missing = agentIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    return { valid: false, message: "Uno o mas agentes no pertenecen a tu organizacion" };
  }

  return { valid: true };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type debe ser application/json" },
      { status: 400 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Solo los administradores pueden invitar usuarios" },
      { status: 403 }
    );
  }

  // Rate limit: 10 invitations per hour per organization
  try {
    const inviteCount = await incrementRateLimit(
      `rate_limit:invite:${session.organizationId}`,
      3600
    );
    if (inviteCount > 10) {
      return NextResponse.json(
        { error: "Demasiadas invitaciones. Intenta de nuevo en una hora." },
        { status: 429 }
      );
    }
  } catch (rateLimitError) {
    // Fail-open: if Redis is unavailable, allow the request
    console.error("invite.rate_limit_error", {
      organizationId: session.organizationId,
      error: rateLimitError instanceof Error ? rateLimitError.message : "unknown",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido en el body del request" },
      { status: 400 }
    );
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Input invalido";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { email, fullName, role, agentIds } = parsed.data;

  // Check if email already exists in the organization
  const supabase = await createServerSupabaseClient();

  const { data: existingUser } = await supabase
    .from("users")
    .select("id, deleted_at")
    .eq("email", email)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (existingUser && !existingUser.deleted_at) {
    return NextResponse.json(
      { error: "Este email ya esta registrado en tu organizacion" },
      { status: 409 }
    );
  }

  // Check plan user limit
  const { data: orgData } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", session.organizationId)
    .single();

  const org = orgData as OrganizationPlan | null;

  if (!org) {
    return NextResponse.json(
      { error: "Organizacion no encontrada" },
      { status: 500 }
    );
  }

  const limitCheck = await checkUserLimit(session.organizationId, org.plan_id);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: limitCheck.message ?? "Limite de usuarios alcanzado" },
      { status: 429 }
    );
  }

  // Validate agent ownership for operador
  if (role === "operador" && agentIds && agentIds.length > 0) {
    const agentCheck = await validateAgentsBelongToOrg(agentIds, session.organizationId);
    if (!agentCheck.valid) {
      return NextResponse.json(
        { error: agentCheck.message ?? "Agentes invalidos" },
        { status: 400 }
      );
    }
  }

  // Invite user via Supabase Auth admin API (service_role)
  const serviceClient = createServiceSupabaseClient();

  const { data: authData, error: authError } =
    await serviceClient.auth.admin.inviteUserByEmail(email);

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return NextResponse.json(
        { error: "Este email ya esta registrado en el sistema" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "No se pudo enviar la invitacion" },
      { status: 500 }
    );
  }

  if (!authData.user) {
    return NextResponse.json(
      { error: "No se pudo crear el usuario" },
      { status: 500 }
    );
  }

  // Create profile in public.users
  const userInsert: UserInsert = {
    id: authData.user.id,
    email,
    full_name: fullName,
    role,
    organization_id: session.organizationId,
    is_active: true,
  };

  const { error: profileError } = await serviceClient
    .from("users")
    .insert(userInsert);

  if (profileError) {
    // Attempt cleanup: delete the auth user since profile creation failed
    await serviceClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: "No se pudo crear el perfil del usuario" },
      { status: 500 }
    );
  }

  // Audit log (non-fatal)
  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "user.invited",
    resourceType: "user",
    resourceId: authData.user.id,
    newValue: { email, role, fullName },
  });

  // Create agent permissions for operador
  if (role === "operador" && agentIds && agentIds.length > 0) {
    const permissionInserts: PermissionInsert[] = agentIds.map((agentId) => ({
      user_id: authData.user.id,
      agent_id: agentId,
      organization_id: session.organizationId,
      granted_by: session.user.id,
      can_use: true,
      can_edit: false,
    }));

    const { error: permError } = await serviceClient
      .from("user_agent_permissions")
      .insert(permissionInserts);

    if (permError) {
      // Non-fatal: user was created but permissions failed
      // Admin can assign permissions manually later
      return NextResponse.json({
        data: {
          success: true,
          warning: "El usuario fue invitado pero no se pudieron asignar los permisos de agentes. Asignalos manualmente.",
        },
      });
    }
  }

  return NextResponse.json({ data: { success: true } });
}
