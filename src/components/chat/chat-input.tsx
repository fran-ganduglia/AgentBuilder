"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type ChatInputProps = {
  onSend: (content: string) => void;
  isLoading: boolean;
};

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    onSend(trimmed);
    setContent("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <div className="bg-white/80 backdrop-blur-sm p-4 pb-6">
      <div className="mx-auto max-w-3xl relative">
        <div className="relative flex items-end overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-slate-900 shadow-sm transition-all">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Enviar consulta o promp..."
            disabled={isLoading}
            rows={1}
            className="flex-1 max-h-[200px] resize-none border-0 bg-transparent py-4 pl-5 pr-14 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0 disabled:opacity-50"
          />
          <div className="absolute right-3 bottom-3 flex items-center">
            <button
              onClick={handleSubmit}
              disabled={isLoading || !content.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white transition-all hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900"
            >
              {isLoading ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        <div className="mt-3 flex justify-center">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            El entorno analítico de chat no admite componentes multimedia.
          </p>
        </div>
      </div>
    </div>
  );
}