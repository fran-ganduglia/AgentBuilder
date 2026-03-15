import type { ChatQuickActionProvider } from "@/lib/chat/quick-actions";
import { buildInteractiveMarkersGuidance } from "@/lib/chat/interactive-markers";

export const CHAT_CONFIRMATION_PROVIDERS = [
  "salesforce",
] as const satisfies readonly ChatQuickActionProvider[];

export type ChatConfirmationProvider =
  (typeof CHAT_CONFIRMATION_PROVIDERS)[number];

export type ParsedChatConfirmationMarker = {
  provider: ChatConfirmationProvider;
  content: string;
  marker: string;
};

type MinimalChatMessage = {
  id: string;
  role: string;
};

const CHAT_CONFIRMATION_PROVIDER_SET = new Set<ChatConfirmationProvider>(
  CHAT_CONFIRMATION_PROVIDERS
);
const CHAT_CONFIRMATION_MARKER_PATTERN =
  /(?:\r?\n)?\[CONFIRM:([a-z0-9_]+)\]\s*$/i;

function stripTerminalMarker(content: string, marker: string): string {
  return content.slice(0, content.length - marker.length).trimEnd();
}

export function formatChatConfirmationMarker(
  provider: ChatConfirmationProvider
): string {
  return `[CONFIRM:${provider}]`;
}

export function parseChatConfirmationMarker(
  content: string
): ParsedChatConfirmationMarker | null {
  const match = content.match(CHAT_CONFIRMATION_MARKER_PATTERN);
  const marker = match?.[0];
  const rawProvider = match?.[1]?.toLowerCase();

  if (
    !marker ||
    !rawProvider ||
    !CHAT_CONFIRMATION_PROVIDER_SET.has(rawProvider as ChatConfirmationProvider)
  ) {
    return null;
  }

  return {
    provider: rawProvider as ChatConfirmationProvider,
    content: stripTerminalMarker(content, marker),
    marker: marker.trim(),
  };
}

/** @deprecated Legacy form marker — always returns null. Kept for backward compatibility with old messages. */
export function parseChatFormMarker(
  _content: string
): null {
  return null;
}

export function buildChatFormGuidance(input: {
  provider: ChatConfirmationProvider;
  allowedActions: readonly string[];
}): string | null {
  return buildInteractiveMarkersGuidance([input.provider]);
}

export function isInlineChatSurfaceActive(input: {
  messages: readonly MinimalChatMessage[];
  messageId: string;
  isStreaming: boolean;
}): boolean {
  if (input.isStreaming) {
    return false;
  }

  const lastMessage = input.messages[input.messages.length - 1];
  return (
    lastMessage?.id === input.messageId && lastMessage.role === "assistant"
  );
}
