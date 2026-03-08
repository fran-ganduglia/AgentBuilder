import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Agent, AgentStatus } from "@/types/app";
import type { TablesInsert, TablesUpdate } from "@/types/database";

export type CreateAgentInput = {
  name: string;
  systemPrompt: string;
  llmModel: string;
  llmTemperature: number;
};

export type UpdateAgentInput = Partial<CreateAgentInput> & {
  status?: AgentStatus;
};

type DbResult<T> = { data: T | null; error: string | null };
type AgentInsert = TablesInsert<"agents">;
type AgentUpdate = TablesUpdate<"agents">;

const MIN_TEMPERATURE = 0.0;
const MAX_TEMPERATURE = 1.0;

function validateTemperature(value: number): string | null {
  if (value < MIN_TEMPERATURE || value > MAX_TEMPERATURE) {
    return `La temperatura debe estar entre ${MIN_TEMPERATURE} y ${MAX_TEMPERATURE}`;
  }

  return null;
}

function resolveLlmProvider(model: string): string {
  if (model.startsWith("gpt-")) {
    return "openai";
  }

  if (model.startsWith("claude-")) {
    return "anthropic";
  }

  if (model.startsWith("gemini-") || model === "gemini-pro") {
    return "gemini";
  }

  return "custom";
}

export async function listAgents(organizationId: string): Promise<DbResult<Agent[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function getAgentById(agentId: string, organizationId: string): Promise<DbResult<Agent>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function createAgent(
  input: CreateAgentInput,
  organizationId: string,
  userId: string
): Promise<DbResult<Agent>> {
  const tempError = validateTemperature(input.llmTemperature);
  if (tempError) {
    return { data: null, error: tempError };
  }

  const supabase = await createServerSupabaseClient();
  const insertPayload: AgentInsert = {
    name: input.name,
    system_prompt: input.systemPrompt,
    llm_model: input.llmModel,
    llm_temperature: input.llmTemperature,
    llm_provider: resolveLlmProvider(input.llmModel),
    status: "draft",
    organization_id: organizationId,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from("agents")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function softDeleteAgent(
  agentId: string,
  organizationId: string
): Promise<DbResult<Agent>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
  organizationId: string
): Promise<DbResult<Agent>> {
  if (input.llmTemperature !== undefined) {
    const tempError = validateTemperature(input.llmTemperature);
    if (tempError) {
      return { data: null, error: tempError };
    }
  }

  const updateFields: AgentUpdate = {};

  if (input.name !== undefined) updateFields.name = input.name;
  if (input.systemPrompt !== undefined) updateFields.system_prompt = input.systemPrompt;
  if (input.llmModel !== undefined) {
    updateFields.llm_model = input.llmModel;
    updateFields.llm_provider = resolveLlmProvider(input.llmModel);
  }
  if (input.llmTemperature !== undefined) updateFields.llm_temperature = input.llmTemperature;
  if (input.status !== undefined) updateFields.status = input.status;

  if (Object.keys(updateFields).length === 0) {
    return { data: null, error: "No se proporcionaron campos para actualizar" };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .update(updateFields)
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
