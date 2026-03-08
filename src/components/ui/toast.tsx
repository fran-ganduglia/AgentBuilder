"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

type ToastProps = {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
};

const AUTO_DISMISS_MS = 5000;

const styles: Record<ToastType, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 200);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between rounded-lg border px-4 py-3 shadow-lg transition-all duration-200 ${styles[type]} ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <p className="text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onDismiss(id), 200);
        }}
        className="ml-4 shrink-0 text-current opacity-60 hover:opacity-100"
        aria-label="Cerrar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}
