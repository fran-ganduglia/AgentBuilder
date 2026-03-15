import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  buildActiveChatUiState,
  cleanupExpiredChatUiState,
  resolveChatFormContext,
} from "@/lib/chat/chat-form-server";

const activeQuerySchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
});

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = activeQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Query invalida" },
      { status: 400 }
    );
  }

  const context = await resolveChatFormContext({
    session,
    agentId: parsed.data.agentId,
    conversationId: parsed.data.conversationId,
  });

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const state = await cleanupExpiredChatUiState({
    conversation: context.conversation,
    agentId: parsed.data.agentId,
    organizationId: session.organizationId,
  });

  return NextResponse.json({ data: state ?? buildActiveChatUiState(context.conversation) });
}
