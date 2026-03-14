"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Role, Notification } from "@/types/app";

type AppHeaderProps = {
  userName: string;
  role: Role;
  initialUnreadCount: number;
  initialPendingApprovalCount: number;
};

type NotificationsResponse = {
  data?: Notification[];
  error?: string;
};

type MarkReadResponse = {
  data?: Notification | { marked: number };
  error?: string;
};

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  operador: "Operador",
};

const roleStyles: Record<Role, string> = {
  admin: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  editor: "bg-blue-100 text-blue-700 ring-blue-600/20",
  viewer: "bg-slate-100 text-slate-700 ring-slate-600/20",
  operador: "bg-amber-100 text-amber-700 ring-amber-600/20",
};

function timeAgo(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return "hace un momento";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays}d`;
}

export function AppHeader({
  userName,
  role,
  initialUnreadCount,
  initialPendingApprovalCount,
}: AppHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const canAccessApprovals = role !== "viewer";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const response = await fetch("/api/notifications");
      const json: NotificationsResponse = await response.json();
      if (response.ok && json.data) {
        setNotifications(json.data);
        setUnreadCount(json.data.filter((n) => !n.is_read).length);
      }
    } catch {
      // Silently fail â€” badge remains with stale count
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read", notificationId }),
        });

        const json: MarkReadResponse = await response.json();

        if (response.ok && !json.error) {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notificationId ? { ...n, is_read: true } : n
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch {
        // Silently fail
      }
    },
    []
  );

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });

      const json: MarkReadResponse = await response.json();

      if (response.ok && !json.error) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
      <div />
      <div className="flex items-center gap-4">
        {canAccessApprovals ? (
          <Link
            href="/approvals"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <span>Aprobaciones</span>
            <span
              className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                initialPendingApprovalCount > 0
                  ? "bg-rose-500 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {initialPendingApprovalCount > 99 ? "99+" : initialPendingApprovalCount}
            </span>
          </Link>
        ) : null}

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggle}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            aria-label="Notificaciones"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-[18px] w-[18px]"
            >
              <path
                fillRule="evenodd"
                d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
                clipRule="evenodd"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-3 w-80 origin-top-right rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 ring-1 ring-black/5 focus:outline-none">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Notificaciones</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700"
                  >
                    Marcar todo como leÃ­do
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto overscroll-contain">
                {isLoadingList && notifications.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">
                    Cargando notificaciones...
                  </div>
                )}

                {!isLoadingList && notifications.length === 0 && (
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <div className="mb-3 rounded-full bg-slate-50 p-3">
                      <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-900">EstÃ¡s al dÃ­a</p>
                    <p className="mt-1 text-xs text-slate-500">No tienes notificaciones pendientes.</p>
                  </div>
                )}

                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => {
                      if (!notification.is_read) {
                        handleMarkAsRead(notification.id);
                      }
                    }}
                    className={`group flex w-full flex-col gap-1 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${
                      !notification.is_read ? "bg-emerald-50/30" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!notification.is_read ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    {notification.created_at && (
                      <p className="mt-1 text-[10px] font-medium tracking-wide text-slate-400">
                        {timeAgo(notification.created_at)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-200"></div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{userName}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${roleStyles[role]}`}>
            {roleLabels[role]}
          </span>
        </div>
      </div>
    </header>
  );
}

