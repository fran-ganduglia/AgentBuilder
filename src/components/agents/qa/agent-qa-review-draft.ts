import type {
  ConversationQaReview,
  MessageQaReview,
  QaReviewStatus,
} from "@/lib/chat/conversation-metadata";

export type ConversationReviewDraft = {
  conversationStatus: QaReviewStatus | null;
  conversationNote: string;
  messageReviews: MessageQaReview[];
};

export function createReviewDraft(
  review: ConversationQaReview | null | undefined
): ConversationReviewDraft {
  return {
    conversationStatus: review?.conversationStatus ?? null,
    conversationNote: review?.conversationNote ?? "",
    messageReviews: [...(review?.messageReviews ?? [])],
  };
}

export function upsertMessageReview(
  reviews: MessageQaReview[],
  messageId: string,
  status: QaReviewStatus,
  note: string
): MessageQaReview[] {
  const nextReviews = reviews.filter((review) => review.messageId !== messageId);
  nextReviews.push({ messageId, status, note: note.trim() || undefined });
  return nextReviews;
}

export function updateMessageReviewNote(
  reviews: MessageQaReview[],
  messageId: string,
  note: string
): MessageQaReview[] {
  return reviews.map((review) =>
    review.messageId === messageId
      ? { ...review, note: note.trim() || undefined }
      : review
  );
}