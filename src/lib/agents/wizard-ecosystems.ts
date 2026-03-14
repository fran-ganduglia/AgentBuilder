export const WIZARD_ECOSYSTEM_IDS = [
  "whatsapp",
  "salesforce",
  "hubspot",
  "google_workspace",
  "collaboration",
] as const;

export type WizardEcosystemId = (typeof WIZARD_ECOSYSTEM_IDS)[number];

export type WizardTutorialStep = {
  title: string;
  description: string;
};

export type WizardTutorialLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type WizardEcosystemTheme = "emerald" | "sky" | "orange" | "rose" | "violet";

export type WizardEcosystem = {
  id: WizardEcosystemId;
  name: string;
  description: string;
  availabilityLabel: string;
  theme: WizardEcosystemTheme;
  tutorialTitle: string;
  tutorialDescription: string;
  prerequisites: string[];
  steps: WizardTutorialStep[];
  resourceLinks: WizardTutorialLink[];
  primaryAction: WizardTutorialLink;
  secondaryAction: WizardTutorialLink;
};

export const WIZARD_ECOSYSTEMS: WizardEcosystem[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Atiende soporte y ventas en un canal real con onboarding listo para equipos no tecnicos.",
    availabilityLabel: "Conexion real disponible",
    theme: "emerald",
    tutorialTitle: "Prepara Meta y despues conecta la WABA en AgentBuilder",
    tutorialDescription:
      "Este camino ya tiene soporte real en el producto. Primero valida la configuracion en Meta y luego conecta la integracion desde Settings para que QA pueda observar conversaciones reales.",
    prerequisites: [
      "WABA y numero aprobados en Meta",
      "Access token, app secret y verify token listos",
      "Permiso de administrador para conectar la integracion real",
    ],
    steps: [
      {
        title: "Crea o revisa tu app en Meta Developers",
        description:
          "Confirma que la app tenga WhatsApp Cloud API habilitada y que el numero quede asociado a la WABA correcta antes de tocar el wizard.",
      },
      {
        title: "Valida credenciales y webhook",
        description:
          "Reune WABA ID, access token, app secret y verify token. Son los mismos datos que vas a cargar en Settings > Integraciones.",
      },
      {
        title: "Vuelve al wizard para crear el agente inteligente",
        description:
          "Una vez definida la integracion base, crea el agente unificado de WhatsApp y completa su setup comun antes de conectarlo al numero real.",
      },
    ],
    resourceLinks: [
      {
        label: "WhatsApp Cloud API Get Started",
        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
        external: true,
      },
    ],
    primaryAction: {
      label: "Abrir integraciones",
      href: "/settings/integrations",
    },
    secondaryAction: {
      label: "Guia oficial de Meta",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
      external: true,
    },
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Organiza leads, casos y handoffs comerciales con templates ya preparados para CRM.",
    availabilityLabel: "Conexion real disponible",
    theme: "sky",
    tutorialTitle: "Conecta Salesforce y deja el agente listo para operar",
    tutorialDescription:
      "Si tu organizacion ya tiene una integracion Salesforce usable, el borrador se crea con la tool CRM vinculada automaticamente. Si todavia no existe o necesita revision, el wizard crea el borrador igual y lo deja pendiente hasta completar la conexion.",
    prerequisites: [
      "Permiso de admin para abrir Settings > Integraciones en AgentBuilder",
      "Una integracion Salesforce activa y operable para la organizacion",
      "Definir el proceso a cubrir: leads, casos o handoff comercial",
    ],
    steps: [
      {
        title: "Conecta Salesforce desde Integraciones",
        description:
          "Revisa si la organizacion ya tiene OAuth operativo en Settings > Integraciones. Si falta, ese es el primer paso antes de activar el agente.",
      },
      {
        title: "Crea el borrador con un template Salesforce",
        description:
          "Cuando la integracion esta usable, el agente se guarda con la tool CRM autoasignada. Si no, el borrador queda pendiente y el setup lo muestra como bloqueo real.",
      },
      {
        title: "Valida la tool CRM del agente",
        description:
          "Para agentes nuevos suele quedar lista automaticamente. En agentes existentes, abre la configuracion de tools y guarda la tool CRM si todavia no esta vinculada.",
      },
    ],
    resourceLinks: [
      {
        label: "Salesforce app authentication guide",
        href: "https://developer.salesforce.com/docs/platform/mobile-sdk/guide/connected-apps-howto.html",
        external: true,
      },
    ],
    primaryAction: {
      label: "Abrir integraciones",
      href: "/settings/integrations",
    },
    secondaryAction: {
      label: "Guia oficial de Salesforce",
      href: "https://developer.salesforce.com/docs/platform/mobile-sdk/guide/connected-apps-howto.html",
      external: true,
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Acelera captacion y seguimiento comercial con templates enfocados en pipeline y lead capture.",
    availabilityLabel: "Conexion real disponible",
    theme: "orange",
    tutorialTitle: "Conecta HubSpot y deja el agente listo para operar",
    tutorialDescription:
      "Si tu organizacion ya tiene una integracion HubSpot usable, el borrador se crea con la tool CRM vinculada automaticamente. Si todavia no existe o necesita revision, el wizard crea el borrador igual y lo deja pendiente hasta completar la conexion.",
    prerequisites: [
      "Permiso de admin para abrir Settings > Integraciones en AgentBuilder",
      "Una integracion HubSpot activa y operable para la organizacion",
      "Definir el flujo a cubrir: contactos, deals, tasks o meetings",
    ],
    steps: [
      {
        title: "Conecta HubSpot desde Integraciones",
        description:
          "Revisa si la organizacion ya tiene OAuth operativo en Settings > Integraciones. Si falta, ese es el primer paso antes de activar el agente.",
      },
      {
        title: "Crea el borrador con un template HubSpot",
        description:
          "Cuando la integracion esta usable, el agente se guarda con la tool CRM autoasignada. Si no, el borrador queda pendiente y el setup lo muestra como bloqueo real.",
      },
      {
        title: "Valida la tool CRM del agente",
        description:
          "Para agentes nuevos suele quedar lista automaticamente. En agentes existentes, abre la configuracion de tools y guarda la tool CRM si todavia no esta vinculada.",
      },
    ],
    resourceLinks: [
      {
        label: "HubSpot OAuth quickstart",
        href: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide",
        external: true,
      },
    ],
    primaryAction: {
      label: "Abrir integraciones",
      href: "/settings/integrations",
    },
    secondaryAction: {
      label: "Guia oficial de HubSpot",
      href: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide",
      external: true,
    },
  },
  {
    id: "google_workspace",
    name: "Gmail + Calendar",
    description: "Asistentes para inbox y agenda sobre una sola integracion compartida de Google Workspace.",
    availabilityLabel: "Conexion real disponible",
    theme: "rose",
    tutorialTitle: "Conecta Google Workspace y habilita Gmail o Calendar por superficie",
    tutorialDescription:
      "Gmail y Google Calendar ya comparten una sola integracion `google` a nivel organizacion. Puedes conectar una superficie primero y ampliar scopes despues sin perder la conexion existente.",
    prerequisites: [
      "Permiso de admin para abrir Settings > Integraciones en AgentBuilder",
      "Proyecto OAuth de Google Cloud con Gmail API y/o Calendar API habilitadas",
      "Definir si el agente necesita inbox, agenda o ambas superficies",
    ],
    steps: [
      {
        title: "Conecta Google desde Integraciones",
        description:
          "Cada card de Settings habilita Gmail o Calendar pidiendo solo los scopes necesarios y acumulando permisos sobre la misma integracion `google`.",
      },
      {
        title: "Crea el borrador con un template de inbox o agenda",
        description:
          "El wizard ya permite marcar Gmail y Google Calendar como integraciones disponibles para que el setup refleje el alcance real del agente.",
      },
      {
        title: "Guarda la tool correcta en el agente",
        description:
          "Cada superficie se configura por separado en el panel del agente con sus propias acciones habilitadas, aunque ambas apunten al mismo `integration_id`.",
      },
    ],
    resourceLinks: [
      {
        label: "Gmail API quickstart",
        href: "https://developers.google.com/workspace/gmail/api/quickstart/js",
        external: true,
      },
      {
        label: "Google Calendar quickstart",
        href: "https://developers.google.com/calendar/api/quickstart/js",
        external: true,
      },
    ],
    primaryAction: {
      label: "Abrir integraciones",
      href: "/settings/integrations",
    },
    secondaryAction: {
      label: "Ver templates sugeridos",
      href: "#wizard-template-gallery",
    },
  },
  {
    id: "collaboration",
    name: "Slack + Teams",
    description: "Arma asistentes internos para soporte, onboarding y operaciones en espacios colaborativos.",
    availabilityLabel: "Conexion real disponible",
    theme: "violet",
    tutorialTitle: "Define la experiencia interna antes de conectar el canal colaborativo",
    tutorialDescription:
      "Slack y Teams todavia no tienen integracion nativa en AgentBuilder. Puedes usar esta fase para acordar permisos, mensajes y criterios operativos mientras el equipo tecnico prepara la app externa.",
    prerequisites: [
      "Decidir si el agente vivira en Slack, Teams o ambos",
      "Identificar el alcance: helpdesk interno, onboarding o soporte operativo",
      "Evitar classic Slack apps y legacy bots; usar Slack apps con OAuth v2",
    ],
    steps: [
      {
        title: "Prepara la app del workspace",
        description:
          "Slack hoy se apoya en Slack apps con OAuth v2. Teams se administra desde Developer Portal y su packaging de app.",
      },
      {
        title: "Alinea permisos y datos visibles",
        description:
          "Define que puede leer o responder el agente dentro del espacio colaborativo antes de fijar el template.",
      },
      {
        title: "Elige el template operativo",
        description:
          "Con el template puedes dejar listo onboarding interno, derivacion humana y tono del agente mientras la integracion real sigue pendiente.",
      },
    ],
    resourceLinks: [
      {
        label: "Slack OAuth v2",
        href: "https://api.slack.com/authentication/oauth-v2",
        external: true,
      },
      {
        label: "Teams Developer Portal",
        href: "https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/manage-your-apps-in-developer-portal",
        external: true,
      },
      {
        label: "Slack classic apps deprecation",
        href: "https://api.slack.com/changelog/2024-04-discontinuing-new-creation-of-classic-slack-apps-and-custom-bots",
        external: true,
      },
    ],
    primaryAction: {
      label: "Abrir guia Slack",
      href: "https://api.slack.com/authentication/oauth-v2",
      external: true,
    },
    secondaryAction: {
      label: "Ver templates sugeridos",
      href: "#wizard-template-gallery",
    },
  },
];

export function getWizardEcosystemById(ecosystemId: WizardEcosystemId): WizardEcosystem {
  const ecosystem = WIZARD_ECOSYSTEMS.find((item) => item.id === ecosystemId);
  return ecosystem ?? WIZARD_ECOSYSTEMS[0];
}



