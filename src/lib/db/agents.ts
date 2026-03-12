import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { toSetupStateJson, type AgentSetupState } from "@/lib/agents/agent-setup";
import type { Agent, AgentStatus } from "@/types/app";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";

export type CreateAgentInput = {
  name: string;
  description?: string;
  systemPrompt: string;
  llmModel: string;
  llmTemperature: number;
  status?: AgentStatus;
  setupState?: AgentSetupState;
};

export type UpdateAgentInput = Partial<CreateAgentInput> & {
  status?: AgentStatus;
};

type DbResult<T> = { data: T | null; error: string | null };
type AgentInsert = TablesInsert<"agents">;
type AgentUpdate = TablesUpdate<"agents">;

type AgentInsertWithSetupState = AgentInsert & {
  setup_state?: Json | null;
};

type AgentUpdateWithSetupState = AgentUpdate & {
  setup_state?: Json | null;
};

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

export async function listDeletedAgents(organizationId: string): Promise<DbResult<Agent[]>> {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function listAgentsByIds(
  organizationId: string,
  agentIds: string[]
): Promise<DbResult<Agent[]>> {
  if (agentIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("id", agentIds)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function listAgentsByIdsIncludingDeleted(
  organizationId: string,
  agentIds: string[]
): Promise<DbResult<Agent[]>> {
  if (agentIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", agentIds);

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
  const insertPayload: AgentInsertWithSetupState = {
    name: input.name,
    description: input.description?.trim() || null,
    system_prompt: input.systemPrompt,
    llm_model: input.llmModel,
    llm_temperature: input.llmTemperature,
    llm_provider: resolveLlmProvider(input.llmModel),
    status: input.status ?? "draft",
    organization_id: organizationId,
    created_by: userId,
    setup_state: input.setupState ? toSetupStateJson(input.setupState) : null,
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
  const supabase = createServiceSupabaseClient();

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

export async function restoreDeletedAgents(
  agentIds: string[],
  organizationId: string
): Promise<DbResult<Agent[]>> {
  const uniqueAgentIds = [...new Set(agentIds)];

  if (uniqueAgentIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("agents")
    .update({ deleted_at: null })
    .eq("organization_id", organizationId)
    .in("id", uniqueAgentIds)
    .not("deleted_at", "is", null)
    .select("*");

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as Agent[], error: null };
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

  const updateFields: AgentUpdateWithSetupState = {};

  if (input.name !== undefined) updateFields.name = input.name;
  if (input.description !== undefined) updateFields.description = input.description?.trim() || null;
  if (input.systemPrompt !== undefined) updateFields.system_prompt = input.systemPrompt;
  if (input.llmModel !== undefined) {
    updateFields.llm_model = input.llmModel;
    updateFields.llm_provider = resolveLlmProvider(input.llmModel);
  }
  if (input.llmTemperature !== undefined) updateFields.llm_temperature = input.llmTemperature;
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.setupState !== undefined) updateFields.setup_state = toSetupStateJson(input.setupState);

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

export async function updateAgentSetupState(
  agentId: string,
  organizationId: string,
  setupState: AgentSetupState
): Promise<DbResult<Agent>> {
  const supabase = await createServerSupabaseClient();
  const updateFields: AgentUpdateWithSetupState = {
    setup_state: toSetupStateJson(setupState),
  };

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