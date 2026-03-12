"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message, AgentConnection } from "@/types/app";
import type { QaReviewStatus } from "@/lib/chat/conversation-metadata";
import type { QaConversationDetail, QaConversationSummary, QaStats } from "@/lib/chat/qa";
import { saveQaDraftProposal } from "@/lib/chat/session-draft";
import {
  createReviewDraft,
  type ConversationReviewDraft,
  updateMessageReviewNote,
  upsertMessageReview,
} from "@/components/agents/qa/agent-qa-review-draft";
import { AgentQaConversationView } from "@/components/agents/qa/agent-qa-conversation-view";
import { AgentQaImportForm } from "@/components/agents/qa/agent-qa-import-form";
import { AgentQaWhatsAppConnection } from "@/components/agents/qa/agent-qa-whatsapp-connection";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type QaPayload = {
  stats: QaStats;
  summaries: QaConversationSummary[];
  selectedConversation: QaConversationDetail | null;
  messages: Message[];
};

type AgentQaPanelProps = {
  agentId: string;
  agentStatus: string;
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  whatsappIntegrationId: string | null;
};

function getConversationBadge(chatMode: QaConversationSummary["chatMode"]): string {
  if (chatMode === "live_external") {
    return "WA real";
  }

  if (chatMode === "qa_imported") {
    return "Importada";
  }

  return "Local";
}

export function AgentQaPanel({
  agentId,
  agentStatus,
  connection,
  connectionSummary,
  whatsappIntegrationId,
}: AgentQaPanelProps) {
  const [data, setData] = useState<QaPayload | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ConversationReviewDraft>(createReviewDraft(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadQaData = useCallback(async (conversationId?: string | null) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      if (conversationId) {
        params.set("conversationId", conversationId);
      }

      const query = params.toString();
      const response = await fetch(query ? `/api/agents/${agentId}/qa?${query}` : `/api/agents/${agentId}/qa`);
      const result = (await response.json()) as { data?: QaPayload; error?: string };

      if (!response.ok || !result.data) {
        setErrorMessage(result.error ?? "No se pudo cargar el panel QA.");
        return;
      }

      setData(result.data);
      setReviewDraft(createReviewDraft(result.data.selectedConversation?.review));
    } catch {
      setErrorMessage("No se pudo cargar el panel QA.");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadQaData();
  }, [loadQaData]);

  const summaries = data?.summaries ?? [];
  const selectedConversation = data?.selectedConversation ?? null;
  const selectedConversationId = selectedConversation?.id ?? null;
  const messages = data?.messages ?? [];
  const stats = data?.stats ?? {
    sandboxCount: 0,
    liveLocalCount: 0,
    liveExternalCount: 0,
    qaImportedCount: 0,
    realCount: 0,
  };
  const summaryLabel = [
    `${stats.liveLocalCount} locales`,
    `${stats.liveExternalCount} conectadas`,
    `${stats.qaImportedCount} importadas`,
    `${stats.sandboxCount} sandbox`,
  ].join(" | ");

  function handleMessageStatusChange(messageId: string, status: QaReviewStatus) {
    setReviewDraft((current) => {
      const existingReview = current.messageReviews.find((review) => review.messageId === messageId);
      return {
        ...current,
        messageReviews: upsertMessageReview(
          current.messageReviews,
          messageId,
          status,
          existingReview?.note ?? ""
        ),
      };
    });
  }

  function handleMessageNoteChange(messageId: string, note: string) {
    setReviewDraft((current) => {
      const hasReview = current.messageReviews.some((review) => review.messageId === messageId);
      if (!hasReview) {
        return current;
      }

      return {
        ...current,
        messageReviews: updateMessageReviewNote(current.messageReviews, messageId, note),
      };
    });
  }

  function handleClearConversationReview() {
    setReviewDraft((current) => ({ ...current, conversationStatus: null, conversationNote: "" }));
  }

  function handleClearMessageReview(messageId: string) {
    setReviewDraft((current) => ({
      ...current,
      messageReviews: current.messageReviews.filter((review) => review.messageId !== messageId),
    }));
  }

  async function handleSave() {
    if (!selectedConversation) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/qa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          conversationStatus: reviewDraft.conversationStatus ?? undefined,
          conversationNote: reviewDraft.conversationNote.trim() || undefined,
          messageReviews: reviewDraft.messageReviews,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(result.error ?? "No se pudo guardar la revision QA.");
        return;
      }

      await loadQaData(selectedConversation.id);
    } catch {
      setErrorMessage("No se pudo guardar la revision QA.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateProposal() {
    if (!selectedConversation) {
      return;
    }

    setIsGeneratingProposal(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/qa/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversation.id }),
      });
      const result = (await response.json()) as {
        data?: {
          summary: string;
          suggestedSystemPrompt: string;
          recommendations: string[];
          conversationId: string;
          createdAt: string;
        };
        error?: string;
      };

      if (!response.ok || !result.data) {
        setErrorMessage(result.error ?? "No se pudo generar la propuesta QA.");
        return;
      }

      saveQaDraftProposal(agentId, result.data);
      window.location.assign(`/agents/${agentId}?tab=config&proposal=1`);
    } catch {
      setErrorMessage("No se pudo generar la propuesta QA.");
    } finally {
      setIsGeneratingProposal(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">QA activo</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Inbox de conversaciones reales</h2>
            <p className="mt-2 text-sm text-slate-600">{summaryLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowImportForm((current) => !current)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {showImportForm ? "Ocultar importacion" : "Import manual (fallback)"}
          </button>
        </div>
      </div>

      <AgentQaWhatsAppConnection
        agentId={agentId}
        agentStatus={agentStatus}
        connection={connection}
        connectionSummary={connectionSummary}
        whatsappIntegrationId={whatsappIntegrationId}
        onConnected={() => void loadQaData()}
        onRefreshed={() => void loadQaData(selectedConversationId)}
        onError={(message) => setErrorMessage(message || null)}
      />

      {showImportForm ? (
        <AgentQaImportForm
          agentId={agentId}
          onCancel={() => setShowImportForm(false)}
          onImported={(conversationId) => {
            setShowImportForm(false);
            void loadQaData(conversationId);
          }}
        />
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#e8f5ee] shadow-sm">
          <div className="border-b border-emerald-200/70 px-4 py-4">
            <p className="text-sm font-semibold text-slate-700">Conversaciones QA</p>
          </div>
          <div className="max-h-[760px] overflow-y-auto bg-[linear-gradient(180deg,#daf0e2,#e8f5ee)] p-3">
            {isLoading ? <p className="p-3 text-sm text-slate-600">Cargando conversaciones...</p> : null}
            {!isLoading && summaries.length === 0 ? (
              <p className="p-3 text-sm text-slate-600">Todavia no hay conversaciones reales para revisar.</p>
            ) : null}
            <div className="space-y-2">
              {summaries.map((summary) => (
                <button
                  key={summary.id}
                  type="button"
                  onClick={() => void loadQaData(summary.id)}
                  className={`w-full rounded-[1.25rem] px-4 py-3 text-left transition-all ${
                    selectedConversationId === summary.id
                      ? "bg-white shadow-sm ring-1 ring-inset ring-emerald-300"
                      : "bg-white/65 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{summary.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{summary.subtitle}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800">
                      {getConversationBadge(summary.chatMode)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{summary.lastMessagePreview ?? "Sin preview disponible"}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <AgentQaConversationView
          conversation={selectedConversation}
          messages={messages}
          reviewDraft={reviewDraft}
          savePending={isSaving}
          proposalPending={isGeneratingProposal}
          onConversationStatusChange={(status) => setReviewDraft((current) => ({ ...current, conversationStatus: status }))}
          onConversationNoteChange={(value) => setReviewDraft((current) => ({ ...current, conversationNote: value }))}
          onClearConversationReview={handleClearConversationReview}
          onMessageStatusChange={handleMessageStatusChange}
          onMessageNoteChange={handleMessageNoteChange}
          onClearMessageReview={handleClearMessageReview}
          onSave={handleSave}
          onCreateProposal={handleCreateProposal}
        />
      </div>
    </section>
  );
}
