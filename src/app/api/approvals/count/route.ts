import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { countPendingApprovalItems } from "@/lib/db/approval-items";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role === "viewer") {
    return NextResponse.json({ data: { pending: 0 } });
  }

  const { data, error } = await countPendingApprovalItems(session.organizationId);

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar el contador de aprobaciones" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { pending: data ?? 0 } });
}

