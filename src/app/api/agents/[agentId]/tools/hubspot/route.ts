import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  assertHubSpotActionEnabled,
  assertHubSpotRuntimeUsable,
  executeHubSpotToolAction,
  getHubSpotAgentToolRuntime,
} from "@/lib/integrations/hubspot-agent-runtime";
import { executeHubSpotCrmToolSchema } from "@/lib/integrations/hubspot-tools";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "use",
    allowedStatuses: ["active"],
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const parsedBody = await parseJsonRequestBody(request, executeHubSpotCrmToolSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const runtimeResult = await getHubSpotAgentToolRuntime(agentId, session.organizationId);
  if (runtimeResult.error || !runtimeResult.data) {
    return NextResponse.json({ error: runtimeResult.error ?? "No se pudo cargar la tool CRM" }, { status: 403 });
  }

  const usableRuntime = assertHubSpotRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return NextResponse.json({ error: usableRuntime.error ?? "La integracion no esta disponible" }, { status: 403 });
  }

  const enabledRuntime = assertHubSpotActionEnabled(usableRuntime.data, parsedBody.data.action);
  if (enabledRuntime.error) {
    return NextResponse.json({ error: enabledRuntime.error }, { status: 403 });
  }

  const execution = await executeHubSpotToolAction({
    organizationId: session.organizationId,
    userId: session.user.id,
    agentId,
    integrationId: usableRuntime.data.integration.id,
    actionInput: parsedBody.data,
  });

  if (execution.error || !execution.data) {
    const status = execution.error?.includes("reautenticacion") ? 403 : 502;
    return NextResponse.json({ error: execution.error ?? "No se pudo ejecutar la accion en HubSpot" }, { status });
  }

  return NextResponse.json({ data: execution.data.data });
}
