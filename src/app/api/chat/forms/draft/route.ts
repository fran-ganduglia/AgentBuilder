import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import {
  chatFormDraftRequestSchema,
} from "@/lib/chat/chat-form-state";
import {
  resolveChatFormContext,
  savePendingChatFormDraft,
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

  const parsedBody = await parseJsonRequestBody(request, chatFormDraftRequestSchema);
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

  const state = await savePendingChatFormDraft({
    conversation: context.conversation,
    agentId: parsedBody.data.agentId,
    organizationId: session.organizationId,
    draft: {
      ...parsedBody.data,
      draftValues: parsedBody.data.draftValues ?? {},
      relationSelections: parsedBody.data.relationSelections ?? {},
    },
  });

  return NextResponse.json({ data: state });
}
