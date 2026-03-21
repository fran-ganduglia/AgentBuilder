import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { enqueueRuntimeManualRepair } from "@/lib/db/runtime-debug";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const manualRepairSchema = z.object({
  checkpointNode: z.enum([
    "normalize",
    "enrich",
    "resolve",
    "validate",
    "policy_gate",
    "simulate",
    "execute",
    "postprocess",
  ]),
  resumeReason: z
    .enum([
      "resume_after_approval",
      "resume_after_retry_delay",
      "resume_after_user_input",
      "resume_scheduled_trigger",
      "resume_post_side_effect",
    ])
    .optional(),
  reason: z
    .string()
    .trim()
    .max(500, "La razon no puede exceder 500 caracteres")
    .optional(),
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
    manualRepairSchema
  );

  if (errorResponse || !body) {
    return errorResponse!;
  }

  const { data, error } = await enqueueRuntimeManualRepair({
    organizationId: session.organizationId,
    userId: session.user.id,
    runtimeRunId,
    checkpointNode: body.checkpointNode,
    resumeReason: body.resumeReason,
    reason: body.reason,
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          error === "runtime_manual_repair_missing_workflow_target"
            ? "El run no tiene un workflow/runtime target reanudable"
            : error === "NOT_FOUND"
              ? "Runtime run no encontrado"
              : error,
      },
      {
        status:
          error === "NOT_FOUND"
            ? 404
            : error === "runtime_manual_repair_missing_workflow_target"
              ? 409
              : 500,
      }
    );
  }

  return NextResponse.json({ data });
}
