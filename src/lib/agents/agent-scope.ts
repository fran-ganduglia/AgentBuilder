import type { AgentTemplateId } from "@/lib/agents/agent-setup";
import type { WorkflowCategory, WorkflowTemplateId } from "@/lib/agents/workflow-templates";
import { inferScopeFromWorkflowAction } from "@/lib/workflows/action-matrix";

export const AGENT_SCOPES = ["support", "sales", "operations"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const OUT_OF_SCOPE_POLICIES = ["reject_and_redirect"] as const;
export type OutOfScopePolicy = (typeof OUT_OF_SCOPE_POLICIES)[number];

export const AGENT_SCOPE_LABELS: Record<AgentScope, string> = {
  support: "Soporte",
  sales: "Ventas",
  operations: "Operaciones",
};

export const AGENT_SCOPE_DESCRIPTIONS: Record<AgentScope, string> = {
  support:
    "Consultas, incidentes, estados y handoff de soporte sin convertirse en un agente comercial.",
  sales:
    "Calificacion, follow-up, propuestas y agenda comercial sin resolver reclamos como helpdesk.",
  operations:
    "Coordinacion interna, reporting, aprobaciones y tareas operativas sin asumir soporte o ventas al cliente.",
};

export function normalizeOutOfScopePolicy(
  policy: OutOfScopePolicy | null | undefined
): OutOfScopePolicy {
  return policy === "reject_and_redirect" ? policy : "reject_and_redirect";
}

export function deriveAgentScope(input: {
  agentScope?: AgentScope | null;
  templateId?: AgentTemplateId | null;
  workflowCategory?: WorkflowCategory | null;
  workflowTemplateId?: WorkflowTemplateId | null;
}): AgentScope {
  const explicitAgentScope =
    input.agentScope && AGENT_SCOPES.includes(input.agentScope)
      ? input.agentScope
      : null;

  if (explicitAgentScope && explicitAgentScope !== "operations") {
    return explicitAgentScope;
  }

  if (input.workflowCategory === "support") {
    return "support";
  }

  if (input.workflowCategory === "sales") {
    return "sales";
  }

  const workflowTemplateId = input.workflowTemplateId ?? "";
  if (workflowTemplateId.includes("support")) {
    return "support";
  }
  if (
    workflowTemplateId.includes("sales") ||
    workflowTemplateId.includes("lead") ||
    workflowTemplateId.includes("opportunity")
  ) {
    return "sales";
  }

  const templateId = input.templateId ?? "";
  if (
    templateId.includes("support") ||
    templateId.includes("gmail_inbox") ||
    templateId.includes("case_triage") ||
    templateId.includes("faq") ||
    templateId.includes("helpdesk")
  ) {
    return "support";
  }
  if (
    templateId.includes("sales") ||
    templateId.includes("lead") ||
    templateId.includes("follow_up") ||
    templateId.includes("opportunity")
  ) {
    return "sales";
  }

  return explicitAgentScope ?? "operations";
}

export type ScopeIntentResult = {
  decision: "in_scope" | "out_of_scope" | "ambiguous";
  targetScope?: AgentScope;
};

const SCOPE_KEYWORDS: Record<AgentScope, string[]> = {
  support: [
    "soporte",
    "ayuda",
    "problema",
    "error",
    "incidente",
    "reclamo",
    "ticket",
    "falla",
    "estado del pedido",
    "estado del caso",
  ],
  sales: [
    "venta",
    "ventas",
    "lead",
    "prospecto",
    "prospect",
    "follow-up",
    "follow up",
    "pipeline",
    "propuesta",
    "cotizacion",
    "demo",
    "reunion comercial",
    "oportunidad",
    "cerrar",
  ],
  operations: [
    "operacion",
    "operaciones",
    "interno",
    "coordin",
    "reporte",
    "reporting",
    "approval",
    "aprobacion",
    "aprobar",
    "resumen",
    "dashboard",
    "backoffice",
    "seguimiento interno",
    "tarea operativa",
  ],
};

function scoreScope(message: string, scope: AgentScope): number {
  return SCOPE_KEYWORDS[scope].reduce((score, keyword) => {
    return message.includes(keyword) ? score + 1 : score;
  }, 0);
}

export function classifyScopeIntent(input: {
  content: string;
  agentScope: AgentScope;
}): ScopeIntentResult {
  const normalized = input.content.trim().toLowerCase();
  if (!normalized) {
    return { decision: "ambiguous" };
  }

  const scoredScopes = AGENT_SCOPES.map((scope) => ({
    scope,
    score: scoreScope(normalized, scope),
  })).sort((left, right) => right.score - left.score);

  const best = scoredScopes[0];
  const second = scoredScopes[1];

  if (!best || best.score === 0) {
    return { decision: "in_scope" };
  }

  if (best.score === second.score) {
    return { decision: "ambiguous", targetScope: best.scope };
  }

  if (best.scope === input.agentScope) {
    return { decision: "in_scope" };
  }

  return { decision: "out_of_scope", targetScope: best.scope };
}

export function buildOutOfScopeResponse(input: {
  agentScope: AgentScope;
  targetScope?: AgentScope;
}): string {
  const currentScopeLabel = AGENT_SCOPE_LABELS[input.agentScope].toLowerCase();
  const targetScopeLabel = input.targetScope
    ? AGENT_SCOPE_LABELS[input.targetScope].toLowerCase()
    : "otro equipo";

  return `Este agente es de ${currentScopeLabel} y este pedido queda fuera de su alcance. Conviene derivarlo a ${targetScopeLabel} o a una persona responsable antes de seguir.`;
}

export function buildAmbiguousScopeResponse(agentScope: AgentScope): string {
  return `Puedo ayudarte, pero primero necesito confirmar si este pedido es de ${AGENT_SCOPE_LABELS[agentScope].toLowerCase()} o si corresponde derivarlo a otro tipo de agente.`;
}

export function assertScopeAllowsSensitiveAction(input: {
  agentScope: AgentScope;
  provider: string;
  action: string;
  summary: string;
}):
  | { ok: true }
  | {
      ok: false;
      targetScope?: AgentScope;
      message: string;
    } {
  const mappedScope = inferScopeFromWorkflowAction({
    provider: input.provider,
    action: input.action,
    summary: input.summary,
  });

  if (mappedScope && mappedScope !== input.agentScope) {
    return {
      ok: false,
      targetScope: mappedScope,
      message: buildOutOfScopeResponse({
        agentScope: input.agentScope,
        targetScope: mappedScope,
      }),
    };
  }

  const classifiedScope = classifyScopeIntent({
    content: input.summary,
    agentScope: input.agentScope,
  });

  if (classifiedScope.decision === "out_of_scope") {
    return {
      ok: false,
      targetScope: classifiedScope.targetScope,
      message: buildOutOfScopeResponse({
        agentScope: input.agentScope,
        targetScope: classifiedScope.targetScope,
      }),
    };
  }

  return { ok: true };
}
