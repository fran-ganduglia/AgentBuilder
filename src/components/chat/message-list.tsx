"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InlineChatConfirmationCard,
  InlineChatFormCard,
} from "@/components/chat/inline-chat-form-card";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";
import { extractChatFollowUpIntents } from "@/lib/chat/follow-up-intents";
import {
  getChatFormDefinition,
  parseChatConfirmationMarker,
  parseChatFormMarker,
} from "@/lib/chat/inline-forms";
import {
  resolveInlineFallbackQuickActions,
  type ChatQuickAction,
  type ResolvedChatQuickActions,
} from "@/lib/chat/quick-actions";
import type { Message } from "@/types/app";

type MessageListProps = {
  messages: Message[];
  emptyStateActions?: ChatQuickAction[];
  quickActions?: ResolvedChatQuickActions;
  onQuickActionSelect?: (prompt: string) => void;
  onFollowUpIntentSelect?: (prompt: string) => void;
  activeUiState?: ActiveChatUiState;
  activeFormValues?: Record<string, string>;
  activeFormFieldErrors?: Record<string, string>;
  activeFormError?: string | null;
  isSavingFormDraft?: boolean;
  onFormDraftChange?: (values: Record<string, string>) => void;
  onFormDismiss?: () => void;
  onFormSubmit?: (values: Record<string, string>) => void | Promise<void>;
  onFormConfirm?: () => void;
  isLoading?: boolean;
};

export function MessageList({
  messages,
  emptyStateActions,
  quickActions,
  onQuickActionSelect,
  onFollowUpIntentSelect,
  activeUiState = { kind: "none" },
  activeFormValues,
  activeFormFieldErrors,
  activeFormError,
  isSavingFormDraft = false,
  onFormDraftChange,
  onFormDismiss,
  onFormSubmit,
  onFormConfirm,
  isLoading = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [dismissedInlineSurfaces, setDismissedInlineSurfaces] = useState<
    Set<string>
  >(new Set());
  const inlineFallbackActions = useMemo(
    () =>
      quickActions?.isCrmChat
        ? resolveInlineFallbackQuickActions(quickActions)
        : [],
    [quickActions]
  );
  const lastAssistantMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "assistant") {
        return message.id;
      }
    }

    return null;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 shadow-sm ring-1 ring-inset ring-slate-900/5">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">Empezar conversacion</h3>
          <p className="mt-2 text-sm text-slate-500">Envia tu primer mensaje para inicializar el hilo de trazabilidad.</p>
          {emptyStateActions && emptyStateActions.length > 0 ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {emptyStateActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onQuickActionSelect?.(action.prompt)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const parsedFormMarker = isUser ? null : parseChatFormMarker(message.content);
        const parsedConfirmationMarker =
          isUser || parsedFormMarker
            ? null
            : parseChatConfirmationMarker(message.content);
        const renderedContent =
          parsedFormMarker?.content ??
          parsedConfirmationMarker?.content ??
          message.content;
        const isActiveFormInline =
          activeUiState.kind === "form" &&
          activeUiState.session.sourceMessageId === message.id &&
          !dismissedInlineSurfaces.has(message.id) &&
          !isLoading;
        const isActiveConfirmationInline =
          activeUiState.kind === "confirmation" &&
          activeUiState.sourceMessageId === message.id &&
          !dismissedInlineSurfaces.has(message.id) &&
          !isLoading;
        const activeFormDefinition =
          isActiveFormInline
            ? getChatFormDefinition(activeUiState.session.formId)
            : null;
        const shouldShowConfirmationCard = isActiveConfirmationInline;
        const followUpIntents =
          isUser || activeFormDefinition || shouldShowConfirmationCard
            ? []
            : extractChatFollowUpIntents(renderedContent);
        const shouldShowInlineFallback =
          !isUser &&
          !isLoading &&
          followUpIntents.length === 0 &&
          message.id === lastAssistantMessageId &&
          !activeFormDefinition &&
          !shouldShowConfirmationCard &&
          inlineFallbackActions.length > 0;

        return (
          <div
            key={message.id}
            className={`w-full py-8 ${isUser ? "bg-white" : "border-y border-slate-100 bg-slate-50/80"}`}
          >
            <div className="mx-auto flex max-w-4xl gap-6 px-4 sm:px-6 lg:px-8">
              <div className="shrink-0">
                {isUser ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-sm">
                    U
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-900">
                  {isUser ? "Usuario" : "Agente"}
                </p>
                {renderedContent.trim().length > 0 ? (
                  <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {renderedContent}
                  </div>
                ) : null}
                {!isUser ? (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      aria-label="Marcar respuesta como util"
                    >
                      ??
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      aria-label="Marcar respuesta como no util"
                    >
                      ??
                    </button>
                  </div>
                ) : null}
                {activeFormDefinition ? (
                  <InlineChatFormCard
                    definition={activeFormDefinition}
                    initialValues={activeFormValues}
                    fieldErrors={activeFormFieldErrors}
                    submitError={activeFormError}
                    disabled={isLoading}
                    isSavingDraft={isSavingFormDraft}
                    onChange={onFormDraftChange}
                    onDismiss={() => {
                      setDismissedInlineSurfaces((current) => {
                        const next = new Set(current);
                        next.add(message.id);
                        return next;
                      });
                      onFormDismiss?.();
                    }}
                    onSubmit={onFormSubmit ?? (() => undefined)}
                  />
                ) : null}
                {shouldShowConfirmationCard ? (
                  <InlineChatConfirmationCard
                    provider={activeUiState.provider}
                    summary={activeUiState.summary}
                    disabled={isLoading}
                    onConfirm={() => onFormConfirm?.()}
                  />
                ) : null}
                {!isUser && followUpIntents.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {followUpIntents.map((intent) => (
                      <button
                        key={`${message.id}-${intent.id}`}
                        type="button"
                        disabled={isLoading}
                        onClick={() => onFollowUpIntentSelect?.(intent.prompt)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {intent.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {shouldShowInlineFallback ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {inlineFallbackActions.map((action) => (
                      <button
                        key={`${message.id}-${action.id}`}
                        type="button"
                        disabled={isLoading}
                        onClick={() => onQuickActionSelect?.(action.prompt)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} className="h-6" />
    </div>
  );
}
