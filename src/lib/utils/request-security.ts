import { NextResponse } from "next/server";
import { z } from "zod";

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "host.docker.internal"
  );
}

function isAllowedLocalDevOrigin(origin: string, requestOrigin: string): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  let parsedOrigin: URL;
  let parsedRequestOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
    parsedRequestOrigin = new URL(requestOrigin);
  } catch {
    return false;
  }

  return (
    parsedOrigin.protocol === parsedRequestOrigin.protocol &&
    parsedOrigin.port === parsedRequestOrigin.port &&
    isLoopbackHostname(parsedOrigin.hostname) &&
    isLoopbackHostname(parsedRequestOrigin.hostname)
  );
}

export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || isAllowedLocalDevOrigin(origin, requestOrigin);
}

export function hasValidFetchSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

export function isValidSameOriginMutationRequest(request: Request): boolean {
  return hasValidOrigin(request) && hasValidFetchSite(request);
}

export function validateSameOriginMutationRequest(
  request: Request
): NextResponse | null {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  return null;
}

export function validateJsonMutationRequest(request: Request): NextResponse | null {
  const sameOriginError = validateSameOriginMutationRequest(request);

  if (sameOriginError) {
    return sameOriginError;
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type debe ser application/json" },
      { status: 400 }
    );
  }

  return null;
}

type ParsedJsonBody<T> =
  | { data: T; errorResponse: null }
  | { data: null; errorResponse: NextResponse };

export async function parseJsonRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ParsedJsonBody<T>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      data: null,
      errorResponse: NextResponse.json(
        { error: "JSON invalido en el body del request" },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      data: null,
      errorResponse: NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Input invalido" },
        { status: 400 }
      ),
    };
  }

  return { data: parsed.data, errorResponse: null };
}
