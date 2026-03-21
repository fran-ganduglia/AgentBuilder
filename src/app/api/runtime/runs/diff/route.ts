import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getRuntimeReplaySource } from "@/lib/db/runtime-debug";
import { buildRuntimeRunDiff } from "@/lib/runtime/debug-tools";

const searchParamsSchema = z.object({
  baselineRunId: z.string().uuid("baselineRunId debe ser un UUID valido"),
  candidateRunId: z.string().uuid("candidateRunId debe ser un UUID valido"),
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
    baselineRunId: url.searchParams.get("baselineRunId"),
    candidateRunId: url.searchParams.get("candidateRunId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Query invalida" },
      { status: 400 }
    );
  }

  const [baselineResult, candidateResult] = await Promise.all([
    getRuntimeReplaySource({
      organizationId: session.organizationId,
      runtimeRunId: parsed.data.baselineRunId,
    }),
    getRuntimeReplaySource({
      organizationId: session.organizationId,
      runtimeRunId: parsed.data.candidateRunId,
    }),
  ]);

  const error = baselineResult.error ?? candidateResult.error;
  if (error) {
    return NextResponse.json(
      { error: error === "NOT_FOUND" ? "Runtime run no encontrado" : error },
      { status: error === "NOT_FOUND" ? 404 : 500 }
    );
  }

  if (!baselineResult.data || !candidateResult.data) {
    return NextResponse.json({ error: "Runtime run no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    data: buildRuntimeRunDiff({
      baseline: baselineResult.data,
      candidate: candidateResult.data,
    }),
  });
}
