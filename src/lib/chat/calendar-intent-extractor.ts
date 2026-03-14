import "server-only";

import { env } from "@/lib/utils/env";

export type CalendarIntentAction =
  | "create_event"
  | "reschedule_event"
  | "cancel_event"
  | "list_events"
  | "check_availability"
  | "none";

export type CalendarIntent = {
  action: CalendarIntentAction;
};

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para un agente de Google Calendar.
Dado el mensaje del usuario, determina QUE quiere hacer.
Responde SOLO con JSON valido usando este schema exacto: {"action": "<accion>"}

Valores validos para "action":
- "create_event": quiere crear, agendar, agregar, poner, añadir, programar un evento/reunion/cita/llamada
- "reschedule_event": quiere mover, reprogramar, cambiar el horario o la fecha de un evento existente
- "cancel_event": quiere cancelar, borrar, anular, suspender o eliminar un evento existente
- "list_events": quiere ver, listar, consultar, mostrar eventos/reuniones/citas en su calendario
- "check_availability": quiere saber si esta libre, ver su disponibilidad, o que huecos tiene en su agenda
- "none": no es una solicitud relacionada con el calendario

Responde SOLO con el JSON, sin texto adicional.`;

const VALID_ACTIONS = new Set<string>([
  "create_event",
  "reschedule_event",
  "cancel_event",
  "list_events",
  "check_availability",
  "none",
]);

const FALLBACK: CalendarIntent = { action: "none" };

export async function extractCalendarIntent(
  latestUserMessage: string
): Promise<CalendarIntent> {
  try {
    const response = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: latestUserMessage.slice(0, 500) },
        ],
        temperature: 0,
        max_tokens: 80,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return FALLBACK;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };

    const raw = data.choices[0]?.message.content;
    if (!raw) {
      console.log("calendar.intent_extractor: empty content from LLM");
      return FALLBACK;
    }

    // Claude may wrap JSON in markdown code blocks or add surrounding text
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      console.log("calendar.intent_extractor: no JSON object found in response", { raw: raw.slice(0, 200) });
      return FALLBACK;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const action = parsed["action"];

    console.log("calendar.intent_extractor: resolved intent", { action, rawPreview: raw.slice(0, 100) });

    if (typeof action === "string" && VALID_ACTIONS.has(action)) {
      return { action: action as CalendarIntentAction };
    }

    return FALLBACK;
  } catch (error) {
    console.log("calendar.intent_extractor: error", { message: error instanceof Error ? error.message : String(error) });
    return FALLBACK;
  }
}
