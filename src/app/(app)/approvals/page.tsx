import { redirect } from "next/navigation";
import { ApprovalInbox } from "@/components/approvals/approval-inbox";
import { getSession } from "@/lib/auth/get-session";
import { listApprovalItems } from "@/lib/db/approval-items";

export default async function ApprovalsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "viewer") {
    redirect("/unauthorized");
  }

  const [pendingResult, recentResult] = await Promise.all([
    listApprovalItems(session.organizationId, { status: "pending", limit: 25 }),
    listApprovalItems(session.organizationId, { limit: 50 }),
  ]);

  const pendingItems = pendingResult.data ?? [];
  const recentItems = (recentResult.data ?? []).filter((item) => item.status !== "pending").slice(0, 20);

  return (
    <div className="mx-auto max-w-7xl pb-12">
      <ApprovalInbox pendingItems={pendingItems} recentItems={recentItems} />
    </div>
  );
}

