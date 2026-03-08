import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { AgentForm } from "@/components/agents/agent-form";

export default async function NewAgentPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Crear agente</h1>
      <AgentForm />
    </div>
  );
}
