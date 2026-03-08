import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getAgentById } from "@/lib/db/agents";
import { getOrCreateConversation } from "@/lib/db/conversations";
import { listMessages } from "@/lib/db/messages";
import { ChatWindow } from "@/components/chat/chat-window";

type ChatPageProps = {
  params: Promise<{ agentId: string }>;
};

export default async function AgentChatPage({ params }: ChatPageProps) {
  const { agentId } = await params;
  const user = await requireUser();

  const { data: agent } = await getAgentById(agentId, user.organizationId);

  if (!agent) {
    notFound();
  }

  if (agent.status !== "active") {
    redirect("/agents");
  }

  const { data: conversation } = await getOrCreateConversation(
    agentId,
    user.organizationId,
    user.id
  );

  let initialMessages: Awaited<ReturnType<typeof listMessages>>["data"] = [];

  if (conversation) {
    const { data: messages } = await listMessages(
      conversation.id,
      user.organizationId
    );
    initialMessages = messages ?? [];
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center border-b border-gray-200 px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-900">{agent.name}</h1>
        <span className="ml-3 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
          {agent.llm_model}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow agentId={agentId} initialMessages={initialMessages} />
      </div>
    </div>
  );
}
