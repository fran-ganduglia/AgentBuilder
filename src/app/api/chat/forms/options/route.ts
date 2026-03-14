import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { loadChatFormOptions } from "@/lib/chat/chat-form-search";
import { resolveChatFormContext } from "@/lib/chat/chat-form-server";
import { chatFormOptionsQuerySchema } from "@/lib/chat/chat-form-state";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = chatFormOptionsQuerySchema.safeParse(
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

  const options = await loadChatFormOptions({
    agentId: parsed.data.agentId,
    organizationId: session.organizationId,
    formId: parsed.data.formId,
    pipelineId: parsed.data.pipelineId,
  });

  return NextResponse.json({ data: options });
}
