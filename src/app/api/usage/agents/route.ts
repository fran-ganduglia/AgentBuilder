import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { getAllAgentsUsage } from "@/lib/db/usage";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await getAllAgentsUsage(session.organizationId);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ data });
}
