export const WIZARD_INTEGRATION_IDS = [
  "whatsapp",
  "salesforce",
  "gmail",
  "google_calendar",
  "slack",
] as const;

export type WizardIntegrationId = (typeof WIZARD_INTEGRATION_IDS)[number];

export type WizardIntegrationTheme = "emerald" | "sky" | "orange" | "rose" | "violet" | "slate" | "amber";

export type WizardIntegration = {
  id: WizardIntegrationId;
  name: string;
  description: string;
  theme: WizardIntegrationTheme;
  available: boolean;
  requiresConnection: boolean;
};

export const WIZARD_INTEGRATIONS: WizardIntegration[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Mensajeria directa con clientes",
    theme: "emerald",
    available: true,
    requiresConnection: true,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM lider para leads, deals y casos",
    theme: "sky",
    available: true,
    requiresConnection: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Bandeja de entrada y respuestas",
    theme: "rose",
    available: true,
    requiresConnection: true,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Agenda, reuniones y disponibilidad",
    theme: "rose",
    available: true,
    requiresConnection: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Canales internos y helpdesk de equipo",
    theme: "violet",
    available: false,
    requiresConnection: true,
  },
];

export const AVAILABLE_WIZARD_INTEGRATION_IDS = WIZARD_INTEGRATIONS
  .filter((integration) => integration.available)
  .map((integration) => integration.id) as WizardIntegrationId[];

export function getWizardIntegrationById(integrationId: WizardIntegrationId): WizardIntegration {
  return WIZARD_INTEGRATIONS.find((integration) => integration.id === integrationId) ?? WIZARD_INTEGRATIONS[0];
}

export function isWizardIntegrationAvailable(integrationId: WizardIntegrationId): boolean {
  return AVAILABLE_WIZARD_INTEGRATION_IDS.includes(integrationId);
}

