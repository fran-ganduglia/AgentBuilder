"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadChatPreviewSession, type ChatPreviewConfig } from "@/lib/chat/session-draft";
import type { ChatMode } from "@/lib/chat/conversation-metadata";
import type { Message, AgentStatus } from "@/types/app";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

type ChatExecutionMode = "saved" | "preview";

type ChatWindowProps = {
  agentId: string;
  agentStatus: AgentStatus;
  chatMode: ChatMode;
  initialMessages: Message[];
  initialExecutionMode: ChatExecutionMode;
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
  agentStatus,
  chatMode,
  initialMessages,
  initialExecutionMode,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    initialMessages[0]?.conversation_id ?? null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<ChatPreviewConfig | null>(null);
  const [executionMode, setExecutionMode] = useState<ChatExecutionMode>(initialExecutionMode);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chatMode !== "sandbox") {
      setPreviewConfig(null);
      setExecutionMode("saved");
      return;
    }

    const nextPreview = loadChatPreviewSession(agentId);
    setPreviewConfig(nextPreview?.config ?? null);

    if (initialExecutionMode === "preview" && nextPreview?.config) {
      setExecutionMode("preview");
      return;
    }

    setExecutionMode("saved");
  }, [agentId, chatMode, initialExecutionMode]);

  const canUsePreview = chatMode === "sandbox" && previewConfig !== null;
  const isPreviewActive = executionMode === "preview" && canUsePreview;

  const handleSend = useCallback(
    async (content: string) => {
      setIsLoading(true);
      setErrorMessage(null);

      const optimisticMessage = createLocalMessage(
        conversationId ?? "",
        "user",
        content
      );

      const assistantMessageId = crypto.randomUUID();

      setMessages((prev) => [...prev, optimisticMessage]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          agentId,
          content,
          chatMode,
          mode: isPreviewActive ? "preview" : "saved",
          ...(isPreviewActive && previewConfig ? { preview: previewConfig } : {}),
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
    [agentId, chatMode, conversationId, isPreviewActive, previewConfig]
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {chatMode === "sandbox" ? "Sandbox separado del uso real" : "Historial operativo local"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {chatMode === "sandbox"
                ? agentStatus === "draft"
                  ? "Este hilo sirve para afinar respuestas antes de activar el agente."
                  : "Este hilo de sandbox no afecta el chat operativo del agente activo."
                : "Este hilo cuenta como uso real local del agente."}
            </p>
          </div>

          {chatMode === "sandbox" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExecutionMode("saved")}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
                  !isPreviewActive
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200"
                }`}
              >
                Version guardada
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode("preview")}
                disabled={!canUsePreview}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
                  isPreviewActive
                    ? "bg-amber-500 text-slate-950"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Preview actual
              </button>
            </div>
          ) : null}
        </div>

        {chatMode === "sandbox" && !canUsePreview ? (
          <div className="mx-auto mt-3 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No encontramos un borrador de sesion para preview. Abre el editor del agente y entra desde &quot;Probar borrador actual&quot;.
          </div>
        ) : null}
      </div>

      <MessageList messages={messages} />
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
  );
}


