"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatActiveRail } from "@/components/chat/chat-active-rail";
import { ChatQuickActionsShell } from "@/components/chat/chat-quick-actions-shell";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";
import {
  getChatEmptyStateQuickActions,
  type ResolvedChatQuickActions,
} from "@/lib/chat/quick-actions";
import type { Message } from "@/types/app";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

type ChatWindowProps = {
  agentId: string;
  isTestMode: boolean;
  initialConversationId: string | null;
  initialMessages: Message[];
  initialQuickActions: ResolvedChatQuickActions;
};

function createLocalMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    organization_id: "",
    role,
    content,
    created_at: new Date().toISOString(),
    llm_model: null,
    response_time_ms: null,
    tokens_input: null,
    tokens_output: null,
  };
}

export function ChatWindow({
  agentId,
  isTestMode,
  initialConversationId,
  initialMessages,
  initialQuickActions,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    initialMessages[0]?.conversation_id ?? initialConversationId
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [activeUiState, setActiveUiState] = useState<ActiveChatUiState>({
    kind: "none",
  });
  const [activeFormValues, setActiveFormValues] = useState<Record<string, string>>(
    {}
  );
  const [activeFormFieldErrors, setActiveFormFieldErrors] = useState<
    Record<string, string>
  >({});
  const [activeFormError, setActiveFormError] = useState<string | null>(null);
  const [isSavingFormDraft, setIsSavingFormDraft] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialQuickActions.isCrmChat) {
      setIsMobileActionsOpen(false);
    }
  }, [initialQuickActions.isCrmChat]);

  const emptyStateActions = getChatEmptyStateQuickActions(initialQuickActions);
  const activeSourceMessageId =
    activeUiState.kind === "form"
      ? activeUiState.session.sourceMessageId
      : activeUiState.kind === "confirmation"
        ? activeUiState.sourceMessageId
        : null;
  const shouldShowRail =
    activeUiState.kind !== "none" &&
    (!activeSourceMessageId ||
      !messages.some((message) => message.id === activeSourceMessageId));

  const refreshActiveUiState = useCallback(
    async (targetConversationId: string | null, delayMs = 0) => {
      if (!targetConversationId) {
        setActiveUiState({ kind: "none" });
        return;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const params = new URLSearchParams({
          agentId,
          conversationId: targetConversationId,
        });
        const response = await fetch(`/api/chat/forms/active?${params.toString()}`);

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { data?: ActiveChatUiState };
        const nextState = payload.data ?? { kind: "none" };
        setActiveUiState(nextState);

        if (nextState.kind === "form") {
          setActiveFormValues(nextState.session.draftValues);
        } else {
          setActiveFormValues({});
          setActiveFormFieldErrors({});
          setActiveFormError(null);
        }
      } catch {
        // La UI del form es accesoria; no interrumpir el chat si falla.
      }
    },
    [agentId]
  );

  useEffect(() => {
    void refreshActiveUiState(conversationId);
  }, [conversationId, refreshActiveUiState]);

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent || isLoading) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);
      const optimisticMessage = createLocalMessage(
        conversationId ?? "",
        "user",
        trimmedContent
      );
      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [...prev, optimisticMessage]);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          agentId,
          content: trimmedContent,
        };
        if (conversationId) {
          body.conversationId = conversationId;
        }
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorText = "Ocurrio un fallo en el enlace con el motor de inferencia.";
          try {
            const json = (await response.json()) as { error?: string };
            if (json.error) {
              errorText = json.error;
            }
          } catch {
            // El response no vino como JSON.
          }
          setErrorMessage(errorText);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
          return;
        }

        const responseConvId = response.headers.get("X-Conversation-Id");
        if (responseConvId && !conversationId) {
          setConversationId(responseConvId);
        }
        const streamingAssistantMessage = createLocalMessage(
          responseConvId ?? conversationId ?? "",
          "assistant",
          ""
        );
        streamingAssistantMessage.id = assistantMessageId;
        setMessages((prev) => [...prev, streamingAssistantMessage]);

        if (!response.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: "Interrupcion de la traza de texto en el servidor." }
                : m
            )
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + chunk }
                  : m
              )
            );
          }
        }

        const nextConversationId = responseConvId ?? conversationId ?? null;
        void refreshActiveUiState(nextConversationId, 150);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setErrorMessage("Conexion abortada o fallida hacia el endpoint nativo de resolucion.");
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== optimisticMessage.id && m.id !== assistantMessageId
          )
        );
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    },
    [agentId, conversationId, isLoading, refreshActiveUiState]
  );

  const handleQuickActionSelect = useCallback(
    (prompt: string) => {
      setIsMobileActionsOpen(false);
      void handleSend(prompt);
    },
    [handleSend]
  );

  const handleFormDraftChange = useCallback(
    (values: Record<string, string>) => {
      setActiveFormValues(values);
      setActiveFormFieldErrors({});
      setActiveFormError(null);

      if (
        !conversationId ||
        activeUiState.kind !== "form" ||
        draftSaveTimerRef.current
      ) {
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = null;
        }
      }

      if (!conversationId || activeUiState.kind !== "form") {
        return;
      }

      draftSaveTimerRef.current = setTimeout(async () => {
        setIsSavingFormDraft(true);
        try {
          const response = await fetch("/api/chat/forms/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId,
              conversationId,
              formId: activeUiState.session.formId,
              draftValues: values,
              relationSelections: {},
            }),
          });

          if (response.ok) {
            const payload = (await response.json()) as { data?: ActiveChatUiState };
            if (payload.data) {
              setActiveUiState(payload.data);
            }
          }
        } finally {
          draftSaveTimerRef.current = null;
          setIsSavingFormDraft(false);
        }
      }, 350);
    },
    [activeUiState, agentId, conversationId]
  );

  const handleFormDismiss = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    const response = await fetch("/api/chat/forms/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, conversationId }),
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { data?: ActiveChatUiState };
    setActiveUiState(payload.data ?? { kind: "none" });
  }, [agentId, conversationId]);

  const handleFormSubmit = useCallback(
    async (values: Record<string, string>) => {
      if (!conversationId || activeUiState.kind !== "form") {
        return;
      }

      setIsLoading(true);
      setActiveFormFieldErrors({});
      setActiveFormError(null);

      try {
        const response = await fetch("/api/chat/forms/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            conversationId,
            formId: activeUiState.session.formId,
            submissionKey: crypto.randomUUID(),
            draftValues: values,
            relationSelections: {},
          }),
        });

        const payload = (await response.json()) as {
          data?: ActiveChatUiState;
          error?: string;
          fieldErrors?: Record<string, string>;
        };

        if (!response.ok) {
          setActiveFormFieldErrors(payload.fieldErrors ?? {});
          setActiveFormError(payload.error ?? "No se pudo validar el formulario.");
          return;
        }

        setActiveUiState(payload.data ?? { kind: "none" });
        setActiveFormValues({});
        void refreshActiveUiState(conversationId);
      } catch {
        setActiveFormError("No se pudo enviar el formulario al servidor.");
      } finally {
        setIsLoading(false);
      }
    },
    [activeUiState, agentId, conversationId, refreshActiveUiState]
  );

  const handleFormConfirm = useCallback(() => {
    void handleSend("confirmo");
  }, [handleSend]);

  const activeRail = shouldShowRail ? (
    <ChatActiveRail
      state={activeUiState}
      disabled={isLoading}
      draftValues={activeFormValues}
      fieldErrors={activeFormFieldErrors}
      submitError={activeFormError}
      isSavingDraft={isSavingFormDraft}
      onDraftChange={handleFormDraftChange}
      onSubmit={handleFormSubmit}
      onDismiss={handleFormDismiss}
      onConfirm={handleFormConfirm}
    />
  ) : null;

  return (
    <div className="flex h-full flex-col bg-white">
      {isTestMode ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-sm text-amber-950">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">Modo prueba</p>
            <p className="mt-1">Los mensajes no afectan usuarios reales. Cada cambio guardado en el agente se refleja en el siguiente mensaje.</p>
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-1 flex-col">
          <MessageList
            messages={messages}
            emptyStateActions={emptyStateActions}
            quickActions={initialQuickActions}
            onQuickActionSelect={handleQuickActionSelect}
            onFollowUpIntentSelect={handleQuickActionSelect}
            activeUiState={activeUiState}
            activeFormValues={activeFormValues}
            activeFormFieldErrors={activeFormFieldErrors}
            activeFormError={activeFormError}
            isSavingFormDraft={isSavingFormDraft}
            onFormDraftChange={handleFormDraftChange}
            onFormDismiss={handleFormDismiss}
            onFormSubmit={handleFormSubmit}
            onFormConfirm={handleFormConfirm}
            isLoading={isLoading}
          />
          {errorMessage ? (
            <div className="mx-auto mt-4 w-full max-w-3xl px-4">
              <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
                <svg className="h-5 w-5 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm font-medium text-rose-800">{errorMessage}</p>
              </div>
            </div>
          ) : null}
          <div className="shrink-0 pb-0 pt-2">
            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </div>

        <ChatQuickActionsShell
          quickActions={initialQuickActions}
          isLoading={isLoading}
          isMobileOpen={isMobileActionsOpen}
          onActionSelect={handleQuickActionSelect}
          onOpenMobile={() => setIsMobileActionsOpen(true)}
          onCloseMobile={() => setIsMobileActionsOpen(false)}
          activeRail={activeRail}
        />
      </div>
    </div>
  );
}
