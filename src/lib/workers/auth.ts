import "server-only";

import { NextResponse } from "next/server";
import { env } from "@/lib/utils/env";

const WORKER_COMPATIBILITY_HEADERS = {
  "x-agentbuilder-worker-mode": "compatibility",
  "x-agentbuilder-worker-scheduler": "railway-primary",
} as const;

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

export function withWorkerCompatibilityHeaders<T extends Response>(response: T): T {
  for (const [header, value] of Object.entries(WORKER_COMPATIBILITY_HEADERS)) {
    response.headers.set(header, value);
  }

  return response;
}

export function getWorkerUnauthorizedResponse(): NextResponse {
  return withWorkerCompatibilityHeaders(
    NextResponse.json({ error: "No autorizado" }, { status: 401 })
  );
}

export function getWorkersDisabledResponse(): NextResponse {
  return withWorkerCompatibilityHeaders(
    new NextResponse(null, {
      status: 204,
      headers: {
        "x-agentbuilder-workers-disabled": "true",
      },
    })
  );
}
