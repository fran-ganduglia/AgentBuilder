import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { listRuntimeDeadLetters } from "@/lib/db/runtime-debug";

const searchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canViewOrganizationUsage(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchParamsSchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Query invalida" },
      { status: 400 }
    );
  }

  const { data, error } = await listRuntimeDeadLetters({
    organizationId: session.organizationId,
    limit: parsed.data.limit,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ data });
}
