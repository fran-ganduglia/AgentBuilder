import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import { getAutomationExamples } from "@/lib/agents/automation-suggestions";

type RouteParams = { params: Promise<{ agentId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await params;
  const access = await assertAgentAccess({ session, agentId, capability: "read" });
  if (!access.ok) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const setupState = readAgentSetupState(access.agent);
  const integrations = setupState?.integrations ?? [];
  const suggestions = getAutomationExamples(
    integrations,
    setupState?.agentScope ?? "operations"
  );

  return NextResponse.json({ data: suggestions });
}
