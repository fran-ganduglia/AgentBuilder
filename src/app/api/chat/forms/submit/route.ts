import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import {
  buildActiveChatUiState,
  resolveChatFormContext,
} from "@/lib/chat/chat-form-server";
import { submitChatFormBridge } from "@/lib/chat/chat-form-submit";
import {
  chatFormSubmitRequestSchema,
  type ActiveChatUiState,
} from "@/lib/chat/chat-form-state";
import { acquireRedisLock, getJsonValue, releaseRedisLock, setJsonValue } from "@/lib/redis";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";

const SUBMIT_IDEMPOTENCY_TTL_SECONDS = 5 * 60;
const SUBMIT_LOCK_TTL_SECONDS = 30;

function buildSubmitDataKey(conversationId: string, submissionKey: string): string {
  return `chat_form.submit:${conversationId}:${submissionKey}`;
}

function buildSubmitLockKey(conversationId: string, submissionKey: string): string {
  return `chat_form.submit_lock:${conversationId}:${submissionKey}`;
}

export async function POST(request: Request): Promise<Response> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsedBody = await parseJsonRequestBody(request, chatFormSubmitRequestSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const dataKey = buildSubmitDataKey(
    parsedBody.data.conversationId,
    parsedBody.data.submissionKey
  );
  const lockKey = buildSubmitLockKey(
    parsedBody.data.conversationId,
    parsedBody.data.submissionKey
  );

  const cachedState = await getJsonValue<ActiveChatUiState>(dataKey);
  if (cachedState) {
    return NextResponse.json({ data: cachedState });
  }

  const lockAcquired = await acquireRedisLock(
    lockKey,
    parsedBody.data.submissionKey,
    SUBMIT_LOCK_TTL_SECONDS
  );

  if (!lockAcquired) {
    const retryState = await getJsonValue<ActiveChatUiState>(dataKey);
    if (retryState) {
      return NextResponse.json({ data: retryState });
    }

    const context = await resolveChatFormContext({
      session,
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
    });

    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    return NextResponse.json({
      data: buildActiveChatUiState(context.conversation),
    });
  }

  try {
    const context = await resolveChatFormContext({
      session,
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
    });

    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const result = await submitChatFormBridge({
      agentId: parsedBody.data.agentId,
      organizationId: session.organizationId,
      userId: session.user.id,
      conversation: context.conversation,
      request: {
        ...parsedBody.data,
        draftValues: parsedBody.data.draftValues ?? {},
        relationSelections: parsedBody.data.relationSelections ?? {},
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.validation ? result.validation : {}),
        },
        { status: result.status }
      );
    }

    await setJsonValue(dataKey, result.state, SUBMIT_IDEMPOTENCY_TTL_SECONDS);
    return NextResponse.json({ data: result.state });
  } finally {
    if (lockAcquired) {
      await releaseRedisLock(lockKey, parsedBody.data.submissionKey).catch(() => undefined);
    }
  }
}
