"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  { href: "/settings", label: "Configuracion", adminOnly: true },
  { href: "/settings/users", label: "Usuarios", adminOnly: true },
];

export function AppSidebar({ userName, organizationName, role }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError("No se pudo cerrar la sesion. Intenta de nuevo.");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesion. Intenta de nuevo.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  const sidebarContent = (
    <>
      <div className="border-b border-gray-200 px-4 py-5">
        <p className="text-lg font-bold text-gray-900">AgentBuilder</p>
        <p className="mt-1 truncate text-xs text-gray-500">{organizationName}</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navLinks
          .filter((link) => !link.adminOnly || role === "admin")
          .map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-4">
        <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? "Cerrando sesion..." : "Cerrar sesion"}
        </button>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Hamburger button — rendered via portal-like approach in header */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed left-4 top-3.5 z-30 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
        aria-label="Menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
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
