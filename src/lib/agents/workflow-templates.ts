import type { WizardIntegrationId } from "@/lib/agents/wizard-integrations";

export const WORKFLOW_CATEGORIES = [
  "sales",
  "support",
  "operations",
  "knowledge",
] as const;
export type WorkflowCategory = (typeof WORKFLOW_CATEGORIES)[number];

export const AUTOMATION_PRESETS = [
  "copilot",
  "assisted",
  "autonomous",
] as const;
export type AutomationPreset = (typeof AUTOMATION_PRESETS)[number];

export const SUCCESS_METRIC_IDS = [
  "conversation_volume",
  "messages_processed",
  "actions_executed",
  "action_success_rate",
  "human_escalations",
  "confirmation_requests",
  "latency_p95",
  "integration_incidents",
] as const;
export type SuccessMetricId = (typeof SUCCESS_METRIC_IDS)[number];

export const WORKFLOW_TEMPLATE_IDS = [
  "sales_inbox",
  "sales_follow_up",
  "demo_scheduling",
  "sales_post_meeting",
  "pipeline_reactivation",
  "whatsapp_support",
  "email_support_escalation",
  "internal_helpdesk",
  "operational_approvals",
  "sales_knowledge_assistant",
  "advanced_builder",
] as const;
export type WorkflowTemplateId = (typeof WORKFLOW_TEMPLATE_IDS)[number];

export type WorkflowModelRecommendation = {
  model: "gpt-4o-mini" | "gpt-4o" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001" | "gemini-pro";
  costBand: "low" | "medium" | "high";
  latencyBand: "fast" | "balanced" | "deliberate";
  reasoningBand: "standard" | "strong";
  tradeoffCopy: string;
  isPrimary?: boolean;
};

export type WorkflowInstanceConfig = {
  language: string;
  ownerLabel: string;
  routingMode: string;
  handoffThreshold: string;
  scheduleSummary: string;
  toneSummary: string;
};

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  tagline: string;
  description: string;
  category: WorkflowCategory;
  requiredIntegrations: WizardIntegrationId[];
  optionalIntegrations: WizardIntegrationId[];
  allowedAutomationPresets: AutomationPreset[];
  defaultAutomationPreset: AutomationPreset | null;
  defaultInstanceConfig: WorkflowInstanceConfig;
  successMetrics: SuccessMetricId[];
  recommendedModels: WorkflowModelRecommendation[];
  phase: 1 | 2 | 3 | 4 | 5;
  availableInWizard: boolean;
  isAdvanced?: boolean;
};

const DEFAULT_METRICS: SuccessMetricId[] = [
  "conversation_volume",
  "messages_processed",
  "actions_executed",
  "action_success_rate",
  "human_escalations",
  "confirmation_requests",
  "latency_p95",
  "integration_incidents",
];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "sales_inbox",
    name: "Inbox comercial",
    tagline: "Prioriza, resume y prepara el siguiente paso para bandejas comerciales.",
    description: "Lee Gmail, CRM y agenda para clasificar conversaciones entrantes y sugerir la mejor accion siguiente sin ejecutar side effects.",
    category: "sales",
    requiredIntegrations: ["gmail"],
    optionalIntegrations: ["salesforce", "google_calendar"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Equipo comercial",
      routingMode: "Un chat por instancia dedicado a una bandeja o owner.",
      handoffThreshold: "Escalar cuando falte contexto comercial o la integracion requerida no responda.",
      scheduleSummary: "Horario laboral del equipo comercial.",
      toneSummary: "Claro, ejecutivo y accionable.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Balancea velocidad y criterio para resumir, priorizar y redactar sugerencias comerciales.",
        isPrimary: true,
      },
      {
        model: "gpt-4o-mini",
        costBand: "low",
        latencyBand: "fast",
        reasoningBand: "standard",
        tradeoffCopy: "Conviene cuando prima volumen y costo sobre razonamiento mas fino.",
      },
    ],
    phase: 2,
    availableInWizard: true,
  },
  {
    id: "sales_follow_up",
    name: "Follow-up comercial",
    tagline: "Ordena seguimientos sobre pipeline existente sin tocar sistemas por su cuenta.",
    description: "Usa contexto de CRM, Gmail y Calendar para sugerir follow-ups, prioridades y proximos pasos por instancia.",
    category: "sales",
    requiredIntegrations: ["salesforce"],
    optionalIntegrations: ["gmail", "google_calendar"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Owner o segmento comercial",
      routingMode: "Separar instancias por owner, pipeline o territorio.",
      handoffThreshold: "Escalar si el CRM no tiene contexto suficiente o aparece un caso sensible.",
      scheduleSummary: "Dias habiles con pausas de contacto configurables.",
      toneSummary: "Comercial directo y ordenado.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Recomendado para priorizar oportunidades y sintetizar contexto multi-sistema.",
        isPrimary: true,
      },
      {
        model: "claude-sonnet-4-6",
        costBand: "high",
        latencyBand: "deliberate",
        reasoningBand: "strong",
        tradeoffCopy: "Aporta mejor razonamiento cuando la instancia necesita analisis mas profundo.",
      },
    ],
    phase: 2,
    availableInWizard: true,
  },
  {
    id: "demo_scheduling",
    name: "Agendado de demos",
    tagline: "Propone horarios y deja toda escritura bajo confirmacion cuando aplica.",
    description: "Coordina disponibilidad y propuesta de slots desde Gmail o WhatsApp con soporte de Calendar y CRM.",
    category: "sales",
    requiredIntegrations: ["google_calendar"],
    optionalIntegrations: ["gmail", "whatsapp", "salesforce"],
    allowedAutomationPresets: ["copilot", "assisted"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Equipo de demos",
      routingMode: "Instancias por segmento, owner o geografia.",
      handoffThreshold: "Pedir confirmacion antes de crear o mover eventos en assisted.",
      scheduleSummary: "Ventanas comerciales disponibles y politicas de reprogramacion.",
      toneSummary: "Amable, concreto y orientado a cerrar fecha.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gemini-pro",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "standard",
        tradeoffCopy: "Calza bien cuando la instancia vive sobre Google Workspace y prioriza velocidad razonable.",
        isPrimary: true,
      },
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Sirve si la coordinacion requiere mas criterio comercial y mejor copy.",
      },
    ],
    phase: 2,
    availableInWizard: true,
  },
  {
    id: "sales_post_meeting",
    name: "Post-reunion comercial",
    tagline: "Resume contexto, define siguientes pasos y prepara actualizaciones confirmables.",
    description: "Conecta agenda, CRM y correo para bajar acuerdos, riesgos y tareas luego de una reunion.",
    category: "sales",
    requiredIntegrations: ["google_calendar"],
    optionalIntegrations: ["salesforce", "gmail"],
    allowedAutomationPresets: ["copilot", "assisted"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "AE o equipo de cuenta",
      routingMode: "Una instancia por owner o por segmento Enterprise/SMB.",
      handoffThreshold: "Confirmar antes de escribir en CRM cuando el preset sea assisted.",
      scheduleSummary: "Seguimiento dentro de 24h posteriores a la reunion.",
      toneSummary: "Ejecutivo, preciso y orientado a accion.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Buena combinacion para resumir acuerdos y preparar siguientes pasos con claridad.",
        isPrimary: true,
      },
      {
        model: "claude-sonnet-4-6",
        costBand: "high",
        latencyBand: "deliberate",
        reasoningBand: "strong",
        tradeoffCopy: "Alternativa para instancias que valoran mejor sintesis y razonamiento post-call.",
      },
    ],
    phase: 2,
    availableInWizard: true,
  },
  {
    id: "pipeline_reactivation",
    name: "Reactivacion de pipeline",
    tagline: "Identifica deals dormidos y propone recontactos ordenados.",
    description: "Trabaja sobre CRM y canales de contacto para priorizar reactivaciones sin side effects autonomos ambiguos.",
    category: "sales",
    requiredIntegrations: ["salesforce"],
    optionalIntegrations: ["gmail", "whatsapp"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Revenue ops o SDR team",
      routingMode: "Instancias por territorio, owner o etapa del pipeline.",
      handoffThreshold: "Escalar cuando el contexto del deal sea insuficiente o la accion sea sensible.",
      scheduleSummary: "Cadencias semanales con pausas configurables.",
      toneSummary: "Breve, comercial y respetuoso.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Recomendado por balance entre costo y criterio comercial en reactivacion.",
        isPrimary: true,
      },
    ],
    phase: 3,
    availableInWizard: true,
  },
  {
    id: "whatsapp_support",
    name: "Soporte por WhatsApp",
    tagline: "Canal activo de soporte con gobernanza explicita pendiente de Fase 3.",
    description: "Queda visible desde el catalogo para discovery, pero no es el foco vendible inicial hasta cerrar la matriz de respuestas del canal.",
    category: "support",
    requiredIntegrations: ["whatsapp"],
    optionalIntegrations: ["salesforce"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Equipo de soporte",
      routingMode: "Instancias por cola o linea de negocio.",
      handoffThreshold: "Escalar reclamos sensibles y casos fuera de politica.",
      scheduleSummary: "Cobertura por franjas de atencion.",
      toneSummary: "Empatico y claro.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o-mini",
        costBand: "low",
        latencyBand: "fast",
        reasoningBand: "standard",
        tradeoffCopy: "Ajusta bien a alto volumen y respuestas rapidas en soporte conversacional.",
        isPrimary: true,
      },
    ],
    phase: 3,
    availableInWizard: true,
  },
  {
    id: "email_support_escalation",
    name: "Soporte por email con escalacion",
    tagline: "Catalogado para una fase posterior cuando Gmail supere metadata-only.",
    description: "Sirve como placeholder de roadmap para workflows activos de email con escalacion humana.",
    category: "support",
    requiredIntegrations: ["gmail"],
    optionalIntegrations: ["salesforce"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Equipo de soporte email",
      routingMode: "Instancias por queue o prioridad.",
      handoffThreshold: "Escalar si la lectura segura no alcanza para resolver.",
      scheduleSummary: "Cobertura por horario laboral.",
      toneSummary: "Formal y resolutivo.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o-mini",
        costBand: "low",
        latencyBand: "fast",
        reasoningBand: "standard",
        tradeoffCopy: "Suficiente para triage y borradores cuando el canal madure.",
        isPrimary: true,
      },
    ],
    phase: 3,
    availableInWizard: true,
  },
  {
    id: "internal_helpdesk",
    name: "Helpdesk interno",
    tagline: "Pensado para Slack o Teams cuando esos conectores entren al catalogo real.",
    description: "Workflow de wave 2 para soporte interno apoyado en CRM o base operativa.",
    category: "operations",
    requiredIntegrations: ["slack"],
    optionalIntegrations: ["salesforce"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Operaciones internas",
      routingMode: "Instancias por equipo o vertical.",
      handoffThreshold: "Escalar a humano cuando falten permisos o contexto.",
      scheduleSummary: "Cobertura por horario interno.",
      toneSummary: "Directo y util.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o-mini",
        costBand: "low",
        latencyBand: "fast",
        reasoningBand: "standard",
        tradeoffCopy: "Atractivo para helpdesk interno de alto volumen.",
        isPrimary: true,
      },
    ],
    phase: 5,
    availableInWizard: false,
  },
  {
    id: "operational_approvals",
    name: "Aprobaciones operativas",
    tagline: "Secuencia aprobaciones en mensajeria interna y agenda.",
    description: "Workflow futuro para aprobaciones coordinadas entre chat interno, calendario y CRM.",
    category: "operations",
    requiredIntegrations: ["slack"],
    optionalIntegrations: ["google_calendar", "salesforce"],
    allowedAutomationPresets: ["copilot", "assisted"],
    defaultAutomationPreset: "assisted",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Operaciones",
      routingMode: "Instancias por proceso aprobado.",
      handoffThreshold: "Toda escritura queda confirmable hasta cerrar gobernanza completa.",
      scheduleSummary: "Ventanas operativas definidas por proceso.",
      toneSummary: "Preciso y controlado.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Mejor cuando el workflow necesita entender contexto cruzado y estados de aprobacion.",
        isPrimary: true,
      },
    ],
    phase: 5,
    availableInWizard: false,
  },
  {
    id: "sales_knowledge_assistant",
    name: "Asistente de conocimiento comercial",
    tagline: "Consulta conocimiento comercial conectado a herramientas del equipo.",
    description: "Wave 2 orientada a Notion + Gmail/Slack para recuperar contexto comercial sin chat universal.",
    category: "knowledge",
    requiredIntegrations: [],
    optionalIntegrations: ["gmail", "slack"],
    allowedAutomationPresets: ["copilot"],
    defaultAutomationPreset: "copilot",
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Enablement comercial",
      routingMode: "Instancias por vertical o playbook.",
      handoffThreshold: "Escalar cuando la base de conocimiento no alcance.",
      scheduleSummary: "Disponible durante jornada comercial.",
      toneSummary: "Consultivo y claro.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "claude-sonnet-4-6",
        costBand: "high",
        latencyBand: "deliberate",
        reasoningBand: "strong",
        tradeoffCopy: "Aporta mejor lectura y sintesis para workflows guiados por conocimiento.",
        isPrimary: true,
      },
    ],
    phase: 5,
    availableInWizard: false,
  },
  {
    id: "advanced_builder",
    name: "Modo avanzado / desde cero",
    tagline: "Mantiene el builder actual para casos fuera del catalogo inicial.",
    description: "Usa el flujo guiado como punto de partida, pero sin atarte a un workflow template del catalogo.",
    category: "operations",
    requiredIntegrations: [],
    optionalIntegrations: ["whatsapp", "salesforce", "gmail", "google_calendar"],
    allowedAutomationPresets: ["copilot", "assisted", "autonomous"],
    defaultAutomationPreset: null,
    defaultInstanceConfig: {
      language: "es",
      ownerLabel: "Equipo",
      routingMode: "Definido manualmente en el builder.",
      handoffThreshold: "Definido manualmente por el equipo.",
      scheduleSummary: "Definido manualmente.",
      toneSummary: "Definido manualmente.",
    },
    successMetrics: DEFAULT_METRICS,
    recommendedModels: [
      {
        model: "gpt-4o",
        costBand: "medium",
        latencyBand: "balanced",
        reasoningBand: "strong",
        tradeoffCopy: "Punto de partida generalista para configuraciones abiertas.",
        isPrimary: true,
      },
    ],
    phase: 1,
    availableInWizard: true,
    isAdvanced: true,
  },
];

export function getWorkflowTemplateById(workflowTemplateId: WorkflowTemplateId): WorkflowTemplate {
  return WORKFLOW_TEMPLATES.find((template) => template.id === workflowTemplateId) ?? WORKFLOW_TEMPLATES[0];
}

export function getVisibleWorkflowTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((template) => template.availableInWizard);
}
