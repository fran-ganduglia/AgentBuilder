import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildAutomationPrompt,
  classifyAutomationScope,
  shouldBlockAutomationForScope,
} from "@/lib/agents/automation-contract";
import { assertAgentAccess, canEditAgents } from "@/lib/auth/agent-access";
import { applyPublicWorkflowFields } from "@/lib/agents/agent-setup";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { getSession } from "@/lib/auth/get-session";
import {
  createAutomation,
  listAutomations,
} from "@/lib/db/agent-automations";
import { updateAgentSetupState } from "@/lib/db/agents";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const createAutomationSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200, "Maximo 200 caracteres"),
  description: z.string().max(500, "Maximo 500 caracteres").optional(),
  triggerType: z.enum(["schedule", "webhook", "event"]).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: z.enum(["agent_message", "integration_call", "workflow"]).optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  conditionConfig: z.record(z.string(), z.unknown()).optional(),
  trigger: z.object({
    type: z.enum(["schedule", "webhook", "event"]),
    config: z.record(z.string(), z.unknown()),
  }).optional(),
  instruction: z.string().max(2000, "Maximo 2000 caracteres").optional(),
  expectedOutput: z.string().max(1000, "Maximo 1000 caracteres").optional(),
  deliveryTarget: z.string().max(500, "Maximo 500 caracteres").optional(),
  approvalMode: z.enum(["writes_require_approval"]).optional(),
}).superRefine((value, ctx) => {
  const hasNewContract = Boolean(
    value.trigger || value.instruction || value.expectedOutput || value.deliveryTarget
  );
  const hasLegacyContract = Boolean(
    value.triggerType && value.triggerConfig && value.actionType && value.actionConfig
  );

  if (!hasNewContract && !hasLegacyContract) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trigger"],
      message: "Debes enviar el contrato nuevo de automatizacion o el legacy completo.",
    });
  }

  if (hasNewContract && !value.instruction?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["instruction"],
      message: "La instruccion es requerida.",
    });
  }
});

type RouteParams = { params: Promise<{ agentId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await params;
  const access = await assertAgentAccess({ session, agentId, capability: "read" });
  if (!access.ok) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const result = await listAutomations(agentId, session.organizationId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request, { params }: RouteParams) {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Solicitud no permitida" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!canEditAgents(session.role)) {
    return NextResponse.json({ error: "Sin permisos para crear automatizaciones" }, { status: 403 });
  }

  const { agentId } = await params;
  const access = await assertAgentAccess({ session, agentId, capability: "read" });
  if (!access.ok) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = createAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Input invalido" },
      { status: 400 }
    );
  }
  const setupState = readAgentSetupState(access.agent);
  const agentScope = setupState?.agentScope ?? "operations";

  if (parsed.data.instruction) {
    const scopeDecision = classifyAutomationScope({
      agentScope,
      name: parsed.data.name,
      description: parsed.data.description,
      instruction: parsed.data.instruction,
      expectedOutput: parsed.data.expectedOutput,
      deliveryTarget: parsed.data.deliveryTarget,
    });
    const scopeBlock = shouldBlockAutomationForScope(scopeDecision);

    if (scopeBlock.blocked) {
      return NextResponse.json(
        { error: scopeBlock.message },
        { status: 422 }
      );
    }
  }

  const result = await createAutomation({
    agentId,
    organizationId: session.organizationId,
    name: parsed.data.name,
    description: parsed.data.description,
    triggerType: parsed.data.trigger?.type ?? parsed.data.triggerType ?? "schedule",
    triggerConfig: parsed.data.trigger?.config ?? parsed.data.triggerConfig ?? {},
    actionType: parsed.data.actionType ?? "agent_message",
    actionConfig: parsed.data.instruction
      ? {
        prompt: buildAutomationPrompt({
          instruction: parsed.data.instruction,
          expectedOutput: parsed.data.expectedOutput ?? "",
          deliveryTarget: parsed.data.deliveryTarget ?? "",
          approvalMode: parsed.data.approvalMode ?? "writes_require_approval",
        }),
        instruction: parsed.data.instruction,
        expected_output: parsed.data.expectedOutput ?? "",
        delivery_target: parsed.data.deliveryTarget ?? "",
        approval_mode: parsed.data.approvalMode ?? "writes_require_approval",
      }
      : (parsed.data.actionConfig ?? {}),
    conditionConfig: parsed.data.conditionConfig,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (setupState) {
    const nextSetupState = applyPublicWorkflowFields({
      setupState,
      capabilities: Array.from(new Set([...setupState.capabilities, "scheduled_jobs"])),
    });

    void updateAgentSetupState(agentId, session.organizationId, nextSetupState);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
