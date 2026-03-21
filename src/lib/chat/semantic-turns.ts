import type { ChatMessage } from "@/lib/llm/litellm-types";
import type { RequestShapingResult } from "@/lib/chat/request-shaping";
import type { SemanticLlmUsageKind } from "@/lib/llm/semantic-generation";

export type SemanticTurnPlan = {
  usageKind: SemanticLlmUsageKind;
  mode: "standalone" | "post_structured";
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function resolveSemanticUsageKind(
  latestUserMessage: string
): SemanticLlmUsageKind {
  const normalized = normalizeText(latestUserMessage);

  if (
    includesAny(normalized, [
      "redacta una respuesta",
      "escribe una respuesta",
      "redactar respuesta",
      "borrador de respuesta",
      "draft reply",
    ])
  ) {
    return "draft_reply_body";
  }

  if (
    includesAny(normalized, [
      "redacta un email",
      "redacta un correo",
      "escribe un email",
      "escribe un correo",
      "borrador de email",
      "borrador de correo",
      "draft email",
    ])
  ) {
    return "draft_email_body";
  }

  if (
    includesAny(normalized, [
      "actualizacion interna",
      "update interno",
      "redacta un update",
      "redacta una actualizacion",
      "redacta un resumen interno",
    ])
  ) {
    return "draft_internal_update";
  }

  if (
    includesAny(normalized, [
      "compara",
      "comparar",
      "comparacion",
      "vs ",
      "diferencia",
      "diferencias",
    ])
  ) {
    return "semantic_comparison";
  }

  if (
    includesAny(normalized, [
      "rankea",
      "rankeame",
      "prioriza",
      "priorizame",
      "prometedor",
      "mas prometedor",
      "mejor opcion",
      "mas importante",
    ])
  ) {
    return "semantic_ranking";
  }

  if (
    includesAny(normalized, [
      "siguiente paso",
      "proximo paso",
      "que conviene",
      "que recomiendas",
      "recomiendame",
      "que hago ahora",
    ])
  ) {
    return "next_step_advice";
  }

  if (
    includesAny(normalized, [
      "resume",
      "resumi",
      "resumime",
      "resumen",
      "sintetiza",
      "analiza",
      "explica",
    ])
  ) {
    return "semantic_summary";
  }

  return "general_consultive_reply";
}

export function resolveStandaloneSemanticTurnPlan(input: {
  shapedRequest: RequestShapingResult;
  latestUserMessage: string;
}): SemanticTurnPlan {
  return {
    usageKind: resolveSemanticUsageKind(input.latestUserMessage),
    mode: "standalone",
  };
}

export function resolveStructuredSemanticTurnPlan(input: {
  latestUserMessage: string;
  shapedRequest: RequestShapingResult;
}): SemanticTurnPlan | null {
  if (input.shapedRequest.intent !== "tool_ambiguous") {
    return null;
  }

  const usageKind = resolveSemanticUsageKind(input.latestUserMessage);
  if (usageKind === "general_consultive_reply") {
    return null;
  }

  return {
    usageKind,
    mode: "post_structured",
  };
}

export function buildStandaloneSemanticSystemPrompt(basePrompt: string): string {
  return [
    basePrompt,
    "SEMANTIC_MODE",
    "Responde solo en modo consultivo o generativo, sin ejecutar acciones, sin elegir tools y sin asumir que algo ya fue operado.",
    "Si el pedido requiere efectos reales o mutaciones, indicalo explicitamente y deriva a una capacidad operativa soportada.",
  ].join("\n\n");
}

export function buildStructuredSemanticMessages(input: {
  latestUserMessage: string;
  evidence: string;
}): ChatMessage[] {
  return [
    {
      role: "user",
      content: [
        "Pedido del usuario:",
        input.latestUserMessage,
        "",
        "Evidencia verificada recuperada por el runtime estructurado:",
        input.evidence,
      ].join("\n"),
    },
  ];
}

export function buildStructuredSemanticSystemPrompt(basePrompt: string): string {
  return [
    basePrompt,
    "SEMANTIC_MODE",
    "Trabaja solo sobre evidencia ya recuperada y validada por el runtime estructurado.",
    "No inventes resultados faltantes, no ejecutes acciones, no sugieras que algo ya se mutó y no conviertas tu consejo en side effects.",
  ].join("\n\n");
}
