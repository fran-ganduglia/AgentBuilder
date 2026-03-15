"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DynamicChatFormCard } from "@/components/chat/dynamic-chat-form-card";
import {
  InlineChatConfirmationCard,
} from "@/components/chat/inline-chat-form-card";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";
import { extractChatFollowUpIntents } from "@/lib/chat/follow-up-intents";
import {
  parseChatConfirmationMarker,
} from "@/lib/chat/inline-forms";
import {
  parseChoiceChipsMarker,
  parseDynamicFormMarker,
  buildDynamicFormSubmissionMessage,
  type DynamicFormDefinition,
} from "@/lib/chat/interactive-markers";
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
  onFormConfirm?: () => void;
  onDynamicFormSubmit?: (definition: DynamicFormDefinition, values: Record<string, string>) => void;
  isLoading?: boolean;
};

export function MessageList({
  messages,
  emptyStateActions,
  quickActions,
  onQuickActionSelect,
  onFollowUpIntentSelect,
  activeUiState = { kind: "none" },
  onFormConfirm,
  onDynamicFormSubmit,
  isLoading = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [dismissedInlineSurfaces, setDismissedInlineSurfaces] = useState<
    Set<string>
  >(new Set());
  const inlineFallbackActions = useMemo(
    () =>
      quickActions?.hasConnectedIntegrations
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
        const parsedConfirmationMarker =
          isUser ? null : parseChatConfirmationMarker(message.content);
        const parsedChoices =
          isUser || parsedConfirmationMarker
            ? null
            : parseChoiceChipsMarker(message.content);
        const parsedDynamicForm =
          isUser || parsedConfirmationMarker || parsedChoices
            ? null
            : parseDynamicFormMarker(message.content);
        const renderedContent =
          parsedChoices?.strippedContent ??
          parsedDynamicForm?.strippedContent ??
          parsedConfirmationMarker?.content ??
          message.content;
        const isActiveConfirmationInline =
          activeUiState.kind === "confirmation" &&
          activeUiState.sourceMessageId === message.id &&
          !dismissedInlineSurfaces.has(message.id) &&
          !isLoading;
        const shouldShowConfirmationCard = isActiveConfirmationInline;
        const shouldShowDynamicForm =
          !isUser &&
          !isLoading &&
          parsedDynamicForm !== null &&
          message.id === lastAssistantMessageId &&
          !dismissedInlineSurfaces.has(message.id) &&
          !shouldShowConfirmationCard;
        const shouldShowChoiceChips =
          !isUser &&
          parsedChoices !== null &&
          !shouldShowConfirmationCard;
        const followUpIntents =
          isUser || shouldShowChoiceChips || shouldShowDynamicForm || shouldShowConfirmationCard
            ? []
            : extractChatFollowUpIntents(renderedContent);
        const shouldShowInlineFallback =
          !isUser &&
          !isLoading &&
          followUpIntents.length === 0 &&
          message.id === lastAssistantMessageId &&
          !shouldShowDynamicForm &&
          !shouldShowChoiceChips &&
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
                {shouldShowDynamicForm && parsedDynamicForm ? (
                  <DynamicChatFormCard
                    definition={parsedDynamicForm.definition}
                    disabled={isLoading}
                    onSubmit={(values) =>
                      onDynamicFormSubmit?.(
                        parsedDynamicForm.definition,
                        values
                      )
                    }
                    onDismiss={() => {
                      setDismissedInlineSurfaces((current) => {
                        const next = new Set(current);
                        next.add(message.id);
                        return next;
                      });
                    }}
                  />
                ) : null}
                {shouldShowChoiceChips && parsedChoices ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parsedChoices.choices.map((choice) => (
                      <button
                        key={`${message.id}-choice-${choice}`}
                        type="button"
                        disabled={isLoading}
                        onClick={() => onFollowUpIntentSelect?.(choice)}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
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

              {!isUser ? (
                <div className="ml-2 flex shrink-0 flex-col items-center gap-1 pt-6">
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">QA</p>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-700"
                    aria-label="Respuesta correcta"
                    title="Respuesta correcta"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100 hover:text-rose-600"
                    aria-label="Respuesta incorrecta"
                    title="Respuesta incorrecta"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} className="h-6" />
    </div>
  );
}
