import { NextResponse } from "next/server";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { runIntegrationsHealthCheck } from "@/lib/workers/integration-health";

async function handleRequest(request: Request): Promise<NextResponse> {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const summary = await runIntegrationsHealthCheck();
  return withWorkerCompatibilityHeaders(NextResponse.json({ data: summary }));
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleRequest(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRequest(request);
}
