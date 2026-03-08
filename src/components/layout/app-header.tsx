"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Role, Notification } from "@/types/app";

type AppHeaderProps = {
  userName: string;
  role: Role;
  initialUnreadCount: number;
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

export function AppHeader({ userName, role, initialUnreadCount }: AppHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      // Silently fail — badge remains with stale count
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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggle}
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Notificaciones"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
                clipRule="evenodd"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Marcar todas como leidas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {isLoadingList && notifications.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    Cargando...
                  </div>
                )}

                {!isLoadingList && notifications.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    Sin notificaciones
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
                    className={`flex w-full flex-col gap-1 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      !notification.is_read ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    {notification.created_at && (
                      <p className="text-[11px] text-gray-400">
                        {timeAgo(notification.created_at)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="text-sm text-gray-600">{userName}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {roleLabels[role]}
        </span>
      </div>
    </header>
  );
}
