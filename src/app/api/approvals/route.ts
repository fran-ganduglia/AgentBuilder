import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { enqueueEvent } from "@/lib/db/event-queue";
import {
  listApprovalItems,
  resolveApprovalItem,
} from "@/lib/db/approval-items";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const searchParamsSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const resolveApprovalSchema = z.object({
  action: z.enum(["approve", "reject"]),
  approvalItemId: z.string().uuid("approvalItemId debe ser un UUID valido"),
  resolutionNote: z
    .string()
    .trim()
    .max(500, "La nota no puede exceder 500 caracteres")
    .optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role === "viewer") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchParamsSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Query invalida" },
      { status: 400 }
    );
  }

  const { data, error } = await listApprovalItems(session.organizationId, parsed.data);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron cargar las aprobaciones" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);

  if (requestError) {
    return requestError;
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role === "viewer") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: body, errorResponse } = await parseJsonRequestBody(
    request,
    resolveApprovalSchema
  );

  if (errorResponse || !body) {
    return errorResponse!;
  }

  const { data, error } = await resolveApprovalItem({
    organizationId: session.organizationId,
    approvalItemId: body.approvalItemId,
    userId: session.user.id,
    action: body.action,
    resolutionNote: body.resolutionNote,
  });

  if (error === "NOT_FOUND") {
    return NextResponse.json(
      { error: "Aprobacion no encontrada" },
      { status: 404 }
    );
  }

  if (error === "APPROVAL_ALREADY_RESOLVED") {
    return NextResponse.json(
      { error: "La aprobacion ya no esta pendiente" },
      { status: 409 }
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo resolver la aprobacion" },
      { status: 500 }
    );
  }

  if (body.action === "approve" && data) {
    await enqueueEvent({
      organizationId: session.organizationId,
      eventType: "workflow.step.execute",
      entityType: "workflow_step",
      entityId: data.workflow_step_id,
      payload: {
        workflowRunId: data.workflow_run_id,
        workflowStepId: data.workflow_step_id,
        approvalItemId: data.id,
      },
      idempotencyKey: `workflow.step.execute:${data.workflow_step_id}`,
      correlationId: data.workflow_run_id,
      traceId: data.id,
      maxAttempts: 3,
    });
  }

  return NextResponse.json({ data });
}
