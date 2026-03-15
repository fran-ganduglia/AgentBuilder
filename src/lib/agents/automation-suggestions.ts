import type { WizardIntegrationId } from "./wizard-integrations";
import type { AgentScope } from "./agent-scope";
import type { AutomationApprovalMode } from "./automation-contract";

export type AutomationExample = {
  id: string;
  name: string;
  description: string;
  agentScope: AgentScope;
  triggerType: "schedule" | "event";
  triggerConfig: Record<string, unknown>;
  instruction: string;
  expectedOutput: string;
  deliveryTarget: string;
  approvalMode: AutomationApprovalMode;
  requiredIntegrations: WizardIntegrationId[];
};

type IntegrationSet = Set<WizardIntegrationId>;

const ALL_EXAMPLES: AutomationExample[] = [
  {
    id: "gmail_daily_inbox_summary",
    name: "Resumen diario de emails importantes",
    description: "Todos los dias laborales a las 8am revisa Gmail y genera un resumen priorizado.",
    agentScope: "support",
    triggerType: "schedule",
    triggerConfig: { cron: "0 8 * * 1-5", timezone: "America/Buenos_Aires" },
    instruction: "Revisa los emails de las ultimas 24 horas en Gmail y prioriza lo urgente o bloqueante.",
    expectedOutput: "Un resumen corto con urgencias, seguimientos y proximos pasos sugeridos.",
    deliveryTarget: "chat del agente o bandeja operativa interna",
    approvalMode: "writes_require_approval",
    requiredIntegrations: ["gmail"],
  },
  {
    id: "google_calendar_daily_agenda",
    name: "Agenda diaria del equipo",
    description: "Cada dia laboral a primera hora prepara la agenda del dia desde Google Calendar.",
    agentScope: "operations",
    triggerType: "schedule",
    triggerConfig: { cron: "30 7 * * 1-5", timezone: "America/Buenos_Aires" },
    instruction: "Consulta los eventos del dia y destaca reuniones criticas, conflictos y huecos disponibles.",
    expectedOutput: "Agenda resumida con horarios, participantes y alertas operativas.",
    deliveryTarget: "chat del agente o resumen operativo diario",
    approvalMode: "writes_require_approval",
    requiredIntegrations: ["google_calendar"],
  },
  {
    id: "salesforce_weekly_pipeline_review",
    name: "Revision semanal de pipeline",
    description: "Cada viernes genera un corte del pipeline con riesgos y oportunidades.",
    agentScope: "sales",
    triggerType: "schedule",
    triggerConfig: { cron: "0 17 * * 5", timezone: "America/Buenos_Aires" },
    instruction: "Revisa Salesforce y detecta oportunidades estancadas, riesgos y proximos pasos recomendados.",
    expectedOutput: "Reporte semanal accionable con prioridades y alertas.",
    deliveryTarget: "chat del agente, documento o resumen para revenue ops",
    approvalMode: "writes_require_approval",
    requiredIntegrations: ["salesforce"],
  },
  {
    id: "gmail_calendar_meeting_follow_up",
    name: "Preparar follow-up despues de reuniones",
    description: "Cuando termina una reunion, usa email y agenda para dejar listo el siguiente paso.",
    agentScope: "sales",
    triggerType: "event",
    triggerConfig: { integration: "google_calendar", event: "meeting_ended" },
    instruction: "Cruza la reunion finalizada con el hilo de Gmail relacionado y prepara un follow-up accionable.",
    expectedOutput: "Borrador o resumen con acuerdos, riesgos y siguiente accion recomendada.",
    deliveryTarget: "borrador, documento o chat del agente",
    approvalMode: "writes_require_approval",
    requiredIntegrations: ["gmail", "google_calendar"],
  },
];

export function getAutomationExamples(
  integrations: WizardIntegrationId[],
  agentScope: AgentScope
): AutomationExample[] {
  const integrationSet: IntegrationSet = new Set(integrations);

  return ALL_EXAMPLES.filter((example) =>
    example.agentScope === agentScope &&
    example.requiredIntegrations.every((required) => integrationSet.has(required))
  );
}
