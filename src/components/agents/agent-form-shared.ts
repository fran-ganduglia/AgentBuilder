import { z } from "zod";
import { agentModelSchema } from "@/lib/agents/agent-config";
import type { Agent, AgentStatus } from "@/types/app";

export type AgentFormFields = {
  name: string;
  description: string;
  systemPrompt: string;
  llmModel: string;
  llmTemperature: number;
  status: AgentStatus;
  integrationId: string;
};

export type AgentFormErrors = Partial<Record<keyof AgentFormFields, string>>;

export const agentFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres"),
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
  status: z.enum(["draft", "active", "paused", "archived"]),
  integrationId: z.string().optional(),
});

export const AGENT_STATUSES: Array<{ value: AgentStatus; label: string }> = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "archived", label: "Archivado" },
];

export function createInitialFields(agent?: Agent): AgentFormFields {
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    systemPrompt: agent?.system_prompt ?? "",
    llmModel: agent?.llm_model ?? "gemini-pro",
    llmTemperature: agent?.llm_temperature ?? 0.7,
    status: (agent?.status as AgentStatus | undefined) ?? "draft",
    integrationId: "",
  };
}

export function getTemperatureLabel(value: number): string {
  if (value <= 0.3) return "Preciso";
  if (value <= 0.7) return "Equilibrado";
  return "Explorador";
}

export function hasFieldChanges(current: AgentFormFields, initial: AgentFormFields): boolean {
  return (Object.keys(current) as Array<keyof AgentFormFields>).some((key) => current[key] !== initial[key]);
}
