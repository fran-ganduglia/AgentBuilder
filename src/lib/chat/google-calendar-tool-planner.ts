import "server-only";

import type {
  ExecuteGoogleCalendarToolInput,
  ExecuteGoogleCalendarWriteToolInput,
  GoogleCalendarAgentToolConfig,
  GoogleCalendarReadToolAction,
} from "@/lib/integrations/google-agent-tools";

type PlannerMessage = {
  role: "user" | "assistant";
  content: string;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type ParsedRecentToolContext = {
  action: GoogleCalendarReadToolAction | null;
  windowStart: string | null;
  windowEnd: string | null;
  timezone: string | null;
  recentEvents: Array<{
    id: string;
    title: string | null;
    startIso: string | null;
    endIso: string | null;
  }>;
};

type EventMatchResolution =
  | {
      kind: "match";
      event: ParsedRecentToolContext["recentEvents"][number];
    }
  | {
      kind: "missing";
    }
  | {
      kind: "ambiguous";
      candidates: ParsedRecentToolContext["recentEvents"];
    };

export type GoogleCalendarPlannerDecision =
  | { kind: "respond" }
  | { kind: "missing_data"; message: string }
  | {
      kind: "action";
      requiresConfirmation: boolean;
      input: ExecuteGoogleCalendarToolInput;
    };

const WEEKDAY_TO_INDEX = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
} as const;

const SPANISH_WEEKDAY_ALIASES: Array<{
  key: keyof typeof WEEKDAY_TO_INDEX;
  pattern: RegExp;
}> = [
  { key: "monday", pattern: /\b(?:el\s+)?lunes\b/i },
  { key: "tuesday", pattern: /\b(?:el\s+)?martes\b/i },
  { key: "wednesday", pattern: /\b(?:el\s+)?miercoles\b|\b(?:el\s+)?miércoles\b/i },
  { key: "thursday", pattern: /\b(?:el\s+)?jueves\b/i },
  { key: "friday", pattern: /\b(?:el\s+)?viernes\b/i },
  { key: "saturday", pattern: /\b(?:el\s+)?sabado\b|\b(?:el\s+)?sábado\b/i },
  { key: "sunday", pattern: /\b(?:el\s+)?domingo\b/i },
];

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getZonedDateParts(date: Date, timezone: string): LocalDateParts & {
  weekday: keyof typeof WEEKDAY_TO_INDEX;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const weekdayValue = parts.find((part) => part.type === "weekday")?.value.toLowerCase();
  const weekday = (Object.keys(WEEKDAY_TO_INDEX).find(
    (key) => key === weekdayValue
  ) ?? "monday") as keyof typeof WEEKDAY_TO_INDEX;

  return { year, month, day, weekday };
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  return asUtc - date.getTime();
}

function zonedDateTimeToUtcMs(
  parts: LocalDateParts & { hour: number; minute: number; second?: number; millisecond?: number },
  timezone: string
): number {
  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    parts.millisecond ?? 0
  );

  for (let index = 0; index < 4; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timezone);
    const adjusted = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
      parts.millisecond ?? 0
    ) - offsetMs;

    if (adjusted === utcMs) {
      break;
    }

    utcMs = adjusted;
  }

  return utcMs;
}

function addDays(date: LocalDateParts, days: number): LocalDateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function buildDayWindow(date: LocalDateParts, timezone: string): {
  startIso: string;
  endIso: string;
} {
  const startMs = zonedDateTimeToUtcMs(
    { ...date, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timezone
  );
  const nextDayStartMs = zonedDateTimeToUtcMs(
    { ...addDays(date, 1), hour: 0, minute: 0, second: 0, millisecond: 0 },
    timezone
  );

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(nextDayStartMs - 1).toISOString(),
  };
}

function buildWeekWindow(today: LocalDateParts, weekdayIndex: number, timezone: string): {
  startIso: string;
  endIso: string;
} {
  const monday = addDays(today, -weekdayIndex);
  const nextMonday = addDays(monday, 7);
  const startMs = zonedDateTimeToUtcMs(
    { ...monday, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timezone
  );
  const endMs = zonedDateTimeToUtcMs(
    { ...nextMonday, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timezone
  ) - 1;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function buildRangeFromRecentContext(
  recentToolContext: string | undefined
): { startIso: string; endIso: string } | null {
  if (!recentToolContext) {
    return null;
  }

  const parsed = parseRecentGoogleCalendarToolContext(recentToolContext);
  if (!parsed.windowStart || !parsed.windowEnd) {
    return null;
  }

  const startMs = new Date(parsed.windowStart).getTime();
  const endMs = new Date(parsed.windowEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const durationMs = endMs - startMs + 1;
  const nextStartMs = endMs + 1;
  const nextEndMs = nextStartMs + durationMs - 1;

  return {
    startIso: new Date(nextStartMs).toISOString(),
    endIso: new Date(nextEndMs).toISOString(),
  };
}

const TEMPORAL_REF_PATTERN =
  /\bhoy\b|\bmanana\b|\bmañana\b|\besta semana\b|\bpasado manana\b|\bpasado mañana\b|\blunes\b|\bmartes\b|\bmiercoles\b|\bmiércoles\b|\bjueves\b|\bviernes\b|\bsabado\b|\bsábado\b|\bdomingo\b|\b\d{4}-\d{2}-\d{2}\b|\bpr[oó]ximos?\s+\d+\s+d[ií]as?\b/i;

function resolveReadAction(
  latestUserMessage: string,
  config: GoogleCalendarAgentToolConfig,
  recentToolContext?: string
): GoogleCalendarReadToolAction | null {
  const availabilityAllowed = config.allowed_actions.includes("check_availability");
  const listAllowed = config.allowed_actions.includes("list_events");
  const asksForAvailability =
    /\b(disponibilidad|disponible|libre|libres|hueco|huecos|agenda libre|ocupad[oa]s?)\b/i.test(
      latestUserMessage
    );
  const asksForEvents =
    /\b(evento|eventos|reunion|reuniones|meeting|meetings|calendario|agenda)\b/i.test(
      latestUserMessage
    );

  if (!availabilityAllowed && !listAllowed) {
    return null;
  }

  const parsedRecentContext = parseRecentGoogleCalendarToolContext(recentToolContext);
  const asksForAfterThat = /\bdespues de eso\b|\bdespués de eso\b|\bluego de eso\b/i.test(
    latestUserMessage
  );

  if (asksForAfterThat && parsedRecentContext.action) {
    return config.allowed_actions.includes(parsedRecentContext.action)
      ? parsedRecentContext.action
      : null;
  }

  if (asksForEvents) {
    return listAllowed ? "list_events" : null;
  }

  if (asksForAvailability) {
    return availabilityAllowed ? "check_availability" : null;
  }

  if (!TEMPORAL_REF_PATTERN.test(latestUserMessage)) {
    return null;
  }

  if (availabilityAllowed) {
    return "check_availability";
  }

  return listAllowed ? "list_events" : null;
}

function resolveWriteAction(
  latestUserMessage: string,
  config: GoogleCalendarAgentToolConfig
): ExecuteGoogleCalendarWriteToolInput["action"] | null {
  if (
    config.allowed_actions.includes("reschedule_event") &&
    /\breprogram|mover|pasar .* otra hora|cambiar .* horario|cambiar .* fecha/i.test(
      latestUserMessage
    )
  ) {
    return "reschedule_event";
  }

  if (
    config.allowed_actions.includes("cancel_event") &&
    /\bcancel|anula|suspende|borra .* evento/i.test(latestUserMessage)
  ) {
    return "cancel_event";
  }

  if (
    config.allowed_actions.includes("create_event") &&
    /\bcrear|agenda|agendar|programa|programar|organiza|organizar\b/i.test(
      latestUserMessage
    )
  ) {
    return "create_event";
  }

  return null;
}

function resolveWindowFromAbsoluteDate(
  latestUserMessage: string,
  timezone: string
): { startIso: string; endIso: string } | null {
  const dateMatches = [...latestUserMessage.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(
    (match) => match[1]
  );

  if (dateMatches.length === 0) {
    return null;
  }

  const [firstDate, secondDate] = dateMatches;
  const [startYear, startMonth, startDay] = firstDate.split("-").map(Number);
  const startWindow = buildDayWindow(
    { year: startYear, month: startMonth, day: startDay },
    timezone
  );

  if (!secondDate) {
    return startWindow;
  }

  const [endYear, endMonth, endDay] = secondDate.split("-").map(Number);
  return {
    startIso: startWindow.startIso,
    endIso: buildDayWindow(
      { year: endYear, month: endMonth, day: endDay },
      timezone
    ).endIso,
  };
}

function resolveWindowFromRelativeDate(input: {
  latestUserMessage: string;
  timezone: string;
  now?: Date;
  recentToolContext?: string;
}): { startIso: string; endIso: string } | null {
  const normalizedMessage = input.latestUserMessage.toLowerCase();
  const zonedToday = getZonedDateParts(input.now ?? new Date(), input.timezone);

  if (/\bhoy\b/i.test(normalizedMessage)) {
    return buildDayWindow(zonedToday, input.timezone);
  }

  if (/\bpasado manana\b|\bpasado mañana\b/i.test(normalizedMessage)) {
    return buildDayWindow(addDays(zonedToday, 2), input.timezone);
  }

  if (/\bmanana\b|\bmañana\b/i.test(normalizedMessage)) {
    return buildDayWindow(addDays(zonedToday, 1), input.timezone);
  }

  if (/\besta semana\b/i.test(normalizedMessage)) {
    return buildWeekWindow(
      zonedToday,
      WEEKDAY_TO_INDEX[zonedToday.weekday],
      input.timezone
    );
  }

  const weekdayMatch = SPANISH_WEEKDAY_ALIASES.find((entry) =>
    entry.pattern.test(input.latestUserMessage)
  );
  if (weekdayMatch) {
    const todayIndex = WEEKDAY_TO_INDEX[zonedToday.weekday];
    const targetIndex = WEEKDAY_TO_INDEX[weekdayMatch.key];
    const delta = targetIndex >= todayIndex
      ? targetIndex - todayIndex
      : 7 - (todayIndex - targetIndex);

    return buildDayWindow(addDays(zonedToday, delta), input.timezone);
  }

  if (/\bdespues de eso\b|\bdespués de eso\b|\bluego de eso\b/i.test(input.latestUserMessage)) {
    return buildRangeFromRecentContext(input.recentToolContext);
  }

  const proximosDiasMatch = normalizedMessage.match(/\bpr[oó]ximos?\s+(\d+)\s+d[ií]as?\b/i);
  if (proximosDiasMatch) {
    const n = Math.min(parseInt(proximosDiasMatch[1], 10), 31);
    if (n > 0) {
      const endDate = addDays(zonedToday, n - 1);
      return {
        startIso: buildDayWindow(zonedToday, input.timezone).startIso,
        endIso: buildDayWindow(endDate, input.timezone).endIso,
      };
    }
  }

  return null;
}

function buildMissingDateMessage(timezone: string | null): string {
  if (!timezone) {
    return "Para consultar Google Calendar necesito una timezone confiable del agente o una fecha/hora mas especifica del usuario.";
  }

  return `Para consultar Google Calendar necesito una ventana temporal explicita. Indica una fecha o rango claro, por ejemplo "manana", "esta semana" o "el viernes" (timezone ${timezone}).`;
}

function buildMissingTitleMessage(): string {
  return 'Para crear el evento necesito un titulo claro, por ejemplo: "crea una reunion \"Demo ACME\" manana de 15 a 16".';
}

function extractTitle(latestUserMessage: string): string | null {
  const quoted =
    latestUserMessage.match(/"([^"]{3,200})"/)?.[1]?.trim() ??
    latestUserMessage.match(/'([^']{3,200})'/)?.[1]?.trim() ??
    null;

  if (quoted) {
    return quoted;
  }

  const normalized = latestUserMessage
    .replace(/\b(crea|crear|agenda|agendar|programa|programar|organiza|organizar)\b/gi, "")
    .replace(/\b(reunion|reunión|evento|llamada|meeting)\b/gi, "")
    .replace(/\b(hoy|manana|mañana|pasado manana|pasado mañana|esta semana)\b/gi, "")
    .replace(/\bde\s+\d{1,2}(?::\d{2})?\s*(?:a|hasta)\s+\d{1,2}(?::\d{2})?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length >= 3 ? normalized.slice(0, 200) : null;
}

function extractTimeRange(
  latestUserMessage: string,
  timezone: string,
  baseDate: LocalDateParts
): { startIso: string; endIso: string } | null {
  const normalizeHour = (hour: number, meridiem: string | null): number => {
    if (!meridiem) {
      return hour;
    }

    if (meridiem === "pm" && hour < 12) {
      return hour + 12;
    }

    if (meridiem === "am" && hour === 12) {
      return 0;
    }

    return hour;
  };

  const buildRange = (
    startHourRaw: number,
    startMinute: number,
    startMeridiem: string | null,
    endHourRaw: number,
    endMinute: number,
    endMeridiem: string | null
  ): { startIso: string; endIso: string } | null => {
    const startHour = normalizeHour(startHourRaw, startMeridiem);
    const endHour = normalizeHour(endHourRaw, endMeridiem ?? startMeridiem);
    const startMs = zonedDateTimeToUtcMs(
      { ...baseDate, hour: startHour, minute: startMinute, second: 0, millisecond: 0 },
      timezone
    );
    const endMs = zonedDateTimeToUtcMs(
      { ...baseDate, hour: endHour, minute: endMinute, second: 0, millisecond: 0 },
      timezone
    );

    if (endMs <= startMs) {
      return null;
    }

    return {
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
    };
  };

  const rangeMatches = [
    ...latestUserMessage.matchAll(
      /\b(?:de\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|hasta)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi
    ),
  ];

  if (rangeMatches.length > 0) {
    const rangeMatch = rangeMatches[rangeMatches.length - 1];
    return buildRange(
      Number(rangeMatch[1]),
      Number(rangeMatch[2] ?? "0"),
      rangeMatch[3]?.toLowerCase() ?? null,
      Number(rangeMatch[4]),
      Number(rangeMatch[5] ?? "0"),
      rangeMatch[6]?.toLowerCase() ?? null
    );
  }

  const timeMatches = [
    ...latestUserMessage.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi),
  ];

  if (timeMatches.length < 2) {
    return null;
  }

  const startMatch = timeMatches[timeMatches.length - 2];
  const endMatch = timeMatches[timeMatches.length - 1];

  return buildRange(
    Number(startMatch[1]),
    Number(startMatch[2] ?? "0"),
    startMatch[3]?.toLowerCase() ?? null,
    Number(endMatch[1]),
    Number(endMatch[2] ?? "0"),
    endMatch[3]?.toLowerCase() ?? null
  );
}

function extractAttendeeEmails(latestUserMessage: string): string[] | undefined {
  const matches = [...latestUserMessage.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)]
    .map((match) => match[0].trim().toLowerCase());
  const unique = [...new Set(matches)].slice(0, 20);

  return unique.length > 0 ? unique : undefined;
}

function extractDescription(latestUserMessage: string): string | undefined {
  const explicitMatch =
    latestUserMessage.match(/\b(?:descripcion|descripción|nota|detalle)\s*[:\-]?\s*(.+)$/i)?.[1]?.trim() ??
    latestUserMessage.match(/\bcon\s+(?:descripcion|descripción|nota|detalle)\s+(.+)$/i)?.[1]?.trim() ??
    null;

  if (!explicitMatch) {
    return undefined;
  }

  const cleaned = explicitMatch
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  return cleaned.length > 0 ? cleaned : undefined;
}

function extractLocation(latestUserMessage: string): string | undefined {
  const explicitLocation =
    latestUserMessage.match(/\b(?:ubicacion|ubicación|lugar)\s*[:\-]?\s*(.+?)(?=(?:\s+\b(?:con\b|para\b|descripcion\b|descripción\b|nota\b|detalle\b)\b|$))/i)?.[1]?.trim() ??
    latestUserMessage.match(/\ben\s+(.+?)(?=(?:\s+\b(?:con\b|para\b|descripcion\b|descripción\b|nota\b|detalle\b)\b|$))/i)?.[1]?.trim() ??
    null;

  if (!explicitLocation) {
    return undefined;
  }

  const cleaned = explicitLocation
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  if (cleaned.length < 2) {
    return undefined;
  }

  const normalized = normalizeForMatch(cleaned);
  if (
    normalized === "google calendar" ||
    normalized === "calendar" ||
    normalized === "el calendario"
  ) {
    return undefined;
  }

  return cleaned;
}

function extractFlexibleDescription(latestUserMessage: string): string | undefined {
  const explicitMatch = [
    extractDescription(latestUserMessage),
    latestUserMessage.match(/\b(?:agrega|suma|incluye)\s+(?:una\s+)?(?:nota|detalle|descripcion|descripciÃ³n)(?:\s+que\s+diga)?\s*[:\-]?\s*(.+)$/i)?.[1]?.trim() ?? null,
    latestUserMessage.match(/\b(?:aclaracion|aclaraciÃ³n)\s*[:\-]?\s*(.+)$/i)?.[1]?.trim() ?? null,
  ].find((value) => value && value.length > 0) ?? null;

  if (!explicitMatch) {
    return undefined;
  }

  const cleaned = explicitMatch
    .replace(/^\s*que\s+diga\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
  return cleaned.length > 0 ? cleaned : undefined;
}

function extractFlexibleLocation(latestUserMessage: string): string | undefined {
  const explicitLocation = [
    extractLocation(latestUserMessage),
    latestUserMessage.match(/\b(?:por|via|vÃ­a)\s+(.+?)(?=(?:\s+\b(?:con\b|para\b|descripcion\b|descripciÃ³n\b|nota\b|detalle\b|aclaracion\b|aclaraciÃ³n\b|invita\b|invitÃ¡\b|invitar\b|agrega\b|sumale\b|suma\b|incluye\b)\b|$))/i)?.[1]?.trim() ?? null,
  ].find((value) => value && value.length > 0) ?? null;

  if (!explicitLocation) {
    return undefined;
  }

  const cleaned = explicitLocation.replace(/\s+/g, " ").trim().slice(0, 500);
  if (cleaned.length < 2) {
    return undefined;
  }

  return cleaned;
}

function extractWriteContext(latestUserMessage: string): {
  description?: string;
  location?: string;
  attendeeEmails?: string[];
} {
  const description = extractFlexibleDescription(latestUserMessage);
  const location = extractFlexibleLocation(latestUserMessage);
  const attendeeEmails = extractAttendeeEmails(latestUserMessage);

  return {
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(attendeeEmails ? { attendeeEmails } : {}),
  };
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOrdinalReference(message: string): number | null {
  const normalized = normalizeForMatch(message);

  if (/\b(ultimo|ultima)\b/.test(normalized)) {
    return -1;
  }

  if (/\b(primer|primero|primera|1|uno)\b/.test(normalized)) {
    return 0;
  }

  if (/\b(segundo|segunda|2|dos)\b/.test(normalized)) {
    return 1;
  }

  if (/\b(tercer|tercero|tercera|3|tres)\b/.test(normalized)) {
    return 2;
  }

  return null;
}

function extractMentionedDateStrings(message: string): string[] {
  const matches = [...message.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)];
  return matches.map((match) => match[1]);
}

function extractMentionedClockTimes(message: string): string[] {
  return [...message.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi)].map((match) => {
    const rawHour = Number(match[1]);
    const minute = match[2] ?? "00";
    const meridiem = match[3]?.toLowerCase() ?? null;

    let hour = rawHour;
    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    } else if (meridiem === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}:${minute}`;
  });
}

function formatEventLocalParts(
  event: ParsedRecentToolContext["recentEvents"][number],
  timezone: string | null
): { date: string | null; time: string | null } {
  if (!event.startIso || !timezone || !isValidTimezone(timezone)) {
    return { date: null, time: null };
  }

  const startDate = new Date(event.startIso);
  if (Number.isNaN(startDate.getTime())) {
    return { date: null, time: null };
  }

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(startDate);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(startDate);

  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const hour = timeParts.find((part) => part.type === "hour")?.value ?? "";
  const minute = timeParts.find((part) => part.type === "minute")?.value ?? "";

  return {
    date: year && month && day ? `${year}-${month}-${day}` : null,
    time: hour && minute ? `${hour}:${minute}` : null,
  };
}

function extractLooseEventTitleHint(message: string): string | null {
  const normalized = normalizeForMatch(message)
    .replace(/\b(reprogramar|reprograma|mover|move|pasar|cambiar|cancelar|cancela|anular|anula|suspender|suspende|borrar|borra|evento|reunion|meeting|llamada)\b/g, " ")
    .replace(/\b(hoy|manana|esta|semana|de|del|la|las|el|los|para|que|entre|y|a|al|con)\b/g, " ")
    .replace(/\b\d{4} \d{2} \d{2}\b/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length >= 3 ? normalized : null;
}

function scoreEventAgainstMessage(input: {
  event: ParsedRecentToolContext["recentEvents"][number];
  timezone: string | null;
  quotedTitle: string | null;
  titleHint: string | null;
  mentionedDates: string[];
  mentionedTimes: string[];
}): number {
  let score = 0;
  const normalizedEventTitle = normalizeForMatch(input.event.title ?? "");
  const { date, time } = formatEventLocalParts(input.event, input.timezone);

  if (input.quotedTitle && normalizedEventTitle) {
    if (normalizedEventTitle === input.quotedTitle) {
      score += 10;
    } else if (normalizedEventTitle.includes(input.quotedTitle)) {
      score += 6;
    }
  }

  if (input.titleHint && normalizedEventTitle) {
    if (normalizedEventTitle.includes(input.titleHint)) {
      score += 5;
    } else {
      const hintTokens = input.titleHint.split(" ").filter((token) => token.length >= 3);
      const matchedTokens = hintTokens.filter((token) => normalizedEventTitle.includes(token));
      score += matchedTokens.length;
    }
  }

  if (date && input.mentionedDates.includes(date)) {
    score += 3;
  }

  if (time && input.mentionedTimes.includes(time)) {
    score += 3;
  }

  return score;
}

function buildEventDisambiguationMessage(
  candidates: ParsedRecentToolContext["recentEvents"],
  timezone: string | null
): string {
  const lines = candidates.slice(0, 3).map((event) => {
    const local = formatEventLocalParts(event, timezone);
    const title = event.title ?? "Evento sin titulo";
    const when =
      local.date && local.time
        ? `${local.date} ${local.time}`
        : event.startIso ?? "sin horario";

    return `- "${title}" (${when}) [id ${event.id}]`;
  });

  return [
    "Encontre varios eventos posibles. Decime cual es con el titulo exacto entre comillas, el id del evento o su posicion en la lista reciente.",
    ...lines,
  ].join("\n");
}

function buildResolvedEventDetails(
  event: ParsedRecentToolContext["recentEvents"][number],
  timezone: string | null
): {
  eventTitle?: string;
  eventStartIso?: string;
  eventEndIso?: string;
  eventTimezone?: string;
} {
  return {
    ...(event.title ? { eventTitle: event.title } : {}),
    ...(event.startIso ? { eventStartIso: event.startIso } : {}),
    ...(event.endIso ? { eventEndIso: event.endIso } : {}),
    ...(timezone ? { eventTimezone: timezone } : {}),
  };
}

function getBaseDateFromIso(
  value: string | null | undefined,
  timezone: string
): LocalDateParts | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const zoned = getZonedDateParts(date, timezone);
  return {
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
  };
}

function resolveEventMatch(
  latestUserMessage: string,
  recentToolContext?: string
): EventMatchResolution {
  const parsed = parseRecentGoogleCalendarToolContext(recentToolContext);
  if (parsed.recentEvents.length === 0) {
    return { kind: "missing" };
  }

  const explicitEventId =
    latestUserMessage.match(/\bevento\s+id\s+([A-Za-z0-9_\-@]+)\b/i)?.[1] ??
    latestUserMessage.match(/\bid(?:\s+del\s+evento)?\s+([A-Za-z0-9_\-@]+)\b/i)?.[1] ??
    null;

  if (explicitEventId) {
    return {
      kind: "match",
      event:
        parsed.recentEvents.find((event) => event.id === explicitEventId) ?? {
          id: explicitEventId,
          title: null,
          startIso: null,
          endIso: null,
        },
    };
  }

  const ordinalReference = extractOrdinalReference(latestUserMessage);
  if (ordinalReference !== null) {
    const event =
      ordinalReference === -1
        ? parsed.recentEvents[parsed.recentEvents.length - 1]
        : parsed.recentEvents[ordinalReference];
    return event ? { kind: "match", event } : { kind: "missing" };
  }

  const quotedTitle =
    normalizeForMatch(
      latestUserMessage.match(/"([^"]{2,200})"/)?.[1]?.trim() ??
        latestUserMessage.match(/'([^']{2,200})'/)?.[1]?.trim() ??
        ""
    ) || null;

  if (quotedTitle) {
    const titleMatches = parsed.recentEvents.filter((event) => {
      const normalizedTitle = normalizeForMatch(event.title ?? "");
      return normalizedTitle.length > 0 && normalizedTitle.includes(quotedTitle);
    });

    if (titleMatches.length === 1) {
      return { kind: "match", event: titleMatches[0] };
    }

    if (titleMatches.length > 1) {
      return { kind: "ambiguous", candidates: titleMatches };
    }
  }

  if (parsed.recentEvents.length === 1) {
    return { kind: "match", event: parsed.recentEvents[0] };
  }

  const titleHint = extractLooseEventTitleHint(latestUserMessage);
  const mentionedDates = extractMentionedDateStrings(latestUserMessage);
  const mentionedTimes = extractMentionedClockTimes(latestUserMessage);
  const scored = parsed.recentEvents
    .map((event) => ({
      event,
      score: scoreEventAgainstMessage({
        event,
        timezone: parsed.timezone,
        quotedTitle,
        titleHint,
        mentionedDates,
        mentionedTimes,
      }),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return { kind: "ambiguous", candidates: parsed.recentEvents };
  }

  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return { kind: "match", event: scored[0].event };
  }

  return {
    kind: "ambiguous",
    candidates: scored
      .filter((candidate) => candidate.score === scored[0].score)
      .map((candidate) => candidate.event),
  };
}

function buildMissingEventMessage(
  action: "reschedule_event" | "cancel_event",
  recentToolContext?: string
): string {
  const parsed = parseRecentGoogleCalendarToolContext(recentToolContext);
  const verb =
    action === "cancel_event"
      ? "cancelar"
      : "reprogramar";

  if (parsed.recentEvents.length === 0) {
    return `Para ${verb} un evento primero necesito que listemos eventos recientes o que me indiques el id exacto del evento.`;
  }

  return buildEventDisambiguationMessage(parsed.recentEvents, parsed.timezone);
}

function buildAmbiguousEventMessage(
  action: "reschedule_event" | "cancel_event",
  candidates: ParsedRecentToolContext["recentEvents"],
  recentToolContext?: string
): string {
  const parsed = parseRecentGoogleCalendarToolContext(recentToolContext);
  if (candidates.length === 0) {
    return buildMissingEventMessage(action, recentToolContext);
  }

  return buildEventDisambiguationMessage(candidates, parsed.timezone);
}

export function parseRecentGoogleCalendarToolContext(
  recentToolContext?: string
): ParsedRecentToolContext {
  if (!recentToolContext) {
    return {
      action: null,
      windowStart: null,
      windowEnd: null,
      timezone: null,
      recentEvents: [],
    };
  }

  const actionMatch = recentToolContext.match(/^action=(.+)$/m)?.[1]?.trim() ?? null;
  const windowStart = recentToolContext.match(/^window_start=(.+)$/m)?.[1]?.trim() ?? null;
  const windowEnd = recentToolContext.match(/^window_end=(.+)$/m)?.[1]?.trim() ?? null;
  const timezone = recentToolContext.match(/^timezone=(.+)$/m)?.[1]?.trim() ?? null;
  const recentEvents = [...recentToolContext.matchAll(/^event_(\d+)=(.+)$/gm)].map(
    (match) => {
      const [, , rawValue] = match;
      const [id, title, startIso, endIso] = rawValue.split("|");
      return {
        id: id?.trim() ?? "",
        title: title?.trim() || null,
        startIso: startIso?.trim() || null,
        endIso: endIso?.trim() || null,
      };
    }
  ).filter((event) => event.id.length > 0);

  return {
    action:
      actionMatch === "check_availability" || actionMatch === "list_events"
        ? actionMatch
        : null,
    windowStart,
    windowEnd,
    timezone,
    recentEvents,
  };
}

export function planGoogleCalendarToolAction(input: {
  config: GoogleCalendarAgentToolConfig;
  latestUserMessage: string;
  recentMessages: PlannerMessage[];
  recentToolContext?: string;
  timezone: string | null;
  now?: Date;
}): GoogleCalendarPlannerDecision {
  const writeAction = resolveWriteAction(
    input.latestUserMessage,
    input.config
  );

  if (writeAction) {
    if (!input.timezone || !isValidTimezone(input.timezone)) {
      return {
        kind: "missing_data",
        message: buildMissingDateMessage(null),
      };
    }

    if (writeAction === "cancel_event") {
      const eventResolution = resolveEventMatch(
        input.latestUserMessage,
        input.recentToolContext
      );
      const writeContext = extractWriteContext(input.latestUserMessage);

      if (eventResolution.kind === "missing") {
        return {
          kind: "missing_data",
          message: buildMissingEventMessage(
            "cancel_event",
            input.recentToolContext
          ),
        };
      }

      if (eventResolution.kind === "ambiguous") {
        return {
          kind: "missing_data",
          message: buildAmbiguousEventMessage(
            "cancel_event",
            eventResolution.candidates,
            input.recentToolContext
          ),
        };
      }

      return {
        kind: "action",
        requiresConfirmation: true,
        input: {
          action: "cancel_event",
          eventId: eventResolution.event.id,
          ...buildResolvedEventDetails(
            eventResolution.event,
            parseRecentGoogleCalendarToolContext(input.recentToolContext).timezone
          ),
          ...writeContext,
        },
      };
    }

    if (writeAction === "create_event") {
      const absoluteWindow = resolveWindowFromAbsoluteDate(
        input.latestUserMessage,
        input.timezone
      );
      const relativeWindow = resolveWindowFromRelativeDate({
        latestUserMessage: input.latestUserMessage,
        timezone: input.timezone,
        now: input.now,
        recentToolContext: input.recentToolContext,
      });
      const window = absoluteWindow ?? relativeWindow;

      if (!window) {
        return {
          kind: "missing_data",
          message: buildMissingDateMessage(input.timezone),
        };
      }

      const zonedToday = getZonedDateParts(input.now ?? new Date(), input.timezone);
      const baseDate =
        getBaseDateFromIso(window.startIso, input.timezone) ?? {
          year: zonedToday.year,
          month: zonedToday.month,
          day: zonedToday.day,
        };
      const explicitTimeRange = extractTimeRange(
        input.latestUserMessage,
        input.timezone,
        baseDate
      );

      if (!explicitTimeRange) {
        return {
          kind: "missing_data",
          message:
            'Para escribir en Google Calendar necesito horario explicito, por ejemplo "de 15 a 16".',
        };
      }

      const title = extractTitle(input.latestUserMessage);
      const writeContext = extractWriteContext(input.latestUserMessage);
      if (!title) {
        return {
          kind: "missing_data",
          message: buildMissingTitleMessage(),
        };
      }

      return {
        kind: "action",
        requiresConfirmation: true,
        input: {
          action: "create_event",
          title,
          startIso: explicitTimeRange.startIso,
          endIso: explicitTimeRange.endIso,
          timezone: input.timezone,
          ...writeContext,
        },
      };
    }

    const eventResolution = resolveEventMatch(
      input.latestUserMessage,
      input.recentToolContext
    );

    if (eventResolution.kind === "missing") {
      return {
        kind: "missing_data",
        message: buildMissingEventMessage(
          "reschedule_event",
          input.recentToolContext
        ),
      };
    }

    if (eventResolution.kind === "ambiguous") {
      return {
        kind: "missing_data",
        message: buildAmbiguousEventMessage(
          "reschedule_event",
          eventResolution.candidates,
          input.recentToolContext
        ),
      };
    }

    const absoluteWindow = resolveWindowFromAbsoluteDate(
      input.latestUserMessage,
      input.timezone
    );
    const relativeWindow = resolveWindowFromRelativeDate({
      latestUserMessage: input.latestUserMessage,
      timezone: input.timezone,
      now: input.now,
      recentToolContext: input.recentToolContext,
    });
    const window = absoluteWindow ?? relativeWindow;
    const zonedToday = getZonedDateParts(input.now ?? new Date(), input.timezone);
    const baseDate =
      getBaseDateFromIso(window?.startIso ?? null, input.timezone) ??
      getBaseDateFromIso(eventResolution.event.startIso, input.timezone) ?? {
        year: zonedToday.year,
        month: zonedToday.month,
        day: zonedToday.day,
      };
    const explicitTimeRange = extractTimeRange(
      input.latestUserMessage,
      input.timezone,
      baseDate
    );

    if (!explicitTimeRange) {
      return {
        kind: "missing_data",
        message:
          'Para escribir en Google Calendar necesito horario explicito, por ejemplo "de 15 a 16".',
      };
    }

    const writeContext = extractWriteContext(input.latestUserMessage);

    return {
      kind: "action",
      requiresConfirmation: true,
      input: {
        action: "reschedule_event",
        eventId: eventResolution.event.id,
        title: eventResolution.event.title ?? undefined,
        ...buildResolvedEventDetails(eventResolution.event, input.timezone),
        startIso: explicitTimeRange.startIso,
        endIso: explicitTimeRange.endIso,
        timezone: input.timezone,
        ...writeContext,
      },
    };
  }

  const action = resolveReadAction(
    input.latestUserMessage,
    input.config,
    input.recentToolContext
  );

  if (!action) {
    return { kind: "respond" };
  }

  if (!input.timezone || !isValidTimezone(input.timezone)) {
    return {
      kind: "missing_data",
      message: buildMissingDateMessage(null),
    };
  }

  const absoluteWindow = resolveWindowFromAbsoluteDate(
    input.latestUserMessage,
    input.timezone
  );
  const relativeWindow = resolveWindowFromRelativeDate({
    latestUserMessage: input.latestUserMessage,
    timezone: input.timezone,
    now: input.now,
    recentToolContext: input.recentToolContext,
  });
  const window = absoluteWindow ?? relativeWindow;

  if (!window) {
    return {
      kind: "missing_data",
      message: buildMissingDateMessage(input.timezone),
    };
  }

  if (action === "check_availability") {
    return {
      kind: "action",
      requiresConfirmation: false,
      input: {
        action,
        startIso: window.startIso,
        endIso: window.endIso,
        timezone: input.timezone,
      },
    };
  }

  return {
    kind: "action",
    requiresConfirmation: false,
    input: {
      action,
      startIso: window.startIso,
      endIso: window.endIso,
      timezone: input.timezone,
      maxResults: 10,
    },
  };
}
