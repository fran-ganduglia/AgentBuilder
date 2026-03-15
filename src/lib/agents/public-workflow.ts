import type {
  SuccessMetricId,
  WorkflowInstanceConfig,
  WorkflowModelRecommendation,
} from "@/lib/agents/workflow-templates";

export const PUBLIC_WORKFLOW_IDS = ["general_operations"] as const;
export type PublicWorkflowId = (typeof PUBLIC_WORKFLOW_IDS)[number];

export const AGENT_CAPABILITIES = [
  "request_handling",
  "scheduled_jobs",
  "document_generation",
  "integrated_reads",
  "integrated_writes_with_approval",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export const AGENT_CAPABILITY_LABELS: Record<AgentCapability, string> = {
  request_handling: "Atender pedidos",
  scheduled_jobs: "Tareas programadas",
  document_generation: "Generar documentos",
  integrated_reads: "Lecturas integradas",
  integrated_writes_with_approval: "Escrituras con approval",
};

export const AGENT_CAPABILITY_DESCRIPTIONS: Record<AgentCapability, string> = {
  request_handling: "Resolver pedidos ad hoc en chat y orientar el siguiente paso con contexto operativo.",
  scheduled_jobs: "Ejecutar tareas por cron o evento usando el mismo runtime del agente.",
  document_generation: "Crear resúmenes, reportes, borradores y entregables textuales.",
  integrated_reads: "Consultar integraciones habilitadas y responder sin inventar datos.",
  integrated_writes_with_approval: "Preparar y ejecutar escrituras sensibles solo mediante approval inbox.",
};

export type PublicWorkflowDefinition = {
  id: PublicWorkflowId;
  name: string;
  tagline: string;
  description: string;
  defaultInstanceConfig: WorkflowInstanceConfig;
  recommendedModels: WorkflowModelRecommendation[];
  defaultCapabilities: AgentCapability[];
  successMetrics: SuccessMetricId[];
};

export const GENERAL_OPERATIONS_WORKFLOW: PublicWorkflowDefinition = {
  id: "general_operations",
  name: "Workflow operativo general",
  tagline: "Un solo agente configurable para pedidos, automatizaciones y entregables.",
  description:
    "El cliente define objetivo, capacidades, integraciones y reglas. El backend compila guardrails y perfiles internos sin exponer templates.",
  defaultInstanceConfig: {
    language: "es",
    ownerLabel: "Equipo operativo",
    routingMode: "Un chat por agente con reglas claras de derivación y uso de herramientas.",
    handoffThreshold: "Escalar cuando falte contexto, aprobación humana o una integración requerida falle.",
    scheduleSummary: "Permitir tareas programadas cuando el agente tenga automatizaciones configuradas.",
    toneSummary: "Claro, operativo y accionable.",
  },
  recommendedModels: [
    {
      model: "gpt-4o",
      costBand: "medium",
      latencyBand: "balanced",
      reasoningBand: "strong",
      tradeoffCopy:
        "Buen punto de partida generalista para combinar criterio, capacidad operativa y calidad de respuesta.",
      isPrimary: true,
    },
    {
      model: "gpt-4o-mini",
      costBand: "low",
      latencyBand: "fast",
      reasoningBand: "standard",
      tradeoffCopy:
        "Conviene cuando prima volumen y costo sobre profundidad de razonamiento.",
    },
  ],
  defaultCapabilities: ["request_handling"],
  successMetrics: [
    "conversation_volume",
    "messages_processed",
    "actions_executed",
    "action_success_rate",
    "human_escalations",
    "confirmation_requests",
    "latency_p95",
    "integration_incidents",
  ],
};

export function getPublicWorkflowById(
  workflowId: PublicWorkflowId = "general_operations"
): PublicWorkflowDefinition {
  void workflowId;
  return GENERAL_OPERATIONS_WORKFLOW;
}
