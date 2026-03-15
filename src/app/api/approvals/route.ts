import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { enqueueEvent } from "@/lib/db/event-queue";
import {
  getApprovalItemById,
  listApprovalItems,
  resolveApprovalItem,
} from "@/lib/db/approval-items";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import { gmailEditableApprovalSchema } from "@/lib/integrations/google-agent-tools";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

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
  editedActionInput: z.record(z.unknown()).optional(),
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

  // --- Apply editedActionInput if present on approve + gmail ---
  if (body.action === "approve" && body.editedActionInput) {
    const { data: approvalItem, error: fetchError } = await getApprovalItemById(
      session.organizationId,
      body.approvalItemId
    );

    if (fetchError || !approvalItem) {
      return NextResponse.json(
        { error: fetchError === "NOT_FOUND" ? "Aprobacion no encontrada" : "No se pudo cargar la aprobacion" },
        { status: fetchError === "NOT_FOUND" ? 404 : 500 }
      );
    }

    if (approvalItem.provider !== "gmail") {
      return NextResponse.json(
        { error: "La edicion de payload solo esta soportada para Gmail" },
        { status: 400 }
      );
    }

    const parsedEdit = gmailEditableApprovalSchema.safeParse(body.editedActionInput);
    if (!parsedEdit.success) {
      return NextResponse.json(
        { error: parsedEdit.error.errors[0]?.message ?? "El payload editado no es valido" },
        { status: 400 }
      );
    }

    // Persist the edit into workflow_step.input_payload and approval_item.payload_summary
    const supabase = createServiceSupabaseClient();
    const currentPayloadSummary = (approvalItem.payload_summary as Record<string, unknown>) ?? {};
    const originalActionInput = currentPayloadSummary.action_input ?? {};

    // Update workflow_step.input_payload.action_input with merged edit
    const { data: stepRow } = await supabase
      .from("workflow_steps")
      .select("input_payload")
      .eq("id", approvalItem.workflow_step_id)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (stepRow) {
      const stepPayload = (stepRow.input_payload as Record<string, unknown>) ?? {};
      const currentActionInput = (stepPayload.action_input as Record<string, unknown>) ?? {};
      const mergedActionInput = { ...currentActionInput, ...parsedEdit.data };

      await supabase
        .from("workflow_steps")
        .update({
          input_payload: { ...stepPayload, action_input: mergedActionInput },
        })
        .eq("id", approvalItem.workflow_step_id)
        .eq("organization_id", session.organizationId);

      // Update approval_item.payload_summary preserving original
      await supabase
        .from("approval_items")
        .update({
          payload_summary: {
            ...currentPayloadSummary,
            action_input: mergedActionInput,
            original_action_input: originalActionInput,
          } as unknown as Json,
        })
        .eq("id", approvalItem.id)
        .eq("organization_id", session.organizationId);
    }
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
