import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { getAgentById, softDeleteAgent, updateAgent } from "@/lib/db/agents";
import { insertAuditLog } from "@/lib/db/audit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Role } from "@/types/app";
import type { Json } from "@/types/database";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
  validateSameOriginMutationRequest,
} from "@/lib/utils/request-security";

const ALLOWED_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "gemini-pro",
] as const;

const ROLES_WITH_WRITE_ACCESS: readonly Role[] = ["admin", "editor"];

const updateAgentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido").optional(),
  llmModel: z.enum(ALLOWED_MODELS, { message: "Modelo no permitido" }).optional(),
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0").optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!ROLES_WITH_WRITE_ACCESS.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;
  const { data: existingAgent } = await getAgentById(agentId, session.organizationId);
  if (!existingAgent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const parsedBody = await parseJsonRequestBody(request, updateAgentSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const { data: agent, error } = await updateAgent(
    agentId,
    parsedBody.data,
    session.organizationId
  );

  if (error || !agent) {
    return NextResponse.json(
      { error: error ?? "No se pudo actualizar el agente" },
      { status: 500 }
    );
  }

  // Create agent version snapshot (non-fatal)
  try {
    const serviceClient = createServiceSupabaseClient();

    const { data: maxVersionRow } = await serviceClient
      .from("agent_versions")
      .select("version_number")
      .eq("agent_id", agentId)
      .eq("organization_id", session.organizationId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxVersionRow?.version_number ?? 0) + 1;

    const versionConfig: Json = {
      name: agent.name,
      description: agent.description,
      temperature: agent.llm_temperature,
      max_tokens: agent.max_tokens,
      tone: agent.tone,
      language: agent.language,
      memory_enabled: agent.memory_enabled,
      memory_window: agent.memory_window,
      status: agent.status,
    };

    await serviceClient.from("agent_versions").insert({
      agent_id: agentId,
      organization_id: session.organizationId,
      version_number: nextVersion,
      system_prompt: agent.system_prompt,
      llm_model: agent.llm_model,
      llm_provider: agent.llm_provider,
      config: versionConfig,
      changed_by: session.user.id,
    });

    await serviceClient
      .from("agents")
      .update({ current_version: nextVersion })
      .eq("id", agentId)
      .eq("organization_id", session.organizationId);
  } catch (versionError) {
    console.error("agents.version_create_error", {
      agentId,
      error: versionError instanceof Error ? versionError.message : "unknown",
    });
  }

  // Audit log (non-fatal)
  const oldValues: Json = {
    name: existingAgent.name,
    status: existingAgent.status,
    llm_model: existingAgent.llm_model,
    llm_temperature: existingAgent.llm_temperature,
  };
  const newValues: Json = {
    name: agent.name,
    status: agent.status,
    llm_model: agent.llm_model,
    llm_temperature: agent.llm_temperature,
  };

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent.updated",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: oldValues,
    newValue: newValues,
  });

  return NextResponse.json({ data: agent });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateSameOriginMutationRequest(_request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { agentId } = await context.params;

  const { data: existingAgent } = await getAgentById(agentId, session.organizationId);
  if (!existingAgent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const { error } = await softDeleteAgent(agentId, session.organizationId);

  if (error) {
    return NextResponse.json(
      { error: "No se pudo eliminar el agente" },
      { status: 500 }
    );
  }

  void insertAuditLog({
    organizationId: session.organizationId,
    userId: session.user.id,
    action: "agent.deleted",
    resourceType: "agent",
    resourceId: agentId,
    oldValue: { name: existingAgent.name, status: existingAgent.status } as Json,
  });

  return NextResponse.json({ data: { success: true } });
}
