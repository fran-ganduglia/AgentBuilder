import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/chat-window";
import { isWhatsAppChannelAgent } from "@/lib/agents/agent-setup-state";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { requireUser } from "@/lib/auth/require-user";
import { getConversationById, getOrCreateConversation } from "@/lib/db/conversations";
import { listMessages } from "@/lib/db/messages";
import type { ChatMode } from "@/lib/chat/conversation-metadata";
import type { AgentStatus } from "@/types/app";

type ChatPageProps = {
  params: Promise<{ agentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readFirstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function canUseSandbox(role: string): boolean {
  return role === "admin" || role === "editor";
}

function getChatFallbackUrl(
  agentId: string,
  connectionClassification: "local" | "remote_managed" | "channel_connected"
): string {
  return connectionClassification === "channel_connected"
    ? `/agents/${agentId}?tab=qa`
    : `/agents/${agentId}`;
}

function resolveRequestedChatMode(
  requestedChatMode: string | undefined,
  agentStatus: string,
  connectionClassification: "local" | "remote_managed" | "channel_connected",
  userRole: string,
  isWhatsAppIntent: boolean
): ChatMode | null {
  if (requestedChatMode === "sandbox") {
    return "sandbox";
  }

  if (requestedChatMode === "live_local") {
    if (connectionClassification === "channel_connected" || isWhatsAppIntent) {
      return null;
    }

    return "live_local";
  }

  if (connectionClassification === "channel_connected" || isWhatsAppIntent) {
    return canUseSandbox(userRole) ? "sandbox" : null;
  }

  if (agentStatus === "draft") {
    return "sandbox";
  }

  return "live_local";
}

export default async function AgentChatPage({ params, searchParams }: ChatPageProps) {
  const { agentId } = await params;
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedChatMode = readFirstValue(resolvedSearchParams.chatMode);
  const requestedPreview = readFirstValue(resolvedSearchParams.preview) === "1";

  const access = await assertAgentAccess({
    session: {
      user,
      organizationId: user.organizationId,
      role: user.role,
    },
    agentId,
    capability: "use",
    allowedStatuses: canUseSandbox(user.role) ? ["draft", "active"] : ["active"],
  });

  if (!access.ok) {
    if (access.status === 404) {
      notFound();
    }

    redirect(`/agents/${agentId}`);
  }

  if (access.connectionSummary.classification === "remote_managed") {
    redirect(`/agents/${agentId}`);
  }

  const whatsappIntent = isWhatsAppChannelAgent(access.agent);
  const fallbackUrl = getChatFallbackUrl(agentId, access.connectionSummary.classification);
  const chatMode = resolveRequestedChatMode(
    requestedChatMode,
    access.agent.status,
    access.connectionSummary.classification,
    user.role,
    whatsappIntent
  );

  if (!chatMode) {
    redirect(fallbackUrl);
  }

  if (chatMode === "sandbox" && !canUseSandbox(user.role)) {
    redirect(fallbackUrl);
  }

  if (chatMode === "live_local" && (access.connectionSummary.classification !== "local" || whatsappIntent)) {
    redirect(fallbackUrl);
  }

  if (chatMode === "live_local" && access.agent.status !== "active") {
    redirect(`/agents/${agentId}`);
  }

  const { data: conversation } = await getOrCreateConversation(
    agentId,
    user.organizationId,
    user.id,
    {
      chatMode,
      channel: "web",
    }
  );

  let initialMessages: Awaited<ReturnType<typeof listMessages>>["data"] = [];

  if (conversation) {
    const verifiedConversation = await getConversationById(
      conversation.id,
      agentId,
      user.organizationId,
      user.id
    );

    if (!verifiedConversation.data) {
      notFound();
    }

    const { data: messages } = await listMessages(
      conversation.id,
      user.organizationId
    );
    initialMessages = messages ?? [];
  }

  const isSandbox = chatMode === "sandbox";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/agents/${agentId}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-base font-bold tracking-tight text-white">{access.agent.name}</h1>
              <span className="flex items-center rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-300 ring-1 ring-inset ring-slate-700">
                {access.agent.llm_model}
              </span>
              <span
                className={`flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold tracking-widest ring-1 ring-inset ${
                  isSandbox
                    ? "bg-amber-500/15 text-amber-200 ring-amber-500/25"
                    : "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                }`}
              >
                {isSandbox ? "SANDBOX" : "LIVE LOCAL"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {isSandbox ? "Entorno de afinacion y pruebas" : "Chat operativo local"}
            </span>
            {requestedPreview ? (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200 ring-1 ring-inset ring-amber-500/20">
                Preview solicitado
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ChatWindow
          agentId={agentId}
          agentStatus={access.agent.status as AgentStatus}
          chatMode={chatMode}
          initialMessages={initialMessages}
          initialExecutionMode={requestedPreview ? "preview" : "saved"}
        />
      </div>
    </div>
  );
}