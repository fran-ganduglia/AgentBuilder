import { NextResponse } from "next/server";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getRuntimeReplaySource } from "@/lib/db/runtime-debug";
import { buildRuntimeTraceViewer } from "@/lib/runtime/debug-tools";

type RouteParams = {
  params: Promise<{
    runtimeRunId: string;
  }>;
};

export async function GET(_request: Request, context: RouteParams): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canViewOrganizationUsage(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { runtimeRunId } = await context.params;
  const { data, error } = await getRuntimeReplaySource({
    organizationId: session.organizationId,
    runtimeRunId,
  });

  if (error) {
    return NextResponse.json(
      { error: error === "NOT_FOUND" ? "Runtime run no encontrado" : error },
      { status: error === "NOT_FOUND" ? 404 : 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Runtime run no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      source: {
        runtimeRunId: data.runtimeRunId,
        status: data.status,
        checkpointNode: data.checkpointNode ?? null,
        currentActionIndex: data.currentActionIndex,
      },
      traceViewer: buildRuntimeTraceViewer(data.trace),
      sideEffects: data.trace.sideEffects,
    },
  });
}
