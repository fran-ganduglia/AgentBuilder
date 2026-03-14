import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/get-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { ToastProvider } from "@/components/ui/toast-provider";
import { countUnreadNotifications } from "@/lib/db/notifications";
import { countPendingApprovalItems } from "@/lib/db/approval-items";
import type { Organization } from "@/types/app";

type OrganizationSummary = Pick<Organization, "name">;

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  const { data: organizationData } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", session.organizationId)
    .single();

  const organization = organizationData as OrganizationSummary | null;
  const organizationName = organization?.name ?? "Organizacion";

  const [{ data: unreadCount }, { data: pendingApprovalCount }] = await Promise.all([
    countUnreadNotifications(session.organizationId),
    session.role === "viewer"
      ? Promise.resolve({ data: 0, error: null })
      : countPendingApprovalItems(session.organizationId),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        userName={session.user.fullName}
        organizationName={organizationName}
        role={session.role}
        initialPendingApprovalCount={pendingApprovalCount ?? 0}
      />
      <div className="flex flex-1 flex-col md:ml-64">
        <AppHeader
          userName={session.user.fullName}
          role={session.role}
          initialUnreadCount={unreadCount ?? 0}
          initialPendingApprovalCount={pendingApprovalCount ?? 0}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}

