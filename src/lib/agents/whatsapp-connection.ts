import type { WizardTutorialLink } from "@/lib/agents/wizard-ecosystems";
import type { Integration } from "@/types/app";
import type { Json } from "@/types/database";

export type WhatsAppConnectionView = {
  initialName: string;
  initialWabaId: string;
  isConnected: boolean;
  accessTokenHint: string | null;
};

export type WhatsAppConnectionFieldKey = "wabaId" | "accessToken" | "appSecret" | "verifyToken";

export type WhatsAppConnectionFieldHelp = {
  description: string;
  link?: WizardTutorialLink;
};

export const WHATSAPP_CONNECTION_FIELD_HELP: Record<
  WhatsAppConnectionFieldKey,
  WhatsAppConnectionFieldHelp
> = {
  wabaId: {
    description: "Lo encuentras en Meta dentro de WhatsApp > API Setup o desde la cuenta de WhatsApp Business asociada.",
    link: {
      label: "Donde ver el WABA ID",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
      external: true,
    },
  },
  accessToken: {
    description: "Usa el access token de Cloud API que Meta muestra en API Setup para validar la cuenta y listar fuentes.",
    link: {
      label: "Guia de access token",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/",
      external: true,
    },
  },
  appSecret: {
    description: "Sale de la configuracion basica de tu app en Meta Developers. Lo usamos para firmar y validar webhooks.",
    link: {
      label: "Abrir App Settings > Basic",
      href: "https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/",
      external: true,
    },
  },
  verifyToken: {
    description: "Lo defines tu equipo. Debe ser exactamente el mismo valor que cargues despues en la configuracion del webhook de Meta.",
  },
};

export function createWhatsAppConnectionView(
  integration: Integration | null | undefined
): WhatsAppConnectionView {
  return {
    initialName: integration?.name ?? "WhatsApp Cloud API",
    initialWabaId: getJsonStringValue(integration?.metadata ?? null, "waba_id") ?? "",
    isConnected: Boolean(integration),
    accessTokenHint: getJsonStringValue(integration?.metadata ?? null, "access_token_hint"),
  };
}

function getJsonStringValue(metadata: Json | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Reflect.get(metadata, key);
  return typeof value === "string" ? value : null;
}
