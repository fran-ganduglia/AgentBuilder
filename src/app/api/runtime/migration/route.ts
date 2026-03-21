import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getRuntimeMigrationSnapshot } from "@/lib/db/runtime-migration";

const searchParamsSchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
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
    windowHours: url.searchParams.get("windowHours") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Query invalida" },
      { status: 400 }
    );
  }

  const result = await getRuntimeMigrationSnapshot({
    organizationId: session.organizationId,
    windowHours: parsed.data.windowHours,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}
