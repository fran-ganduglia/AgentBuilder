import { NextResponse } from "next/server";
import { expireStaleApprovalItems } from "@/lib/db/approval-items";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const expiration = await expireStaleApprovalItems();
  if (expiration.error) {
    return withWorkerCompatibilityHeaders(NextResponse.json(
      { error: expiration.error },
      { status: 500 }
    ));
  }

  return withWorkerCompatibilityHeaders(NextResponse.json({
    data: {
      expired: expiration.data ?? 0,
    },
  }));
}
