"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import type { Role } from "@/types/app";

type AppSidebarProps = {
  userName: string;
  organizationName: string;
  role: Role;
};

type NavLink = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

const navLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agentes" },
  { href: "/settings", label: "Configuración", adminOnly: true },
  { href: "/settings/integrations", label: "Integraciones", adminOnly: true },
  { href: "/settings/users", label: "Usuarios", adminOnly: true },
];

export function AppSidebar({ userName, organizationName, role }: AppSidebarProps) {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError("No se pudo cerrar la sesión. Intenta de nuevo.");
        return;
      }

      window.location.assign("/login");
    } catch {
      setError("No se pudo cerrar la sesión. Intenta de nuevo.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[10px] font-bold text-white shadow-inner shadow-white/20">
          AB
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-bold tracking-wide text-white">AgentBuilder</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {organizationName}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {navLinks
          .filter((link) => !link.adminOnly || role === "admin")
          .map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group flex items-center rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                  isActive
                    ? "bg-emerald-500/10 font-semibold text-emerald-400 shadow-sm"
                    : "font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 h-5 w-1 rounded-r-full bg-emerald-500" />
                )}
                {link.label}
              </Link>
            );
          })}
      </nav>

      <div className="mt-auto flex flex-col items-start border-t border-slate-800/60 p-4">
        <p className="truncate px-2 text-xs font-medium text-slate-400">{userName}</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
        </button>
        {error ? <p className="mt-2 px-2 text-xs text-rose-500">{error}</p> : null}
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-900 bg-slate-950 md:flex">
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/80 backdrop-blur-sm transition-opacity md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-900 bg-slate-950 shadow-2xl transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1) md:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed left-4 top-3.5 z-30 rounded-lg bg-white/50 p-1.5 text-slate-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white/80 md:hidden"
        aria-label="Menú"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {isMobileOpen ? (
            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          ) : (
            <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
          )}
        </svg>
      </button>
    </>
  );
}
