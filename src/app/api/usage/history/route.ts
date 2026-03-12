import { NextResponse } from "next/server";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getUsageHistory } from "@/lib/db/usage";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!canViewOrganizationUsage(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const monthsParam = url.searchParams.get("months");
  const months = monthsParam ? Math.min(Math.max(parseInt(monthsParam, 10) || 6, 1), 12) : 6;

  const { data, error } = await getUsageHistory(session.organizationId, months);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ data });
}
