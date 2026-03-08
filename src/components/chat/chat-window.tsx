"use client";

import { useState, useCallback, useRef } from "react";
import type { Message } from "@/types/app";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

type ChatWindowProps = {
  agentId: string;
  initialMessages: Message[];
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

export function ChatWindow({ agentId, initialMessages }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    initialMessages[0]?.conversation_id ?? null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        const body: Record<string, string> = { agentId, content };
        if (conversationId) {
          body.conversationId = conversationId;
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        // Non-streaming error response (JSON)
        if (!response.ok) {
          let errorText = "Ocurrio un error al enviar el mensaje.";
          try {
            const json = (await response.json()) as { error?: string };
            if (json.error) {
              errorText = json.error;
            }
          } catch {
            // Response wasn't JSON
          }
          setErrorMessage(errorText);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
          return;
        }

        // Update conversation ID from response header
        const responseConvId = response.headers.get("X-Conversation-Id");
        if (responseConvId && !conversationId) {
          setConversationId(responseConvId);
        }

        // Add empty assistant message that will be filled by the stream
        const streamingAssistantMessage = createLocalMessage(
          responseConvId ?? conversationId ?? "",
          "assistant",
          ""
        );
        streamingAssistantMessage.id = assistantMessageId;

        setMessages((prev) => [...prev, streamingAssistantMessage]);

        // Read the stream
        if (!response.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: "No se recibio respuesta del servidor." }
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
        setErrorMessage("No se pudo conectar con el servidor. Intenta de nuevo.");
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
    [agentId, conversationId]
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} />
      {errorMessage && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}
