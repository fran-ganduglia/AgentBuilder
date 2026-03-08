import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { listAgents } from "@/lib/db/agents";
import { AgentList } from "@/components/agents/agent-list";

export default async function AgentsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: agents } = await listAgents(session.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Agentes</h1>
        <Link
          href="/agents/new"
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Nuevo agente
        </Link>
      </div>
      <AgentList agents={agents ?? []} />
    </div>
  );
}
