import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type EventRow = {
  id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
};

export async function claimEvents(
  eventTypes: string[],
  limit: number
): Promise<EventRow[]> {
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

  await supabase
    .from("event_queue")
    .update({
      status: "failed",
      error_message: error,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}