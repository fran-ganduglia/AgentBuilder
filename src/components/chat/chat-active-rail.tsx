"use client";

import { InlineChatConfirmationCard, InlineChatFormCard } from "@/components/chat/inline-chat-form-card";
import type { ActiveChatUiState } from "@/lib/chat/chat-form-state";
import type { ChatFormValues } from "@/lib/chat/inline-forms";
import { getChatFormDefinition } from "@/lib/chat/inline-forms";

type ChatActiveRailProps = {
  state: ActiveChatUiState;
  disabled: boolean;
  draftValues?: ChatFormValues;
  fieldErrors?: Record<string, string>;
  submitError?: string | null;
  isSavingDraft?: boolean;
  onDraftChange?: (values: ChatFormValues) => void;
  onSubmit?: (values: ChatFormValues) => void | Promise<void>;
  onDismiss?: () => void;
  onConfirm?: () => void;
};

export function ChatActiveRail({
  state,
  disabled,
  draftValues,
  fieldErrors,
  submitError,
  isSavingDraft = false,
  onDraftChange,
  onSubmit,
  onDismiss,
  onConfirm,
}: ChatActiveRailProps) {
  if (state.kind === "form") {
    const definition = getChatFormDefinition(state.session.formId);
    if (!definition || !onSubmit) {
      return null;
    }

    return (
      <InlineChatFormCard
        definition={definition}
        initialValues={draftValues ?? state.session.draftValues}
        fieldErrors={fieldErrors}
        submitError={submitError}
        disabled={disabled}
        isSavingDraft={isSavingDraft}
        onChange={onDraftChange}
        onSubmit={onSubmit}
        onDismiss={onDismiss}
        surfaceLabel="Rail persistente"
      />
    );
  }

  if (state.kind === "confirmation") {
    return (
      <InlineChatConfirmationCard
        provider={state.provider}
        summary={state.summary}
        disabled={disabled}
        onConfirm={() => onConfirm?.()}
        surfaceLabel="Rail persistente"
      />
    );
  }

  return null;
}
