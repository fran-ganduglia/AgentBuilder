import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  completePendingDeletionRequests,
  isDeletionRequestsUnavailableError,
} from "@/lib/db/deletion-requests";
import {
  listAgentsByIdsIncludingDeleted,
  restoreDeletedAgents,
} from "@/lib/db/agents";
import { insertAuditLog } from "@/lib/db/audit";
import { enqueueEvent } from "@/lib/db/event-queue";
import type { Agent, Role } from "@/types/app";
import type { Json } from "@/types/database";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const ROLES_WITH_RESTORE_ACCESS: readonly Role[] = ["admin", "editor"];

const restoreAgentsSchema = z.object({
  agentIds: z.array(z.string().uuid("Cada agentId debe ser un UUID valido")).min(1, "Selecciona al menos un agente"),
});

type RestoreFailureReason = "not_found" | "not_deleted" | "restore_failed";

type RestoreFailure = {
  agentId: string;
  reason: RestoreFailureReason;
};

function dedupeAgentIds(agentIds: string[]): string[] {
  return [...new Set(agentIds)];
}

function sortAgentsByCreatedAtDesc(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

    return rightTime - leftTime;
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!ROLES_WITH_RESTORE_ACCESS.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const parsedBody = await parseJsonRequestBody(request, restoreAgentsSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const requestedAgentIds = dedupeAgentIds(parsedBody.data.agentIds);
  const existingAgentsResult = await listAgentsByIdsIncludingDeleted(
    session.organizationId,
    requestedAgentIds
  );

  if (existingAgentsResult.error || !existingAgentsResult.data) {
    return NextResponse.json(
      { error: "No se pudieron cargar los agentes a restaurar" },
      { status: 500 }
    );
  }

  const existingAgentsById = new Map(existingAgentsResult.data.map((agent) => [agent.id, agent]));
  const failed: RestoreFailure[] = [];
  const restorableAgentIds: string[] = [];
  const restorableAgents: Agent[] = [];

  for (const agentId of requestedAgentIds) {
    const agent = existingAgentsById.get(agentId);

    if (!agent) {
      failed.push({ agentId, reason: "not_found" });
      continue;
    }

    if (!agent.deleted_at) {
      failed.push({ agentId, reason: "not_deleted" });
      continue;
    }

    restorableAgentIds.push(agentId);
    restorableAgents.push(agent);
  }

  if (restorableAgentIds.length === 0) {
    return NextResponse.json({
      data: {
        restoredAgents: [],
        restoredIds: [],
        failed,
      },
    });
  }

  const completionResult = await completePendingDeletionRequests({
    organizationId: session.organizationId,
    entityType: "agent",
    entityIds: restorableAgentIds,
  });

  if (completionResult.error) {
    if (!isDeletionRequestsUnavailableError(completionResult.error)) {
      console.error("agents.restore.complete_deletion_requests_error", {
        organizationId: session.organizationId,
        agentIds: restorableAgentIds,
        error: completionResult.error,
      });

      return NextResponse.json(
        { error: "No se pudo cancelar la purga pendiente de los agentes" },
        { status: 500 }
      );
    }

    console.warn("agents.restore.deletion_requests_unavailable", {
      organizationId: session.organizationId,
      agentIds: restorableAgentIds,
      error: completionResult.error,
    });
  }

  const restoreResult = await restoreDeletedAgents(restorableAgentIds, session.organizationId);
  if (restoreResult.error || !restoreResult.data) {
    console.error("agents.restore.restore_deleted_agents_error", {
      organizationId: session.organizationId,
      agentIds: restorableAgentIds,
      error: restoreResult.error,
    });

    return NextResponse.json(
      { error: "No se pudieron restaurar los agentes seleccionados" },
      { status: 500 }
    );
  }

  const restoredAgents = sortAgentsByCreatedAtDesc(restoreResult.data);
  const restoredIds = new Set(restoredAgents.map((agent) => agent.id));

  for (const agentId of restorableAgentIds) {
    if (!restoredIds.has(agentId)) {
      failed.push({ agentId, reason: "restore_failed" });
    }
  }

  const restoredAt = new Date().toISOString();

  for (const restoredAgent of restoredAgents) {
    const previousAgent = restorableAgents.find((agent) => agent.id === restoredAgent.id);

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "agent.restored",
      resourceType: "agent",
      resourceId: restoredAgent.id,
      oldValue: {
        name: previousAgent?.name ?? restoredAgent.name,
        status: previousAgent?.status ?? restoredAgent.status,
        deleted_at: previousAgent?.deleted_at ?? null,
      } as Json,
      newValue: {
        name: restoredAgent.name,
        status: restoredAgent.status,
        deleted_at: restoredAgent.deleted_at,
      } as Json,
    });

    void enqueueEvent({
      organizationId: session.organizationId,
      eventType: "agent.restored",
      entityType: "agent",
      entityId: restoredAgent.id,
      idempotencyKey: `agent.restored:${restoredAgent.id}:${restoredAt}`,
      payload: {
        agent_id: restoredAgent.id,
        name: restoredAgent.name,
        status: restoredAgent.status,
        restored_at: restoredAt,
      },
    });
  }

  return NextResponse.json({
    data: {
      restoredAgents,
      restoredIds: restoredAgents.map((agent) => agent.id),
      failed,
    },
  });
}