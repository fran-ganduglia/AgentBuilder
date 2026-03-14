import "server-only";

import { createHash } from "node:crypto";

export function normalizePersistedAssistantContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export function createChatFormSourceContentHash(content: string): string {
  return createHash("sha256")
    .update(normalizePersistedAssistantContent(content))
    .digest("hex");
}
