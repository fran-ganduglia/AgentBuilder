import { redirect } from "next/navigation";
import { buildAgentConnectionSummary } from "@/lib/agents/connection-policy";
import { getSession } from "@/lib/auth/get-session";
import {
  canEditAgents,
  listAccessibleAgents,
} from "@/lib/auth/agent-access";
import { listAgentConnectionSummaries } from "@/lib/db/agent-connections";
import { listDeletedAgents } from "@/lib/db/agents";
import { AgentsPageView } from "@/components/agents/agents-page-view";

export default async function AgentsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const canManageAgents = canEditAgents(session.role);
  const canDeleteAgents = session.role === "admin";
  const [{ data: agents }, { data: connectionSummaries }, { data: deletedAgents }] = await Promise.all([
    listAccessibleAgents(session),
    listAgentConnectionSummaries(session.organizationId),
    canManageAgents
      ? listDeletedAgents(session.organizationId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const connectedAgentTypes = Object.fromEntries(
    (connectionSummaries ?? []).map((connection) => [
      connection.agent_id,
      buildAgentConnectionSummary(connection).label,
    ])
  );

  return (
    <AgentsPageView
      activeAgents={agents ?? []}
      deletedAgents={deletedAgents ?? []}
      connectedAgentTypes={connectedAgentTypes}
      canCreate={canManageAgents}
      canDeleteAgents={canDeleteAgents}
      canRestoreAgents={canManageAgents}
    />
  );
}
