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
        title: "Vuelve al wizard para elegir el template",
        description:
          "Una vez definida la integracion base, usa uno de los templates para dejar armado el comportamiento inicial del agente.",
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
    tutorialTitle: "Preconfigura el agente mientras defines la app de HubSpot",
    tutorialDescription:
      "La integracion nativa con HubSpot todavia no existe en AgentBuilder. Esta fase sirve para dejar listo el comportamiento del agente y bajar el trabajo de onboarding para cuando la conexion real llegue.",
    prerequisites: [
      "Identificar si el flujo depende de contactos, negocios o tareas",
      "Tener claro el owner y las propiedades minimas a capturar",
      "Preparar una private app o un flujo OAuth fuera de AgentBuilder",
    ],
    steps: [
      {
        title: "Mapea el pipeline o el formulario objetivo",
        description:
          "Alinea que etapas, campos o disparadores necesitan contexto del agente antes de llevarlo a HubSpot.",
      },
      {
        title: "Define el tipo de autenticacion",
        description:
          "HubSpot recomienda preparar la app y los scopes desde su developer platform. Esa configuracion queda fuera de AgentBuilder por ahora.",
      },
      {
        title: "Elige un template y adelanta el setup",
        description:
          "Puedes dejar listas preguntas de calificacion, handoff y seguimiento comercial sin esperar la integracion real.",
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
      label: "Abrir guia oficial",
      href: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide",
      external: true,
    },
    secondaryAction: {
      label: "Ver templates sugeridos",
      href: "#wizard-template-gallery",
    },
  },
  {
    id: "google_workspace",
    name: "Gmail + Calendar",
    description: "Prepara asistentes para inbox y coordinacion operativa sin abrir todavia una integracion real.",
    availabilityLabel: "Conexion real disponible",
    theme: "rose",
    tutorialTitle: "Disena el flujo antes de conectar Gmail o Calendar",
    tutorialDescription:
      "En esta fase AgentBuilder no conecta Gmail ni Google Calendar de forma nativa. El wizard solo te deja adelantado el comportamiento para inbox, agenda y seguimiento operativo.",
    prerequisites: [
      "Elegir si el agente prioriza inbox, agenda o ambas superficies",
      "Tener una cuenta de Google Workspace y proyecto en Google Cloud",
      "Definir permisos y datos minimos que debera leer o proponer",
    ],
    steps: [
      {
        title: "Prepara el proyecto de Google Cloud",
        description:
          "La conexion futura necesitara APIs y credenciales en Google Cloud. Puedes revisarlo ahora mientras dejas listo el onboarding conversacional.",
      },
      {
        title: "Delimita el alcance del agente",
        description:
          "Decide si va a sugerir respuestas de inbox, ordenar prioridades o ayudar a preparar agendamiento y confirmaciones.",
      },
      {
        title: "Avanza con un template base",
        description:
          "El template deja definidos tono, restricciones y checklist inicial para que luego solo falte enchufar la integracion real.",
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
      label: "Abrir guia Gmail",
      href: "https://developers.google.com/workspace/gmail/api/quickstart/js",
      external: true,
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


