import { canAccessQaPanel } from "@/lib/agents/connection-policy";
import type { AgentStatus } from "@/types/app";

export function getQaAvailabilityError(
  classification: "local" | "channel_connected",
  status: string
): string | null {
  if (!canAccessQaPanel({ hasConnection: classification !== "local", providerType: null, classification, label: "" }, status as AgentStatus)) {
    return "QA disponible solo para agentes activos o para agentes con WhatsApp conectado.";
  }

  return null;
}
