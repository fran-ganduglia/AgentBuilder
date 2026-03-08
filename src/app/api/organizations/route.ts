import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/db/audit";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const updateOrgSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255, "Nombre demasiado largo"),
});

export async function PATCH(request: Request) {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden modificar la organizacion" }, { status: 403 });
  }

  const parsedBody = await parseJsonRequestBody(request, updateOrgSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const supabase = await createServerSupabaseClient();

  // Get current name for audit log
  const { data: current } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", session.organizationId)
    .single();

  const { data, error } = await supabase
    .from("organizations")
    .update({ name: parsedBody.data.name })
    .eq("id", session.organizationId)
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar la organizacion" }, { status: 500 });
  }

  await insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: session.organizationId,
    oldValue: current ? { name: (current as { name: string }).name } : null,
    newValue: { name: parsedBody.data.name },
  });

  return NextResponse.json({ data });
}
