"use client";

import { InlineChatConfirmationCard } from "@/components/chat/inline-chat-form-card";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";

type ChatActiveRailProps = {
  state: ActiveChatUiState;
  disabled: boolean;
  onDismiss?: () => void;
  onConfirm?: () => void;
};

export function ChatActiveRail({
  state,
  disabled,
  onDismiss,
  onConfirm,
}: ChatActiveRailProps) {
  if (state.kind === "confirmation") {
    return (
      <InlineChatConfirmationCard
        provider={state.provider}
        summary={state.summary}
        disabled={disabled}
        onConfirm={() => onConfirm?.()}
        onDismiss={onDismiss}
        surfaceLabel="Rail persistente"
      />
    );
  }

  return null;
}
