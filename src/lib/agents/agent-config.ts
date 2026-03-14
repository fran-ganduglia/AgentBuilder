import { z } from "zod";
import type { AgentArea } from "@/lib/agents/agent-setup";

export const ALLOWED_AGENT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "gemini-pro",
] as const;

export type AgentModelValue = (typeof ALLOWED_AGENT_MODELS)[number];

export type AgentModelOption = {
  value: AgentModelValue;
  label: string;
  badge: string;
  priceLabel: string;
  description: string;
  recommendedAreas: AgentArea[];
};

export const AGENT_MODEL_OPTIONS: AgentModelOption[] = [
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    badge: "Economico",
    priceLabel: "~$0.15 / 1M tokens",
    description: "Ideal para soporte FAQ, respuestas rapidas y volumen alto.",
    recommendedAreas: ["support"],
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    badge: "Equilibrado",
    priceLabel: "~$2.50 / 1M tokens",
    description: "Balance entre capacidad y costo. Bueno para ventas y marketing.",
    recommendedAreas: ["sales", "marketing"],
  },
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    badge: "Razonamiento",
    priceLabel: "~$3.00 / 1M tokens",
    description: "Mejor razonamiento y analisis. Recomendado para agentes de analisis.",
    recommendedAreas: ["analysis"],
  },
  {
    value: "gemini-pro",
    label: "Gemini Pro",
    badge: "Google",
    priceLabel: "~$1.25 / 1M tokens",
    description: "Integracion natural con Google Workspace. Ideal para Gmail y Calendar.",
    recommendedAreas: [],
  },
];

export const agentModelSchema = z.enum(ALLOWED_AGENT_MODELS, {
  message: "Modelo no permitido",
});
