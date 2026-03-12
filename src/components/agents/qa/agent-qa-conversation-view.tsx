"use client";

import type { Message } from "@/types/app";
import type { QaConversationDetail } from "@/lib/chat/qa";
import type { MessageQaReview, QaReviewStatus } from "@/lib/chat/conversation-metadata";
import type { ConversationReviewDraft } from "@/components/agents/qa/agent-qa-review-draft";

type AgentQaConversationViewProps = {
  conversation: QaConversationDetail | null;
  messages: Message[];
  reviewDraft: ConversationReviewDraft;
  savePending: boolean;
  proposalPending: boolean;
  onConversationStatusChange: (status: QaReviewStatus) => void;
  onConversationNoteChange: (value: string) => void;
  onClearConversationReview: () => void;
  onMessageStatusChange: (messageId: string, status: QaReviewStatus) => void;
  onMessageNoteChange: (messageId: string, note: string) => void;
  onClearMessageReview: (messageId: string) => void;
  onSave: () => void;
  onCreateProposal: () => void;
};

const STATUS_OPTIONS: Array<{ value: QaReviewStatus; label: string }> = [
  { value: "approved", label: "Aprobada" },
  { value: "fixable", label: "Corregible" },
  { value: "critical", label: "Critica" },
];

function getMessageReview(messageId: string, reviews: MessageQaReview[]): MessageQaReview | undefined {
  return reviews.find((review) => review.messageId === messageId);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getConversationTypeLabel(chatMode: QaConversationDetail["chatMode"]): string {
  if (chatMode === "live_external") {
    return "WhatsApp real";
  }

  if (chatMode === "qa_imported") {
    return "WhatsApp importado";
  }

  return "Chat local";
}

export function AgentQaConversationView({
  conversation,
  messages,
  reviewDraft,
  savePending,
  proposalPending,
  onConversationStatusChange,
  onConversationNoteChange,
  onClearConversationReview,
  onMessageStatusChange,
  onMessageNoteChange,
  onClearMessageReview,
  onSave,
  onCreateProposal,
}: AgentQaConversationViewProps) {
  if (!conversation) {
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Todavia no hay conversaciones reales</h3>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Cuando existan chats operativos, conversaciones conectadas o transcripts importados, podras revisarlos aqui, calificarlos y proponer mejoras al borrador.
          </p>
        </div>
      </div>
    );
  }

  const hasConversationReview =
    reviewDraft.conversationStatus !== null || reviewDraft.conversationNote.trim().length > 0;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-[linear-gradient(135deg,#ecfdf5,#f8fafc)] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800">
                {getConversationTypeLabel(conversation.chatMode)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 ring-1 ring-inset ring-slate-200">
                {formatDate(conversation.startedAt)}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-950">{conversation.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{conversation.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={savePending}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savePending ? "Guardando..." : "Guardar revision"}
            </button>
            <button
              type="button"
              onClick={onCreateProposal}
              disabled={proposalPending}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {proposalPending ? "Generando..." : "Crear propuesta en draft"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="max-h-[760px] overflow-y-auto bg-[linear-gradient(180deg,#f0fdf4,#ffffff_18%)] px-4 py-5 sm:px-6">
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === "user";
              const messageReview = getMessageReview(message.id, reviewDraft.messageReviews);

              return (
                <article key={message.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[90%] rounded-[1.5rem] px-4 py-3 shadow-sm ${isUser ? "bg-white ring-1 ring-inset ring-slate-200" : "bg-emerald-500 text-white"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">
                      <span>{isUser ? "Cliente" : "Agente"}</span>
                      <span>{formatDate(message.created_at)}</span>
                    </div>
                    <p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${isUser ? "text-slate-700" : "text-white"}`}>
                      {message.content}
                    </p>

                    {!isUser ? (
                      <div className="mt-4 rounded-2xl bg-white/10 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-50">QA del mensaje</p>
                          {messageReview ? (
                            <button
                              type="button"
                              onClick={() => onClearMessageReview(message.id)}
                              className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/10"
                            >
                              Limpiar
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((status) => (
                            <button
                              key={status.value}
                              type="button"
                              onClick={() => onMessageStatusChange(message.id, status.value)}
                              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
                                messageReview?.status === status.value
                                  ? "bg-white text-slate-900"
                                  : "bg-white/10 text-white"
                              }`}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={messageReview?.note ?? ""}
                          onChange={(event) => onMessageNoteChange(message.id, event.target.value)}
                          rows={2}
                          disabled={!messageReview}
                          placeholder={messageReview ? "Observacion opcional sobre este mensaje" : "Marca un estado para agregar una observacion"}
                          className={`mt-3 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-emerald-50/60 focus:border-white/30 ${
                            messageReview ? "" : "cursor-not-allowed opacity-60"
                          }`}
                        />
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="border-t border-slate-200 bg-slate-50 px-5 py-5 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Revision global</p>
            {hasConversationReview ? (
              <button
                type="button"
                onClick={onClearConversationReview}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-100"
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => onConversationStatusChange(status.value)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
                  reviewDraft.conversationStatus === status.value
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200"
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-900">Nota de QA</span>
            <textarea
              value={reviewDraft.conversationNote}
              onChange={(event) => onConversationNoteChange(event.target.value)}
              rows={8}
              placeholder="Que estuvo bien, que deberia corregirse y que esperas ver en la propuesta al borrador"
              className="mt-2 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400"
            />
          </label>
        </aside>
      </div>
    </section>
  );
}
