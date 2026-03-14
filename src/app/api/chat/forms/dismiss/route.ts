import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { chatFormDismissRequestSchema } from "@/lib/chat/chat-form-state";
import {
  dismissPendingChatForm,
  resolveChatFormContext,
} from "@/lib/chat/chat-form-server";
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

  const parsedBody = await parseJsonRequestBody(request, chatFormDismissRequestSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const context = await resolveChatFormContext({
    session,
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
  });

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const state = await dismissPendingChatForm({
    conversation: context.conversation,
    agentId: parsedBody.data.agentId,
    organizationId: session.organizationId,
  });

  return NextResponse.json({ data: state });
}
