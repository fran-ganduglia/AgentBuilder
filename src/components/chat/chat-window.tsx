"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatActiveRail } from "@/components/chat/chat-active-rail";
import { ChatQuickActionsShell } from "@/components/chat/chat-quick-actions-shell";
import type {
  ActiveChatUiState,
  PendingChatFormState,
} from "@/lib/chat/chat-form-state";
import {
  buildDynamicFormSubmissionMessage,
  type DynamicFormDefinition,
  type DynamicFormFieldUi,
  type FileAttachmentValue,
} from "@/lib/chat/interactive-markers";
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
    metadata: null,
  };
}

export function ChatWindow({
  agentId,
  isTestMode,
  initialConversationId,
  initialMessages,
  initialQuickActions,
}: ChatWindowProps) {
  const router = useRouter();
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const forceNewConversationRef = useRef(false);

  const handleNewChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    forceNewConversationRef.current = true;
    setMessages([]);
    setConversationId(null);
    setErrorMessage(null);
    setIsLoading(false);
    setActiveUiState({ kind: "none" });
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!initialQuickActions.hasConnectedIntegrations) {
      setIsMobileActionsOpen(false);
    }
  }, [initialQuickActions.hasConnectedIntegrations]);

  const emptyStateActions = getChatEmptyStateQuickActions(initialQuickActions);
  const activeSourceMessageId =
    activeUiState.kind === "confirmation"
      ? activeUiState.sourceMessageId
      : null;
  const shouldShowRail =
    activeUiState.kind === "confirmation" &&
    (!activeSourceMessageId ||
      !messages.some((message) => message.id === activeSourceMessageId));

  const refreshActiveUiState = useCallback(
    async (
      targetConversationId: string | null,
      options?: {
        delayMs?: number;
        retryCount?: number;
        retryDelayMs?: number;
      }
    ) => {
      if (!targetConversationId) {
        setActiveUiState({ kind: "none" });
        return;
      }

      const delayMs = options?.delayMs ?? 0;
      const retryCount = options?.retryCount ?? 0;
      const retryDelayMs = options?.retryDelayMs ?? 250;

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
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

          if (nextState.kind !== "none" || attempt === retryCount) {
            return;
          }
        } catch {
          // La UI de confirmation es accesoria; no interrumpir el chat si falla.
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    },
    [agentId]
  );

  useEffect(() => {
    void refreshActiveUiState(conversationId);
  }, [conversationId, refreshActiveUiState]);

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
        } else if (forceNewConversationRef.current) {
          body.forceNewConversation = true;
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
        forceNewConversationRef.current = false;
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
        void refreshActiveUiState(nextConversationId, {
          delayMs: 300,
          retryCount: 2,
          retryDelayMs: 500,
        });
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

  const handleDynamicFormSubmit = useCallback(
    async (
      definition: DynamicFormDefinition,
      _initialValues: Record<string, string>,
      _fieldUi: Record<string, DynamicFormFieldUi>,
      values: Record<string, string>,
      fileAttachments?: Record<string, FileAttachmentValue[]>,
      activeFormState?: PendingChatFormState
    ) => {
      if (
        activeFormState?.clarificationId &&
        conversationId
      ) {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const response = await fetch("/api/chat/forms/runtime/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId,
              conversationId,
              clarificationId: activeFormState.clarificationId,
              values,
            }),
          });

          const payload = (await response.json()) as {
            data?: {
              userMessage?: Message;
              assistantMessage?: Message;
              activeUiState?: ActiveChatUiState;
            };
            error?: string;
          };
          const submitData = payload.data;

          if (!response.ok || !submitData?.assistantMessage) {
            setErrorMessage(payload.error ?? "No se pudo enviar la aclaracion.");
            return;
          }

          const appendedMessages: Message[] = [];
          if (submitData.userMessage) {
            appendedMessages.push(submitData.userMessage);
          }
          appendedMessages.push(submitData.assistantMessage);

          setMessages((current) => [...current, ...appendedMessages]);
          setActiveUiState(submitData.activeUiState ?? { kind: "none" });
          return;
        } catch {
          setErrorMessage("No se pudo reanudar el runtime desde el formulario.");
          return;
        } finally {
          setIsLoading(false);
        }
      }

      let uploadedPaths: Record<string, string[]> | undefined;

      if (fileAttachments && Object.keys(fileAttachments).length > 0) {
        try {
          uploadedPaths = {};
          for (const [key, files] of Object.entries(fileAttachments)) {
            if (files.length === 0) continue;

            const formData = new FormData();
            for (const file of files) {
              const binary = Uint8Array.from(atob(file.base64), (c) =>
                c.charCodeAt(0)
              );
              formData.append(
                "files",
                new Blob([binary], { type: file.type }),
                file.name
              );
            }

            const response = await fetch("/api/upload/chat-attachments", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const json = (await response.json()) as { error?: string };
              setErrorMessage(json.error ?? "Error al subir archivos");
              return;
            }

            const json = (await response.json()) as {
              data: { name: string; type: string; size: number; storagePath: string }[];
            };
            uploadedPaths[key] = json.data.map((f) => f.storagePath);
          }
        } catch {
          setErrorMessage("Error al subir archivos adjuntos");
          return;
        }
      }

      const serialized = buildDynamicFormSubmissionMessage(
        definition,
        values,
        fileAttachments,
        uploadedPaths
      );

      if (serialized.trim().length > 0) {
        void handleSend(serialized);
      }
    },
    [handleSend]
  );

  const handleFormConfirm = useCallback(() => {
    void handleSend("confirmo");
  }, [handleSend]);

  const activeRail = shouldShowRail ? (
    <ChatActiveRail
      state={activeUiState}
      disabled={isLoading}
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

      <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50 px-4 py-1.5">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo chat
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-1 flex-col">
          <MessageList
            messages={messages}
            emptyStateActions={emptyStateActions}
            quickActions={initialQuickActions}
            onQuickActionSelect={handleQuickActionSelect}
            onFollowUpIntentSelect={handleQuickActionSelect}
            activeUiState={activeUiState}
            onFormConfirm={handleFormConfirm}
            onDynamicFormSubmit={handleDynamicFormSubmit}
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
