export const WHATSAPP_INTENTS = [
  "support",
  "sales",
  "appointment_booking",
  "reminder_follow_up",
  "unknown",
] as const;

export const WHATSAPP_KNOWN_INTENTS = [
  "support",
  "sales",
  "appointment_booking",
  "reminder_follow_up",
] as const;

export const WHATSAPP_INTENT_SOURCES = [
  "heuristic",
  "llm",
  "carryover",
] as const;

export type WhatsAppIntent = (typeof WHATSAPP_INTENTS)[number];
export type WhatsAppKnownIntent = (typeof WHATSAPP_KNOWN_INTENTS)[number];
export type WhatsAppIntentSource = (typeof WHATSAPP_INTENT_SOURCES)[number];

export const WHATSAPP_INTENT_LABELS: Record<WhatsAppKnownIntent, string> = {
  support: "Soporte",
  sales: "Ventas",
  appointment_booking: "Turnos",
  reminder_follow_up: "Recordatorios y seguimiento",
};
