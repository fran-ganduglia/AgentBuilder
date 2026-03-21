import { z } from "zod";
import type { AgentArea } from "@/lib/agents/agent-setup";

export const ALLOWED_AGENT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-pro",
] as const;

export const MODEL_TIERS = ["cheap", "strong"] as const;

export type AgentModelValue = (typeof ALLOWED_AGENT_MODELS)[number];
export type ModelTier = (typeof MODEL_TIERS)[number];

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
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    badge: "Economico",
    priceLabel: "~$0.80 / 1M tokens",
    description: "Opcion rapida y barata para clasificacion, soporte y turnos operativos acotados.",
    recommendedAreas: ["support"],
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

export const modelTierSchema = z.enum(MODEL_TIERS);

export const modelRoutePolicySchema = z.object({
  primaryModel: z.string().min(1, "El modelo principal es requerido"),
  escalationModel: z.string().min(1, "El modelo de escalado es requerido"),
  maxEscalationsPerTurn: z.number().int().min(0).max(1).default(1),
});

export type ModelRoutePolicy = z.infer<typeof modelRoutePolicySchema>;
