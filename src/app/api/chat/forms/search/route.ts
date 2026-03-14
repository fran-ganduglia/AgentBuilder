import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { assertChatFormSearchAllowed, searchChatFormRelations } from "@/lib/chat/chat-form-search";
import { resolveChatFormContext } from "@/lib/chat/chat-form-server";
import { chatFormSearchRequestSchema } from "@/lib/chat/chat-form-state";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

export async function POST(request: Request): Promise<Response> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsedBody = await parseJsonRequestBody(request, chatFormSearchRequestSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const allowed = await assertChatFormSearchAllowed({
    organizationId: session.organizationId,
    conversationId: parsedBody.data.conversationId,
  }).catch(() => false);

  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas busquedas seguidas. Intenta de nuevo en unos segundos." }, { status: 429 });
  }

  const context = await resolveChatFormContext({
    session,
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
  });

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const results = await searchChatFormRelations({
    agentId: parsedBody.data.agentId,
    organizationId: session.organizationId,
    formId: parsedBody.data.formId,
    fieldKey: parsedBody.data.fieldKey,
    query: parsedBody.data.query,
    limit: parsedBody.data.limit ?? 10,
  });

  return NextResponse.json({ data: results.slice(0, 10) });
}
