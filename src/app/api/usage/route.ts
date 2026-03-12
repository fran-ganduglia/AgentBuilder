import { NextResponse } from "next/server";
import { canViewOrganizationUsage } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { getOrganizationUsage } from "@/lib/db/usage";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!canViewOrganizationUsage(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data, error } = await getOrganizationUsage(session.organizationId);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ data });
}
