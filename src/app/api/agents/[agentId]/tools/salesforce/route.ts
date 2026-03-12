import { NextResponse } from "next/server";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  executeSalesforceToolAction,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
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

  const parsedBody = await parseJsonRequestBody(request, executeSalesforceCrmToolSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const runtimeResult = await getSalesforceAgentToolRuntime(agentId, session.organizationId);
  if (runtimeResult.error || !runtimeResult.data) {
    return NextResponse.json({ error: runtimeResult.error ?? "No se pudo cargar la tool CRM" }, { status: 403 });
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    return NextResponse.json({ error: usableRuntime.error ?? "La integracion no esta disponible" }, { status: 403 });
  }

  const enabledRuntime = assertSalesforceActionEnabled(usableRuntime.data, parsedBody.data.action);
  if (enabledRuntime.error) {
    return NextResponse.json({ error: enabledRuntime.error }, { status: 403 });
  }

  const execution = await executeSalesforceToolAction({
    organizationId: session.organizationId,
    userId: session.user.id,
    agentId,
    integrationId: usableRuntime.data.integration.id,
    actionInput: parsedBody.data,
  });

  if (execution.error || !execution.data) {
    const status = execution.error?.includes("reautenticacion") ? 403 : 502;
    return NextResponse.json({ error: execution.error ?? "No se pudo ejecutar la accion en Salesforce" }, { status });
  }

  return NextResponse.json({ data: execution.data.data });
}
