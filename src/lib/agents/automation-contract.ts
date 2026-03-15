import {
  classifyScopeIntent,
  type AgentScope,
  type ScopeIntentResult,
} from "@/lib/agents/agent-scope";

export type AutomationApprovalMode = "writes_require_approval";

export type AutomationInstructionFields = {
  instruction: string;
  expectedOutput: string;
  deliveryTarget: string;
  approvalMode: AutomationApprovalMode;
};

export function buildAutomationPrompt(input: AutomationInstructionFields): string {
  return [
    input.instruction.trim(),
    input.expectedOutput.trim()
      ? `Output esperado: ${input.expectedOutput.trim()}`
      : null,
    input.deliveryTarget.trim()
      ? `Destino de entrega: ${input.deliveryTarget.trim()}`
      : null,
    input.approvalMode === "writes_require_approval"
      ? "Si necesitas una escritura sensible, usa approval inbox antes de ejecutar."
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function readAutomationTriggerConfig(
  triggerConfig: Record<string, unknown> | null | undefined
): { cron: string | null; timezone: string } {
  const cron = typeof triggerConfig?.cron === "string" ? triggerConfig.cron : null;
  const timezone = typeof triggerConfig?.timezone === "string" ? triggerConfig.timezone : "UTC";
  return { cron, timezone };
}

export function readAutomationInstructionFields(
  actionConfig: Record<string, unknown> | null | undefined
): AutomationInstructionFields {
  const instruction =
    typeof actionConfig?.instruction === "string" ? actionConfig.instruction : "";
  const expectedOutput =
    typeof actionConfig?.expected_output === "string"
      ? actionConfig.expected_output
      : "";
  const deliveryTarget =
    typeof actionConfig?.delivery_target === "string"
      ? actionConfig.delivery_target
      : "";
  const approvalMode: AutomationApprovalMode = "writes_require_approval";

  return {
    instruction,
    expectedOutput,
    deliveryTarget,
    approvalMode,
  };
}

export function classifyAutomationScope(input: {
  agentScope: AgentScope;
  name?: string | null;
  description?: string | null;
  instruction?: string | null;
  expectedOutput?: string | null;
  deliveryTarget?: string | null;
}): ScopeIntentResult {
  const content = [
    input.name ?? "",
    input.description ?? "",
    input.instruction ?? "",
    input.expectedOutput ?? "",
    input.deliveryTarget ?? "",
  ]
    .join(" ")
    .trim();

  if (!content) {
    return { decision: "in_scope" };
  }

  return classifyScopeIntent({
    content,
    agentScope: input.agentScope,
  });
}

export function shouldBlockAutomationForScope(
  decision: ScopeIntentResult
):
  | { blocked: false }
  | {
      blocked: true;
      reason: "out_of_scope" | "ambiguous";
      message: string;
    } {
  if (decision.decision === "out_of_scope") {
    return {
      blocked: true,
      reason: "out_of_scope",
      message:
        "La automatizacion queda fuera del scope de este agente y debe derivarse o revisarse antes de guardarla.",
    };
  }

  if (decision.decision === "ambiguous") {
    return {
      blocked: true,
      reason: "ambiguous",
      message:
        "La automatizacion no deja claro si pertenece al scope de este agente. Ajusta la instruccion para que quede explicitamente dentro de soporte, ventas u operaciones antes de guardarla.",
    };
  }

  return { blocked: false };
}
