import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/chat-window";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { requireUser } from "@/lib/auth/require-user";
import { resolveChatQuickActions } from "@/lib/chat/quick-actions-server";
import { getConversationById, getOrCreateConversation } from "@/lib/db/conversations";
import { listMessages } from "@/lib/db/messages";

type ChatPageProps = {
  params: Promise<{ agentId: string }>;
};

function canUseDraftChat(role: string): boolean {
  return role === "admin" || role === "editor";
}

export default async function AgentChatPage({ params }: ChatPageProps) {
  const { agentId } = await params;
  const user = await requireUser();

  const access = await assertAgentAccess({
    session: {
      user,
      organizationId: user.organizationId,
      role: user.role,
    },
    agentId,
    capability: "use",
    allowedStatuses: canUseDraftChat(user.role) ? ["draft", "active"] : ["active"],
  });

  if (!access.ok) {
    if (access.status === 404) {
      notFound();
    }

    redirect(`/agents/${agentId}`);
  }

  const isTestMode = access.agent.status === "draft";
  const chatMode = isTestMode ? "sandbox" : "live_local";

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

  const initialQuickActions = await resolveChatQuickActions(access.agent);

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
                  isTestMode
                    ? "bg-amber-500/15 text-amber-200 ring-amber-500/25"
                    : "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                }`}
              >
                {isTestMode ? "DRAFT" : "ACTIVE"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {isTestMode ? "Chat de prueba interno" : "Chat operativo del agente"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ChatWindow
          agentId={agentId}
          isTestMode={isTestMode}
          initialConversationId={conversation?.id ?? null}
          initialMessages={initialMessages}
          initialQuickActions={initialQuickActions}
        />
      </div>
    </div>
  );
}
