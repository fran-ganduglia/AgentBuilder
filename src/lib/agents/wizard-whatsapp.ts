import type { WizardTutorialLink } from "@/lib/agents/wizard-ecosystems";

export type WhatsAppWizardTutorialStep = {
  title: string;
  description: string;
  link?: WizardTutorialLink;
};

export const WHATSAPP_WIZARD_SUMMARY =
  "Conectas la misma integracion real de WhatsApp Cloud API que luego usa tu organizacion para que un solo agente inteligente responda mensajes reales del numero conectado.";

export const WHATSAPP_WIZARD_BENEFITS = [
  "La conexion deja listo el numero para que el auto-reply asincrono opere desde el worker, sin usar chat local operativo.",
  "Si la validacion falla o prefieres dejarla para despues, igual puedes crear el borrador del agente inteligente y terminar el setup mas tarde.",
];

export const WHATSAPP_WIZARD_TUTORIAL_STEPS: WhatsAppWizardTutorialStep[] = [
  {
    title: "Ubica el WABA ID",
    description: "Entra a Meta Developers y confirma que estas parado en la app y la cuenta de WhatsApp Business correctas antes de copiar el identificador.",
    link: {
      label: "Abrir guia oficial de Cloud API",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
      external: true,
    },
  },
  {
    title: "Copia el access token y revisa API Setup",
    description: "Desde el mismo flujo de Cloud API toma el token vigente que usaras para validar la conexion y descubrir las fuentes disponibles.",
    link: {
      label: "Ir a API Setup en la doc",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
      external: true,
    },
  },
  {
    title: "Busca el App secret en Meta",
    description: "Abre App Settings > Basic dentro de Meta Developers para encontrar el secreto de la app que firmara el webhook.",
    link: {
      label: "Ver Basic Settings",
      href: "https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/",
      external: true,
    },
  },
  {
    title: "Define tu verify token",
    description: "Crea un valor propio, guardalo en un lugar seguro y usa exactamente el mismo token cuando configures el webhook en Meta.",
    link: {
      label: "Referencia de verificacion de webhooks",
      href: "https://developers.facebook.com/docs/graph-api/webhooks/getting-started/",
      external: true,
    },
  },
];
