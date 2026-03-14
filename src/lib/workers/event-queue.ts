import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type EventRow = {
  id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
};

const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

function computeRetryDelayMs(attempts: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * Math.max(1, 2 ** Math.max(0, attempts - 1)), MAX_RETRY_DELAY_MS);
}

export async function claimEvents(eventTypes: string[], limit: number): Promise<EventRow[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("claim_event_queue_events", {
    p_event_types: eventTypes,
    p_limit: limit,
  });

  if (error || !data || data.length === 0) {
    return [];
  }

  return data as EventRow[];
}

export async function markDone(eventId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();

  await supabase
    .from("event_queue")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .eq("id", eventId);
}

export async function markFailed(eventId: string, error: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from("event_queue")
    .select("attempts, max_attempts")
    .eq("id", eventId)
    .maybeSingle();

  const attempts = typeof data?.attempts === "number" ? data.attempts : 0;
  const maxAttempts = typeof data?.max_attempts === "number" ? data.max_attempts : 3;
  const shouldRetry = attempts < maxAttempts;

  await supabase
    .from("event_queue")
    .update({
      status: shouldRetry ? "pending" : "failed",
      error_message: error,
      process_after: shouldRetry
        ? new Date(Date.now() + computeRetryDelayMs(attempts)).toISOString()
        : null,
      processed_at: shouldRetry ? null : new Date().toISOString(),
    })
    .eq("id", eventId);
}
