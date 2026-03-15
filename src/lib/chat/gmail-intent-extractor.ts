import "server-only";

import { env } from "@/lib/utils/env";

export type GmailIntentAction =
  | "search_threads"
  | "read_thread"
  | "create_draft_reply"
  | "create_draft_email"
  | "send_reply"
  | "send_email"
  | "apply_label"
  | "archive_thread"
  | "none";

export type GmailIntent = {
  action: GmailIntentAction;
};

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para un agente de Gmail.
Dado el mensaje del usuario, determina QUE quiere hacer.
Responde SOLO con JSON valido usando este schema exacto: {"action": "<accion>"}

Valores validos para "action":
- "search_threads": quiere buscar, listar, mostrar o revisar correos/hilos ESPECIFICAMENTE en Gmail
- "read_thread": quiere leer, abrir o ver el detalle de un hilo/email concreto en Gmail
- "create_draft_reply": quiere redactar o preparar un borrador de respuesta a un hilo existente en Gmail
- "create_draft_email": quiere crear un borrador de email nuevo (no reply) con destinatarios especificos
- "send_reply": quiere enviar directamente una respuesta a un hilo existente en Gmail
- "send_email": quiere enviar directamente un email nuevo (no reply) con destinatarios especificos
- "apply_label": quiere etiquetar o aplicar un label a un hilo/email en Gmail
- "archive_thread": quiere archivar, sacar de inbox o quitar de bandeja un hilo/email en Gmail
- "none": no es una solicitud relacionada con Gmail

Reglas para distinguir reply vs email nuevo:
- Si menciona responder, contestar o hacer follow-up a un hilo/email existente → usa reply (draft o send)
- Si menciona enviar/mandar/escribir un email a alguien sin referencia a un hilo previo → usa email nuevo (draft o send)
- Si dice "borrador" o "draft" → usa create_draft (reply o email segun contexto)
- Si dice "enviar", "mandar", "send" sin mencionar borrador → usa send (reply o email segun contexto)

IMPORTANTE: Responde "none" si el usuario:
- Pide un resumen general, resumen de estado, o resumen de la conversacion
- Hace preguntas generales que no mencionan emails, correos, Gmail, hilos o bandeja
- Pide siguiente paso, sugerencias, redactar updates internos, o acciones que no involucran Gmail
- Usa palabras como "operativo", "estado", "conversacion", "resumir" sin referencia explicita a emails

Solo clasifica como accion de Gmail si el mensaje hace referencia EXPLICITA a emails, correos, Gmail, hilos, inbox o bandeja.

Responde SOLO con el JSON, sin texto adicional.`;

const VALID_ACTIONS = new Set<string>([
  "search_threads",
  "read_thread",
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "apply_label",
  "archive_thread",
  "none",
]);

const FALLBACK: GmailIntent = { action: "none" };

export async function extractGmailIntent(
  latestUserMessage: string
): Promise<GmailIntent> {
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
      return FALLBACK;
    }

    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return FALLBACK;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const action = parsed["action"];

    if (typeof action === "string" && VALID_ACTIONS.has(action)) {
      return { action: action as GmailIntentAction };
    }

    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}
