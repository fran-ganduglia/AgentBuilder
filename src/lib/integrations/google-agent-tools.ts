import { z } from "zod";
import type { Json } from "@/types/database";

export const GMAIL_TOOL_ACTIONS = [
  "search_threads",
  "read_thread",
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "archive_thread",
  "apply_label",
] as const;

export const GMAIL_READONLY_TOOL_ACTIONS = [
  "search_threads",
  "read_thread",
] as const;

export const GMAIL_WRITE_TOOL_ACTIONS = [
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "archive_thread",
  "apply_label",
] as const;

export const GOOGLE_CALENDAR_TOOL_ACTIONS = [
  "check_availability",
  "list_events",
  "create_event",
  "reschedule_event",
  "cancel_event",
] as const;

export type GmailToolAction = (typeof GMAIL_TOOL_ACTIONS)[number];
export type GmailReadOnlyToolAction = (typeof GMAIL_READONLY_TOOL_ACTIONS)[number];
export type GmailWriteToolAction = (typeof GMAIL_WRITE_TOOL_ACTIONS)[number];
export type GoogleCalendarToolAction =
  (typeof GOOGLE_CALENDAR_TOOL_ACTIONS)[number];
export type GoogleCalendarAction = GoogleCalendarToolAction;

export type GmailAgentToolConfig = {
  provider: "google";
  surface: "gmail";
  allowed_actions: GmailToolAction[];
};

export type GoogleCalendarAgentToolConfig = {
  provider: "google";
  surface: "google_calendar";
  allowed_actions: GoogleCalendarToolAction[];
};

export const GOOGLE_CALENDAR_READ_TOOL_ACTIONS = [
  "check_availability",
  "list_events",
] as const;

export type GoogleCalendarReadToolAction =
  (typeof GOOGLE_CALENDAR_READ_TOOL_ACTIONS)[number];

export const gmailAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("gmail"),
  allowed_actions: z
    .array(z.enum(GMAIL_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GMAIL_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

export const googleCalendarAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("google_calendar"),
  allowed_actions: z
    .array(z.enum(GOOGLE_CALENDAR_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GOOGLE_CALENDAR_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

const googleCalendarBaseWindowSchema = z.object({
  startIso: z.string().datetime("startIso invalido"),
  endIso: z.string().datetime("endIso invalido"),
  timezone: z.string().trim().min(1, "timezone requerida").max(100, "timezone invalida"),
});

export const executeGoogleCalendarCheckAvailabilitySchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("check_availability"),
    slotMinutes: z.number().int().min(15).max(180).optional(),
  });

export const executeGoogleCalendarListEventsSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("list_events"),
    maxResults: z.number().int().min(1).max(20).optional(),
  });

export const executeGoogleCalendarReadToolSchema = z.discriminatedUnion("action", [
  executeGoogleCalendarCheckAvailabilitySchema,
  executeGoogleCalendarListEventsSchema,
]);

export type ExecuteGoogleCalendarReadToolInput = z.infer<
  typeof executeGoogleCalendarReadToolSchema
>;

export const executeGoogleGmailSearchThreadsSchema = z.object({
  action: z.literal("search_threads"),
  query: z.string().trim().max(120).nullable().optional(),
  maxResults: z.number().int().min(1).max(5).optional(),
});

export const executeGoogleGmailReadThreadSchema = z.object({
  action: z.literal("read_thread"),
  threadId: z.string().trim().min(12).max(128),
});

export const executeGoogleGmailReadToolSchema = z.discriminatedUnion("action", [
  executeGoogleGmailSearchThreadsSchema,
  executeGoogleGmailReadThreadSchema,
]);

export type ExecuteGoogleGmailReadToolInput = z.infer<
  typeof executeGoogleGmailReadToolSchema
>;

const gmailThreadReferenceSchema = {
  threadId: z.string().trim().min(12).max(128),
  messageId: z.string().trim().min(1).max(128),
  rfcMessageId: z.string().trim().min(3).max(255).optional(),
  subject: z.string().trim().min(1).max(160).optional(),
};

const gmailEmailSchema = z.string().trim().toLowerCase().email().max(254);

const gmailRecipientsSchema = {
  to: z.array(gmailEmailSchema).min(1).max(20),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
};

export function dedupeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.toLowerCase().trim()))];
}


export const executeGoogleGmailCreateDraftReplySchema = z.object({
  action: z.literal("create_draft_reply"),
  ...gmailThreadReferenceSchema,
  body: z.string().trim().min(1).max(8000),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
});

export const executeGoogleGmailSendReplySchema = z.object({
  action: z.literal("send_reply"),
  ...gmailThreadReferenceSchema,
  body: z.string().trim().min(1).max(8000),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
});

export const executeGoogleGmailCreateDraftEmailSchema = z.object({
  action: z.literal("create_draft_email"),
  ...gmailRecipientsSchema,
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(8000),
});

export const executeGoogleGmailSendEmailSchema = z.object({
  action: z.literal("send_email"),
  ...gmailRecipientsSchema,
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(8000),
});

export const executeGoogleGmailArchiveThreadSchema = z.object({
  action: z.literal("archive_thread"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailApplyLabelSchema = z.object({
  action: z.literal("apply_label"),
  ...gmailThreadReferenceSchema,
  labelName: z.string().trim().min(1).max(225),
});

export const executeGoogleGmailWriteToolSchema = z.discriminatedUnion("action", [
  executeGoogleGmailCreateDraftReplySchema,
  executeGoogleGmailSendReplySchema,
  executeGoogleGmailCreateDraftEmailSchema,
  executeGoogleGmailSendEmailSchema,
  executeGoogleGmailArchiveThreadSchema,
  executeGoogleGmailApplyLabelSchema,
]);

export type ExecuteGoogleGmailWriteToolInput = z.infer<
  typeof executeGoogleGmailWriteToolSchema
>;

export type ExecuteGoogleGmailToolInput =
  | ExecuteGoogleGmailReadToolInput
  | ExecuteGoogleGmailWriteToolInput;

export const executeGoogleCalendarCreateEventSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("create_event"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(500).optional(),
    attendeeEmails: z.array(z.string().email()).max(20).optional(),
  });

export const executeGoogleCalendarRescheduleEventSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("reschedule_event"),
    eventId: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(200).optional(),
    eventTitle: z.string().trim().min(1).max(200).optional(),
    eventStartIso: z.string().datetime("eventStartIso invalido").optional(),
    eventEndIso: z.string().datetime("eventEndIso invalido").optional(),
    eventTimezone: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(500).optional(),
    attendeeEmails: z.array(z.string().email()).max(20).optional(),
  });

export const executeGoogleCalendarCancelEventSchema = z.object({
  action: z.literal("cancel_event"),
  eventId: z.string().trim().min(1).max(255),
  eventTitle: z.string().trim().min(1).max(200).optional(),
  eventStartIso: z.string().datetime("eventStartIso invalido").optional(),
  eventEndIso: z.string().datetime("eventEndIso invalido").optional(),
  eventTimezone: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(500).optional(),
  attendeeEmails: z.array(z.string().email()).max(20).optional(),
});

export const executeGoogleCalendarWriteToolSchema = z.discriminatedUnion("action", [
  executeGoogleCalendarCreateEventSchema,
  executeGoogleCalendarRescheduleEventSchema,
  executeGoogleCalendarCancelEventSchema,
]);

export type ExecuteGoogleCalendarWriteToolInput = z.infer<
  typeof executeGoogleCalendarWriteToolSchema
>;

export type ExecuteGoogleCalendarToolInput =
  | ExecuteGoogleCalendarReadToolInput
  | ExecuteGoogleCalendarWriteToolInput;

export function getDefaultGmailAgentToolConfig(): GmailAgentToolConfig {
  return {
    provider: "google",
    surface: "gmail",
    allowed_actions: [...GMAIL_READONLY_TOOL_ACTIONS],
  };
}

export function getDefaultGoogleCalendarAgentToolConfig(): GoogleCalendarAgentToolConfig {
  return {
    provider: "google",
    surface: "google_calendar",
    allowed_actions: [...GOOGLE_CALENDAR_TOOL_ACTIONS],
  };
}

export function parseGmailAgentToolConfig(
  value: Json | null | undefined
): GmailAgentToolConfig | null {
  const parsed = gmailAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGoogleCalendarAgentToolConfig(
  value: Json | null | undefined
): GoogleCalendarAgentToolConfig | null {
  const parsed = googleCalendarAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isGoogleCalendarReadAction(
  action: GoogleCalendarToolAction
): action is GoogleCalendarReadToolAction {
  return GOOGLE_CALENDAR_READ_TOOL_ACTIONS.includes(
    action as GoogleCalendarReadToolAction
  );
}

export function isGoogleCalendarActionAllowed(
  config: GoogleCalendarAgentToolConfig,
  action: GoogleCalendarToolAction
): boolean {
  return config.allowed_actions.includes(action);
}

export function getGmailActionLabel(action: GmailToolAction): string {
  const labels: Record<GmailToolAction, string> = {
    search_threads: "Buscar threads",
    read_thread: "Leer thread",
    create_draft_reply: "Crear borrador de respuesta",
    create_draft_email: "Crear borrador nuevo",
    send_reply: "Enviar respuesta",
    send_email: "Enviar email nuevo",
    archive_thread: "Archivar thread",
    apply_label: "Aplicar label",
  };

  return labels[action];
}

export function getGmailActionDescription(action: GmailToolAction): string {
  const descriptions: Record<GmailToolAction, string> = {
    search_threads: "Busca hilos recientes con metadata segura, headers utiles y snippet truncado sin body completo.",
    read_thread: "Resume un hilo con metadata, headers, snippets y conteo de adjuntos, sin exponer body ni HTML.",
    create_draft_reply: "Crea un borrador real de respuesta en Gmail despues de pasar por approval inbox y worker async.",
    create_draft_email: "Crea un borrador de email nuevo con destinatarios libres despues de aprobacion humana.",
    send_reply: "Envia una respuesta real sobre un hilo existente despues de aprobacion humana.",
    send_email: "Envia un email nuevo con destinatarios libres despues de aprobacion humana.",
    archive_thread: "Archiva el thread real quitandolo de Inbox despues de aprobacion humana.",
    apply_label: "Aplica un label existente al thread real despues de aprobacion humana.",
  };

  return descriptions[action];
}

export function isGmailReadOnlyAction(
  action: GmailToolAction
): action is GmailReadOnlyToolAction {
  return GMAIL_READONLY_TOOL_ACTIONS.includes(action as GmailReadOnlyToolAction);
}

export function isGmailWriteAction(
  action: GmailToolAction
): action is GmailWriteToolAction {
  return GMAIL_WRITE_TOOL_ACTIONS.includes(action as GmailWriteToolAction);
}

export const GMAIL_STANDALONE_ACTIONS = [
  "create_draft_email",
  "send_email",
] as const;

export type GmailStandaloneAction = (typeof GMAIL_STANDALONE_ACTIONS)[number];

export function isGmailStandaloneAction(
  action: string
): action is GmailStandaloneAction {
  return GMAIL_STANDALONE_ACTIONS.includes(action as GmailStandaloneAction);
}

export const GMAIL_THREAD_WRITE_ACTIONS = [
  "create_draft_reply",
  "send_reply",
  "archive_thread",
  "apply_label",
] as const;

export type GmailThreadWriteAction = (typeof GMAIL_THREAD_WRITE_ACTIONS)[number];

export function isGmailThreadWriteAction(
  action: string
): action is GmailThreadWriteAction {
  return GMAIL_THREAD_WRITE_ACTIONS.includes(action as GmailThreadWriteAction);
}

export const gmailEditableApprovalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_draft_reply"),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
  }),
  z.object({
    action: z.literal("send_reply"),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
  }),
  z.object({
    action: z.literal("create_draft_email"),
    to: z.array(gmailEmailSchema).min(1).max(20),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
  }),
  z.object({
    action: z.literal("send_email"),
    to: z.array(gmailEmailSchema).min(1).max(20),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
  }),
]);

export function getGoogleCalendarActionLabel(
  action: GoogleCalendarToolAction
): string {
  const labels: Record<GoogleCalendarToolAction, string> = {
    check_availability: "Ver disponibilidad",
    list_events: "Listar eventos",
    create_event: "Crear evento",
    reschedule_event: "Reprogramar evento",
    cancel_event: "Cancelar evento",
  };

  return labels[action];
}

export function getGoogleCalendarActionDescription(
  action: GoogleCalendarToolAction
): string {
  const descriptions: Record<GoogleCalendarToolAction, string> = {
    check_availability: "Consulta disponibilidad agregada con una sola llamada tipo free/busy.",
    list_events: "Lista eventos compactos en una ventana de tiempo acotada.",
    create_event: "Crea eventos reales despues de confirmacion conversacional.",
    reschedule_event: "Reprograma eventos existentes despues de confirmacion conversacional.",
    cancel_event: "Cancela eventos reales despues de confirmacion conversacional.",
  };

  return descriptions[action];
}
