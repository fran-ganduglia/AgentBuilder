import { z } from "zod";
import { sendChatCompletion, type ChatMessage, type ChatCompletionInput, type ChatCompletionOutput } from "@/lib/llm/litellm";
import { resolveProviderFromModel, resolveRuntimeModelRoutePolicy } from "@/lib/llm/model-routing";
import { getActionApprovalModeV1 } from "@/lib/runtime/action-catalog";
import {
  RUNTIME_ACTION_TYPES,
  type ActionPlanV1,
  type ExecutionContextV1,
  type ParamValueV1,
  type RuntimeActionType,
} from "@/lib/runtime/types";
import { type RecentActionContext, isRecentActionContextExpired } from "@/lib/chat/conversation-metadata";

const RUNTIME_PLANNER_MAX_TOKENS = 500;
const RUNTIME_PLANNER_CONFIDENCE_THRESHOLD = 0.75;
const RUNTIME_PLANNER_CONTEXT_MESSAGES = 6;

const primitiveParamSchema = z.object({
  kind: z.literal("primitive"),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ]),
});

const referenceParamSchema = z.object({
  kind: z.literal("reference"),
  refType: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(200).optional(),
});

const entityParamSchema = z.object({
  kind: z.literal("entity"),
  entityType: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(200).optional(),
  identifiers: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(500)).optional(),
});

const timeParamSchema = z.object({
  kind: z.literal("time"),
  value: z.string().trim().min(1).max(160),
  timezone: z.string().trim().min(1).max(80).optional(),
  granularity: z.enum(["datetime", "date", "time", "range"]).optional(),
});

const computedParamSchema = z.object({
  kind: z.literal("computed"),
  value: z.union([
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
  source: z.string().trim().min(1).max(120),
});

const unknownParamSchema = z.object({
  kind: z.literal("unknown"),
  reason: z.string().trim().min(1).max(200).optional(),
});

const paramValueSchema: z.ZodType<ParamValueV1> = z.union([
  primitiveParamSchema,
  entityParamSchema,
  referenceParamSchema,
  timeParamSchema,
  computedParamSchema,
  unknownParamSchema,
]);

const runtimeActionTypeSchema = z.enum(RUNTIME_ACTION_TYPES);

const plannerActionSchema = z.object({
  type: runtimeActionTypeSchema,
  params: z.record(z.string().trim().min(1).max(80), paramValueSchema),
  approvalMode: z.enum(["auto", "required"]),
});

const plannerOutputSchema = z.object({
  version: z.literal(1),
  intent: z.string().trim().min(1).max(120),
  actions: z.array(plannerActionSchema).max(5),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(10),
});

export type RuntimePlannerUsageV1 = {
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  responseTimeMs: number;
};

export type RuntimePlannerResultV1 = {
  plan: ActionPlanV1;
  plannerDraft: ActionPlanV1;
  usage: RuntimePlannerUsageV1;
  rawContent: string;
};

type PlannerActionDraft = z.infer<typeof plannerActionSchema>;
type PlannerOutputDraft = z.infer<typeof plannerOutputSchema>;

type PlanActionInput = {
  requestedModel: string;
  organizationId: string;
  agentId: string;
  conversationId: string;
  latestUserMessage: string;
  messages: ChatMessage[];
  recentActionContext?: RecentActionContext | null;
  ctx?: Pick<ExecutionContextV1, "budget">;
  sender?: (input: ChatCompletionInput) => Promise<ChatCompletionOutput>;
};

function createEmptyPlan(missingFields: string[] = []): ActionPlanV1 {
  return {
    version: 1,
    intent: "unknown",
    actions: [],
    confidence: 0,
    missingFields,
  };
}

function buildPlannerSystemPrompt(): string {
  return [
    "Convierte lenguaje natural en un ActionPlanV1 JSON estricto.",
    "Responde solo JSON valido. No uses markdown ni fences.",
    "Version fija: 1.",
    "Acciones Gmail: search_email, summarize_thread, send_email, create_draft_email, create_draft_reply, send_reply, archive_thread, apply_label.",
    "Acciones Calendar: check_availability, list_events, create_event, reschedule_event, cancel_event.",
    "Acciones Sheets: list_sheets, get_headers, preview_sheet, find_rows, read_sheet_range, append_sheet_rows, append_records, update_sheet_range, clear_range, create_spreadsheet.",
    "Acciones CRM: search_records, create_lead, update_lead, create_task.",
    "Maximo 5 acciones por plan. Usa 0 acciones si el pedido queda fuera de catalogo o faltan datos criticos.",
    "Nunca emitas provider, tool name, IDs de Gmail o Calendar, ni side effects reales.",
    "Cada action debe incluir: type, params, approvalMode.",
    "Kinds de params permitidos: primitive, entity, reference, time, computed, unknown.",
    "Usa reference solo para referencias conversacionales o IDs explicitos ya dados; no inventes IDs.",
    "Usa entity para tipos o labels normalizados cuando ayude, nunca para ownership o autorizacion.",
    "Para send_email, cc, bcc y create_event.attendees, si el destinatario no viene como email literal pero el pedido igual esta claro, conserva la accion y usa entity con entityType recipient o unknown solo si el destinatario falta por completo.",
    "Usa time para fechas/horas relativas o explicitas; no conviertas a provider payload.",
    "Si el usuario quiere mover, reprogramar o cambiar el horario de un evento ya mencionado o listado, usa reschedule_event; no uses create_event.",
    "Para reschedule_event y cancel_event, usa eventRef como reference conversacional cuando el usuario diga 'ese evento', 'ultimo evento' o 'el ultimo evento que listaste'.",
    "Cuando el usuario pregunta por disponibilidad o huecos libres en el calendario, usa check_availability; no uses list_events.",
    "Para responder a un email existente usa send_reply o create_draft_reply con threadRef; no uses send_email.",
    "Para crear un borrador nuevo sin un hilo existente usa create_draft_email; para enviarlo directamente usa send_email.",
    "Usa list_sheets cuando el usuario pide ver las hojas o tabs de un spreadsheet.",
    "Usa find_rows para buscar filas por contenido; usa read_sheet_range cuando se especifica un rango A1 concreto.",
    "Usa computed solo para estructuras de filas o payloads tabulares simples.",
    "ApprovalMode fijo: auto para search_email, summarize_thread, list_events, check_availability, read_sheet_range, list_sheets, find_rows, get_headers, preview_sheet, search_records. Required para send_email, create_draft_email, create_draft_reply, send_reply, archive_thread, apply_label, create_event, reschedule_event, cancel_event, append_sheet_rows, append_records, update_sheet_range, clear_range, create_spreadsheet, create_lead, update_lead, create_task.",
    "Si faltan datos criticos o hay ambiguedad, usa confidence < 0.75 y agrega missingFields.",
    "En missingFields usa siempre los nombres exactos de los parametros de la accion: start y end (nunca start_time ni end_time), eventRef (nunca event_id), windowStart y windowEnd, threadRef (nunca thread_id).",
    "Si send_email tiene subject y body claros y solo falta resolver un alias de destinatario, usa confidence >= 0.75 y NO vacies el plan.",
    "Cuando puedas identificar la accion, SIEMPRE incluye exactamente 1 action con su type correcto, incluso con confidence baja. Usa kind unknown para parametros que faltan. NUNCA devuelvas actions vacias si sabes el tipo de accion.",
    'Ejemplo create_event ambiguo: {"version":1,"intent":"agendar reunion","actions":[{"type":"create_event","params":{"title":{"kind":"unknown","reason":"falta titulo"},"start":{"kind":"unknown","reason":"falta hora inicio"},"end":{"kind":"unknown","reason":"falta hora fin"}},"approvalMode":"required"}],"confidence":0.35,"missingFields":["title","start","end"]}',
    'Ejemplo: {"version":1,"intent":"buscar email","actions":[{"type":"search_email","params":{"query":{"kind":"primitive","value":"factura de marzo"},"maxResults":{"kind":"primitive","value":5}},"approvalMode":"auto"}],"confidence":0.9,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"resumir hilo","actions":[{"type":"summarize_thread","params":{"threadRef":{"kind":"reference","refType":"thread","value":"ultimo hilo","label":"ultimo hilo"}},"approvalMode":"auto"}],"confidence":0.88,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"enviar email","actions":[{"type":"send_email","params":{"to":{"kind":"primitive","value":["ana@example.com"]},"subject":{"kind":"primitive","value":"Seguimiento"},"body":{"kind":"primitive","value":"Gracias por tu tiempo."}},"approvalMode":"required"}],"confidence":0.9,"missingFields":[]}',
    'Ejemplo alias: {"version":1,"intent":"enviar email","actions":[{"type":"send_email","params":{"to":{"kind":"entity","entityType":"recipient","value":"jspansecchi","label":"jspansecchi"},"subject":{"kind":"primitive","value":"Seguimiento"},"body":{"kind":"primitive","value":"Gracias por tu tiempo."}},"approvalMode":"required"}],"confidence":0.82,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"borrador de respuesta","actions":[{"type":"create_draft_reply","params":{"threadRef":{"kind":"reference","refType":"thread","value":"ultimo hilo","label":"ultimo hilo"},"body":{"kind":"primitive","value":"Gracias por contactarnos."}},"approvalMode":"required"}],"confidence":0.87,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"verificar disponibilidad","actions":[{"type":"check_availability","params":{"windowStart":{"kind":"time","value":"manana 09:00","granularity":"datetime"},"windowEnd":{"kind":"time","value":"manana 18:00","granularity":"datetime"}},"approvalMode":"auto"}],"confidence":0.88,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"crear evento","actions":[{"type":"create_event","params":{"title":{"kind":"primitive","value":"Demo con cliente"},"start":{"kind":"time","value":"manana 15:00","granularity":"datetime"},"end":{"kind":"time","value":"manana 15:30","granularity":"datetime"},"attendees":{"kind":"primitive","value":["ana@example.com"]}},"approvalMode":"required"}],"confidence":0.86,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"listar eventos","actions":[{"type":"list_events","params":{"windowStart":{"kind":"time","value":"manana 00:00","granularity":"datetime"},"windowEnd":{"kind":"time","value":"manana 23:59","granularity":"datetime"}},"approvalMode":"auto"}],"confidence":0.85,"missingFields":[]}',
    'Ejemplo follow-up: {"version":1,"intent":"reprogramar evento","actions":[{"type":"reschedule_event","params":{"eventRef":{"kind":"reference","refType":"event","value":"ultimo evento","label":"ultimo evento"},"start":{"kind":"time","value":"manana 18:00","granularity":"datetime"},"end":{"kind":"time","value":"manana 18:30","granularity":"datetime"}},"approvalMode":"required"}],"confidence":0.86,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"listar hojas","actions":[{"type":"list_sheets","params":{},"approvalMode":"auto"}],"confidence":0.9,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"buscar filas en hoja","actions":[{"type":"find_rows","params":{"sheetRef":{"kind":"reference","refType":"sheet","value":"spreadsheet-1","label":"Leads"},"query":{"kind":"primitive","value":"Acme"},"maxResults":{"kind":"primitive","value":10}},"approvalMode":"auto"}],"confidence":0.86,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"leer hoja","actions":[{"type":"read_sheet_range","params":{"sheetRef":{"kind":"reference","refType":"sheet","value":"spreadsheet-1","label":"Leads"},"rangeRef":{"kind":"reference","refType":"range","value":"A1:C10","label":"A1:C10"}},"approvalMode":"auto"}],"confidence":0.85,"missingFields":[]}',
    'Ejemplo: {"version":1,"intent":"buscar registros crm","actions":[{"type":"search_records","params":{"objectType":{"kind":"primitive","value":"leads"},"query":{"kind":"primitive","value":"Acme"},"maxResults":{"kind":"primitive","value":5}},"approvalMode":"auto"}],"confidence":0.83,"missingFields":[]}',
    'Ejemplo ambiguo: {"version":1,"intent":"enviar email","actions":[{"type":"send_email","params":{"to":{"kind":"unknown","reason":"falta destinatario"},"subject":{"kind":"unknown","reason":"falta asunto"},"body":{"kind":"unknown","reason":"falta cuerpo"}},"approvalMode":"required"}],"confidence":0.42,"missingFields":["to","subject","body"]}',
  ].join("\n");
}

function normalizePlannerContent(content: string): string {
  const trimmed = content.trim();
  const withoutFences = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "").trim()
    : trimmed;

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1).trim();
  }

  return withoutFences;
}

function tryExtractFieldsFromRawText(content: string): {
  plan: ActionPlanV1;
  plannerDraft: ActionPlanV1;
} | null {
  const missingFieldsMatch = /"missingFields"\s*:\s*\[([^\]]*)/.exec(content);
  if (!missingFieldsMatch) return null;

  const fields = [...missingFieldsMatch[1].matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter(Boolean);
  if (fields.length === 0) return null;

  const intentMatch = /"intent"\s*:\s*"([^"]+)"/.exec(content);
  const intent = intentMatch?.[1] ?? "unknown";

  const draft: ActionPlanV1 = {
    version: 1,
    intent,
    actions: [],
    confidence: 0,
    missingFields: fields,
  };

  return { plan: draft, plannerDraft: draft };
}

function normalizeApprovalMode(actionType: RuntimeActionType): "auto" | "required" {
  return getActionApprovalModeV1(actionType);
}

function sanitizeDraftAction(action: PlannerActionDraft, index: number): ActionPlanV1["actions"][number] {
  return {
    id: `action-${index + 1}`,
    type: action.type,
    params: action.params,
    approvalMode: normalizeApprovalMode(action.type),
  };
}

function sanitizePlanDraft(draft: PlannerOutputDraft): ActionPlanV1 {
  return {
    version: 1,
    intent: draft.intent,
    actions: draft.actions.map(sanitizeDraftAction),
    confidence: Number.isFinite(draft.confidence)
      ? Math.max(0, Math.min(1, draft.confidence))
      : 0,
    missingFields: draft.missingFields,
  };
}

function applyPlannerConfidenceThreshold(draft: ActionPlanV1): ActionPlanV1 {
  const confidence = Number.isFinite(draft.confidence)
    ? Math.max(0, Math.min(1, draft.confidence))
    : 0;

  if (confidence < RUNTIME_PLANNER_CONFIDENCE_THRESHOLD) {
    return {
      version: 1,
      intent: draft.intent,
      actions: [],
      confidence,
      missingFields: draft.missingFields,
    };
  }

  return draft;
}

function parsePlannerOutput(content: string): {
  plan: ActionPlanV1;
  plannerDraft: ActionPlanV1;
} {
  try {
    const parsed = JSON.parse(normalizePlannerContent(content)) as unknown;
    const validated = plannerOutputSchema.parse(parsed);
    const plannerDraft = sanitizePlanDraft(validated);
    return {
      plan: applyPlannerConfidenceThreshold(plannerDraft),
      plannerDraft,
    };
  } catch (err) {
    console.error("runtime.planner.parse_failed", {
      rawContent: content.slice(0, 500),
      error: err instanceof Error ? err.message : "unknown",
    });
    const fallback = tryExtractFieldsFromRawText(content);
    if (fallback) return fallback;
    const emptyPlan = createEmptyPlan(["planner_invalid_output"]);
    return {
      plan: emptyPlan,
      plannerDraft: emptyPlan,
    };
  }
}

function buildRecentActionContextBlock(context: RecentActionContext): string {
  const lines = context.actions.map((a) => {
    const detail = "threadId" in a.result
      ? ` (threadId: ${(a.result as { threadId: string }).threadId})`
      : "id" in a.result
        ? ` (id: ${(a.result as { id?: string }).id ?? ""})`
        : "";
    return `- ${a.action} [${a.provider}]${detail}: ${a.summary.slice(0, 120)}`;
  });
  return `CONTEXTO_RECIENTE (turno anterior):\n${lines.join("\n")}`;
}

function buildPlannerMessages(input: {
  latestUserMessage: string;
  messages: ChatMessage[];
  recentActionContext?: RecentActionContext | null;
}): ChatMessage[] {
  const history = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-RUNTIME_PLANNER_CONTEXT_MESSAGES);

  const validContext =
    input.recentActionContext &&
    !isRecentActionContextExpired(input.recentActionContext)
      ? input.recentActionContext
      : null;

  const contextPrefix = validContext ? buildRecentActionContextBlock(validContext) + "\n\n" : "";

  if (history.length === 0) {
    return [{ role: "user", content: `${contextPrefix}${input.latestUserMessage}` }];
  }

  const result = history.map((message) =>
    message.role === "assistant"
      ? { role: "assistant" as const, content: message.content ?? "" }
      : { role: "user" as const, content: message.content }
  );

  if (contextPrefix && result[0]?.role === "user") {
    result[0] = { ...result[0], content: `${contextPrefix}${result[0].content}` };
  }

  return result;
}

export function isRuntimeMvpActionType(value: string): value is RuntimeActionType {
  return runtimeActionTypeSchema.safeParse(value).success;
}

export async function planActionWithUsage(
  input: PlanActionInput
): Promise<RuntimePlannerResultV1> {
  const sender = input.sender ?? sendChatCompletion;
  const model = resolveRuntimeModelRoutePolicy(input.requestedModel).primaryModel;

  const completion = await sender({
    model,
    systemPrompt: buildPlannerSystemPrompt(),
    messages: buildPlannerMessages({
      latestUserMessage: input.latestUserMessage,
      messages: input.messages,
      recentActionContext: input.recentActionContext,
    }),
    temperature: 0,
    maxTokens: RUNTIME_PLANNER_MAX_TOKENS,
    organizationId: input.organizationId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    toolChoice: "none",
    responseFormat: "json_object",
  });
  const parsed = parsePlannerOutput(completion.content);

  return {
    plan: parsed.plan,
    plannerDraft: parsed.plannerDraft,
    rawContent: completion.content,
    usage: {
      model: completion.model,
      provider: resolveProviderFromModel(completion.model),
      tokensInput: completion.tokensInput,
      tokensOutput: completion.tokensOutput,
      responseTimeMs: completion.responseTimeMs,
    },
  };
}

export async function planAction(input: PlanActionInput): Promise<ActionPlanV1> {
  const result = await planActionWithUsage(input);
  return result.plan;
}
