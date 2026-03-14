import { NextResponse } from "next/server";
import { expireStaleApprovalItems } from "@/lib/db/approval-items";
import { areWorkersEnabled, getWorkersDisabledResponse, validateCronRequest } from "@/lib/workers/auth";

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const expiration = await expireStaleApprovalItems();
  if (expiration.error) {
    return NextResponse.json(
      { error: expiration.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      expired: expiration.data ?? 0,
    },
  });
}
