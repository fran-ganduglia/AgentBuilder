import "server-only";

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
