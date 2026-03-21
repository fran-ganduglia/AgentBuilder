import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  getApprovalItemById,
  resolveApprovalItem,
} from "@/lib/db/approval-items";
import { insertMessageWithServiceRole } from "@/lib/db/messages";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const resolveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  resolutionNote: z
    .string()
    .trim()
    .max(500, "La nota no puede exceder 500 caracteres")
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> }
): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) return requestError;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.role === "viewer") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { approvalId } = await params;
  if (!approvalId) {
    return NextResponse.json({ error: "approvalId requerido" }, { status: 400 });
  }

  const { data: body, errorResponse } = await parseJsonRequestBody(request, resolveSchema);
  if (errorResponse || !body) return errorResponse!;

  const { data: approvalItem, error: fetchError } = await getApprovalItemById(
    session.organizationId,
    approvalId
  );

  if (fetchError === "NOT_FOUND" || !approvalItem) {
    return NextResponse.json({ error: "Aprobacion no encontrada" }, { status: 404 });
  }
  if (fetchError) {
    return NextResponse.json({ error: "No se pudo cargar la aprobacion" }, { status: 500 });
  }

  const { data, error } = await resolveApprovalItem({
    organizationId: session.organizationId,
    approvalItemId: approvalId,
    userId: session.user.id,
    action: body.action,
    resolutionNote: body.resolutionNote,
  });

  if (error === "APPROVAL_ALREADY_RESOLVED") {
    return NextResponse.json({ error: "La aprobacion ya no esta pendiente" }, { status: 409 });
  }
  if (error) {
    return NextResponse.json({ error: "No se pudo resolver la aprobacion" }, { status: 500 });
  }

  // Guardar mensaje en la conversacion reflejando la decision
  const context = approvalItem.context as Record<string, unknown> | null;
  const conversationId = typeof context?.["conversation_id"] === "string"
    ? context["conversation_id"]
    : null;
  const agentId = approvalItem.agent_id;

  if (conversationId && agentId) {
    const summary = (approvalItem.payload_summary as Record<string, unknown> | null)?.summary;
    const actionLabel = typeof summary === "string" ? summary : `${approvalItem.provider}.${approvalItem.action}`;
    const content =
      body.action === "approve"
        ? `✓ Accion aprobada: ${actionLabel}. Ejecutando en segundo plano.`
        : `✗ Accion rechazada: ${actionLabel}${body.resolutionNote ? ` — ${body.resolutionNote}` : "."} `;

    await insertMessageWithServiceRole({
      agentId,
      conversationId,
      organizationId: session.organizationId,
      role: "assistant",
      content,
      metadata: {
        approval_resolution: {
          approvalItemId: approvalId,
          action: body.action,
          resolvedBy: session.user.id,
        },
      },
    }).catch((err) => {
      console.error("approvals.resolve.message_error", {
        approvalId,
        error: err instanceof Error ? err.message : "unknown",
      });
    });
  }

  return NextResponse.json({ data });
}
