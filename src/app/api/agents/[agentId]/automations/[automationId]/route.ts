import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildAutomationPrompt,
  classifyAutomationScope,
  readAutomationInstructionFields,
  shouldBlockAutomationForScope,
} from "@/lib/agents/automation-contract";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { assertAgentAccess, canEditAgents } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  getAutomationById,
  softDeleteAutomation,
  updateAutomation,
} from "@/lib/db/agent-automations";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const updateAutomationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  isEnabled: z.boolean().optional(),
  triggerType: z.enum(["schedule", "webhook", "event"]).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  trigger: z.object({
    type: z.enum(["schedule", "webhook", "event"]),
    config: z.record(z.string(), z.unknown()),
  }).optional(),
  actionType: z.enum(["agent_message", "integration_call", "workflow"]).optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  conditionConfig: z.record(z.string(), z.unknown()).optional(),
  instruction: z.string().max(2000, "Maximo 2000 caracteres").optional(),
  expectedOutput: z.string().max(1000, "Maximo 1000 caracteres").optional(),
  deliveryTarget: z.string().max(500, "Maximo 500 caracteres").optional(),
  approvalMode: z.enum(["writes_require_approval"]).optional(),
}).refine(
  (value) => Object.values(value).some((v) => v !== undefined),
  { message: "Debes enviar al menos un campo para actualizar" }
);

type RouteParams = { params: Promise<{ agentId: string; automationId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Solicitud no permitida" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canEditAgents(session.role)) {
    return NextResponse.json({ error: "Sin permisos para editar automatizaciones" }, { status: 403 });
  }

  const { agentId, automationId } = await params;
  const access = await assertAgentAccess({ session, agentId, capability: "read" });
  if (!access.ok) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }
  const setupState = readAgentSetupState(access.agent);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Input inválido" },
      { status: 400 }
    );
  }

  const existingAutomation = await getAutomationById(automationId, session.organizationId);
  if (existingAutomation.error) {
    return NextResponse.json({ error: existingAutomation.error }, { status: 500 });
  }

  if (!existingAutomation.data || existingAutomation.data.agent_id !== agentId) {
    return NextResponse.json({ error: "Automatizacion no encontrada" }, { status: 404 });
  }

  const existingActionFields = readAutomationInstructionFields(
    existingAutomation.data.action_config
  );
  const nextActionFields = {
    instruction: parsed.data.instruction ?? existingActionFields.instruction,
    expectedOutput: parsed.data.expectedOutput ?? existingActionFields.expectedOutput,
    deliveryTarget: parsed.data.deliveryTarget ?? existingActionFields.deliveryTarget,
    approvalMode: parsed.data.approvalMode ?? existingActionFields.approvalMode,
  };

  if (
    (parsed.data.instruction !== undefined ||
      parsed.data.expectedOutput !== undefined ||
      parsed.data.deliveryTarget !== undefined ||
      parsed.data.approvalMode !== undefined) &&
    !nextActionFields.instruction.trim()
  ) {
    return NextResponse.json(
      { error: "La instruccion es requerida." },
      { status: 400 }
    );
  }

  if (setupState && nextActionFields.instruction.trim()) {
    const scopeDecision = classifyAutomationScope({
      agentScope: setupState.agentScope,
      name: parsed.data.name ?? existingAutomation.data.name,
      description:
        parsed.data.description === undefined
          ? existingAutomation.data.description
          : parsed.data.description,
      instruction: nextActionFields.instruction,
      expectedOutput: nextActionFields.expectedOutput,
      deliveryTarget: nextActionFields.deliveryTarget,
    });
    const scopeBlock = shouldBlockAutomationForScope(scopeDecision);

    if (scopeBlock.blocked) {
      return NextResponse.json(
        { error: scopeBlock.message },
        { status: 422 }
      );
    }
  }

  const hasNewContractPatch =
    parsed.data.instruction !== undefined ||
    parsed.data.expectedOutput !== undefined ||
    parsed.data.deliveryTarget !== undefined ||
    parsed.data.approvalMode !== undefined;

  const baseActionConfig =
    parsed.data.actionConfig ?? existingAutomation.data.action_config;

  const result = await updateAutomation(automationId, session.organizationId, {
    name: parsed.data.name,
    description: parsed.data.description,
    isEnabled: parsed.data.isEnabled,
    triggerType: parsed.data.trigger?.type ?? parsed.data.triggerType,
    triggerConfig: parsed.data.trigger?.config ?? parsed.data.triggerConfig,
    actionType: parsed.data.actionType,
    actionConfig: hasNewContractPatch
      ? {
        ...baseActionConfig,
        prompt: buildAutomationPrompt(nextActionFields),
        instruction: nextActionFields.instruction,
        expected_output: nextActionFields.expectedOutput,
        delivery_target: nextActionFields.deliveryTarget,
        approval_mode: nextActionFields.approvalMode,
      }
      : parsed.data.actionConfig,
    conditionConfig: parsed.data.conditionConfig,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Solicitud no permitida" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canEditAgents(session.role)) {
    return NextResponse.json({ error: "Sin permisos para eliminar automatizaciones" }, { status: 403 });
  }

  const { agentId, automationId } = await params;
  const access = await assertAgentAccess({ session, agentId, capability: "read" });
  if (!access.ok) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const result = await softDeleteAutomation(automationId, session.organizationId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true } });
}
