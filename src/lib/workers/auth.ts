import "server-only";

import { NextResponse } from "next/server";
import { env } from "@/lib/utils/env";

export function validateCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return false;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return token === env.CRON_SECRET;
}

export function areWorkersEnabled(): boolean {
  return env.WORKERS_ENABLED;
}

export function getWorkersDisabledResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "x-agentbuilder-workers-disabled": "true",
    },
  });
}
