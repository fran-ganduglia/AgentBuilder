import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAgentById,
  listAgents,
  listAgentsByIds,
} from "@/lib/db/agents";
import { getAgentConnectionSummaryByAgentId } from "@/lib/db/agent-connections";
import { buildAgentConnectionSummary, type AgentConnectionSummary } from "@/lib/agents/connection-policy";
import type { Agent, AgentStatus, AppUser, Role } from "@/types/app";

export type AgentCapability = "read" | "use" | "edit" | "manage_documents";

export type AuthorizedSession = {
  user: AppUser;
  organizationId: string;
  role: Role;
};

type AgentPermissionRow = {
  can_use: boolean | null;
  can_edit: boolean | null;
};

type AgentAccessDeniedReason = "not_found" | "forbidden" | "inactive";

export type AgentAccessDeniedResult = {
  ok: false;
  status: 403 | 404;
  message: string;
  reason: AgentAccessDeniedReason;
};

export type AgentAccessAllowedResult = {
  ok: true;
  agent: Agent;
  hasConnection: boolean;
  connectionSummary: AgentConnectionSummary;
  permission: AgentPermissionRow | null;
};

export type AgentAccessResult = AgentAccessAllowedResult | AgentAccessDeniedResult;

type AssertAgentAccessOptions = {
  session: AuthorizedSession;
  agentId: string;
  capability: AgentCapability;
  requireActiveStatus?: boolean;
  allowedStatuses?: AgentStatus[];
};

type DbResult<T> = { data: T | null; error: string | null };

function deny(
  status: 403 | 404,
  message: string,
  reason: AgentAccessDeniedReason
): AgentAccessDeniedResult {
  return { ok: false, status, message, reason };
}

function hasOrganizationWideAgentAccess(role: Role): boolean {
  return role === "admin" || role === "editor";
}

function roleAllowsCapability(role: Role, capability: AgentCapability): boolean {
  if (role === "admin" || role === "editor") {
    return true;
  }

  if (role === "operador") {
    return capability === "read" || capability === "use";
  }

  if (role === "viewer") {
    return capability === "read";
  }

  return false;
}

function agentPassesKillSwitch(agent: Agent): boolean {
  const killSwitchValue = Reflect.get(agent as Record<string, unknown>, "is_active");

  return killSwitchValue !== false;
}

async function getAgentPermission(
  session: AuthorizedSession,
  agentId: string
): Promise<DbResult<AgentPermissionRow>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("user_agent_permissions")
    .select("can_use, can_edit")
    .eq("user_id", session.user.id)
    .eq("agent_id", agentId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data as AgentPermissionRow | null) ?? null, error: null };
}

export function canEditAgents(role: Role): boolean {
  return role === "admin" || role === "editor";
}

export function canManageAgentDocuments(role: Role): boolean {
  return canEditAgents(role);
}

export function canViewOrganizationUsage(role: Role): boolean {
  return role === "admin";
}

export async function listAccessibleAgents(
  session: AuthorizedSession
): Promise<DbResult<Agent[]>> {
  if (hasOrganizationWideAgentAccess(session.role)) {
    return listAgents(session.organizationId);
  }

  const permissionResult = await getAgentPermissionIds(session);
  if (permissionResult.error || !permissionResult.data) {
    return { data: null, error: permissionResult.error ?? "No se pudieron cargar los permisos" };
  }

  return listAgentsByIds(session.organizationId, permissionResult.data);
}

async function getAgentPermissionIds(
  session: AuthorizedSession
): Promise<DbResult<string[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("user_agent_permissions")
    .select("agent_id")
    .eq("user_id", session.user.id)
    .eq("organization_id", session.organizationId)
    .eq("can_use", true);

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: (data ?? []).map((row) => (row as { agent_id: string }).agent_id),
    error: null,
  };
}

export async function assertAgentAccess(
  options: AssertAgentAccessOptions
): Promise<AgentAccessResult> {
  const {
    session,
    agentId,
    capability,
    requireActiveStatus = false,
    allowedStatuses,
  } = options;

  const agentResult = await getAgentById(agentId, session.organizationId);
  if (agentResult.error || !agentResult.data) {
    return deny(404, "Agente no encontrado", "not_found");
  }

  if (!roleAllowsCapability(session.role, capability)) {
    return deny(404, "Agente no encontrado", "not_found");
  }

  let permission: AgentPermissionRow | null = null;

  if (!hasOrganizationWideAgentAccess(session.role)) {
    const permissionResult = await getAgentPermission(session, agentId);
    if (permissionResult.error) {
      return deny(404, "Agente no encontrado", "not_found");
    }

    permission = permissionResult.data;

    if (!permission || permission.can_use !== true) {
      return deny(404, "Agente no encontrado", "not_found");
    }
  }

  if (!agentPassesKillSwitch(agentResult.data)) {
    return deny(403, "El agente no esta activo", "inactive");
  }

  if (allowedStatuses && !allowedStatuses.includes(agentResult.data.status as AgentStatus)) {
    return deny(403, "El agente no esta disponible para esta accion", "inactive");
  }

  if (requireActiveStatus && agentResult.data.status !== "active") {
    return deny(403, "El agente no esta activo", "inactive");
  }

  const connectionSummaryResult = await getAgentConnectionSummaryByAgentId(agentId, session.organizationId);
  if (connectionSummaryResult.error) {
    return deny(403, "No se pudo validar la conexion del agente", "forbidden");
  }

  const connectionSummary = buildAgentConnectionSummary(connectionSummaryResult.data);

  return {
    ok: true,
    agent: agentResult.data,
    hasConnection: connectionSummary.hasConnection,
    connectionSummary,
    permission,
  };
}
