import type { RequestShapingResult } from "@/lib/chat/request-shaping";

type ToolSurface = RequestShapingResult["selectedSurfaces"][number];

export type OperationalModeDecision =
  | {
      kind: "allow_consultive_llm";
    }
  | {
      kind: "clarify_with_ui";
      message: string;
      reason: "supported_operational_request";
    }
  | {
      kind: "reject_unsupported";
      message: string;
      unsupportedSurfaces: ToolSurface[];
    };

const DEFAULT_SUPPORTED_STRUCTURED_SURFACES: ToolSurface[] = [
  "gmail",
  "google_calendar",
  "google_sheets",
];

function formatSurfaceLabel(surface: ToolSurface): string {
  if (surface === "gmail") {
    return "Gmail";
  }

  if (surface === "google_calendar") {
    return "Google Calendar";
  }

  if (surface === "google_sheets") {
    return "Google Sheets";
  }

  return "Salesforce";
}

export function resolveOperationalModeDecision(input: {
  shapedRequest: RequestShapingResult;
  supportedStructuredSurfaces?: ToolSurface[];
}): OperationalModeDecision {
  const supportedStructuredSurfaces =
    input.supportedStructuredSurfaces ?? DEFAULT_SUPPORTED_STRUCTURED_SURFACES;
  const isOperationalTurn = input.shapedRequest.intent === "tool_ambiguous";

  if (!isOperationalTurn || input.shapedRequest.selectedSurfaces.length === 0) {
    return { kind: "allow_consultive_llm" };
  }

  const unsupportedSurfaces = input.shapedRequest.selectedSurfaces.filter(
    (surface) => !supportedStructuredSurfaces.includes(surface)
  );

  if (unsupportedSurfaces.length > 0) {
    const labels = unsupportedSurfaces.map(formatSurfaceLabel).join(" y ");
    return {
      kind: "reject_unsupported",
      unsupportedSurfaces,
      message: `Ese pedido parece operativo sobre ${labels}, pero esa surface todavia no corre en el runtime estructurado. Reformulalo con una capacidad soportada o usalo solo para analisis sin efectos.`,
    };
  }

  return {
    kind: "clarify_with_ui",
    reason: "supported_operational_request",
    message:
      "No pude matchear ese pedido con una capacidad operativa soportada sin adivinar parametros o referencias. Reformulalo indicando exactamente que quieres consultar o cambiar.",
  };
}
