import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getRuntimeReplaySource } from "@/lib/db/runtime-debug";
import {
  readCheckpointFromRuntimeEvents,
  replayRuntimeRun,
} from "@/lib/runtime/debug-tools";
import { createRuntimeNodeRegistryV1 } from "@/lib/runtime/node-registry";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const replayRequestSchema = z.object({
  mode: z.enum(["runtime_replay", "dry_run"]).default("runtime_replay"),
  reason: z
    .string()
    .trim()
    .max(500, "La razon no puede exceder 500 caracteres")
    .optional(),
  useStoredCheckpoint: z.boolean().optional(),
});

type RouteParams = {
  params: Promise<{
    runtimeRunId: string;
  }>;
};

export async function POST(request: Request, context: RouteParams): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);

  if (requestError) {
    return requestError;
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canViewOrganizationUsage(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { runtimeRunId } = await context.params;
  const { data: body, errorResponse } = await parseJsonRequestBody(
    request,
    replayRequestSchema
  );

  if (errorResponse || !body) {
    return errorResponse!;
  }

  const sourceResult = await getRuntimeReplaySource({
    organizationId: session.organizationId,
    runtimeRunId,
  });

  if (sourceResult.error) {
    return NextResponse.json(
      { error: sourceResult.error === "NOT_FOUND" ? "Runtime run no encontrado" : sourceResult.error },
      { status: sourceResult.error === "NOT_FOUND" ? 404 : 500 }
    );
  }

  if (!sourceResult.data) {
    return NextResponse.json({ error: "Runtime run no encontrado" }, { status: 404 });
  }

  if (!sourceResult.data.actionPlan) {
    return NextResponse.json(
      { error: "El runtime run no tiene action_plan valido para replay" },
      { status: 409 }
    );
  }

  const replay = await replayRuntimeRun({
    source: sourceResult.data,
    request: {
      runtimeRunId,
      mode: body.mode ?? "runtime_replay",
      reason: body.reason,
      resumeFromCheckpoint: body.useStoredCheckpoint
        ? readCheckpointFromRuntimeEvents(sourceResult.data.trace.events)
        : null,
    },
    nodes: createRuntimeNodeRegistryV1(),
    allowLlmRepair: () => false,
  });

  return NextResponse.json({ data: replay });
}
