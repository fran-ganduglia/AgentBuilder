"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/app";

type MessageListProps = {
  messages: Message[];
};

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-inset ring-slate-900/5 mb-6 shadow-sm">
             <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">Empezar Conversación</h3>
          <p className="mt-2 text-sm text-slate-500">
            Envía tu primer mensaje para inicializar el hilo de trazabilidad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {messages.map((message) => {
        const isUser = message.role === "user";

        return (
          <div
            key={message.id}
            className={`w-full py-8 ${isUser ? "bg-white" : "bg-slate-50/80 border-y border-slate-100"}`}
          >
             <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 flex gap-6">
               <div className="shrink-0">
                 {isUser ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs shadow-sm">
                      U
                    </div>
                 ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 shadow-sm">
                       <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                       </svg>
                    </div>
                 )}
               </div>
               
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-900 mb-1">
                    {isUser ? "Usuario" : "Agente"}
                  </p>
                  <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
               </div>
             </div>
          </div>
        );
      })}
      <div ref={bottomRef} className="h-6" />
    </div>
  );
}
