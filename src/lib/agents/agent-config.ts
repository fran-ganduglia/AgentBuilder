import { z } from "zod";

export const ALLOWED_AGENT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "gemini-pro",
] as const;

export type AgentModelValue = (typeof ALLOWED_AGENT_MODELS)[number];

export const AGENT_MODEL_OPTIONS: Array<{
  value: AgentModelValue;
  label: string;
  badge: string;
}> = [
  { value: "gpt-4o", label: "GPT-4o", badge: "Mas capaz" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", badge: "Rapido" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", badge: "Razonamiento" },
  { value: "gemini-pro", label: "Gemini Pro", badge: "Google" },
];

export const agentModelSchema = z.enum(ALLOWED_AGENT_MODELS, {
  message: "Modelo no permitido",
});
