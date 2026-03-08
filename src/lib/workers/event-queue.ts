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

  // Optimistic lock: claim pending events by setting status to 'processing'
  // Use a two-step approach since Supabase JS doesn't support SELECT FOR UPDATE SKIP LOCKED
  const { data: pending, error: fetchError } = await supabase
    .from("event_queue")
    .select("id, organization_id, event_type, payload, idempotency_key, created_at")
    .in("event_type", eventTypes)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError || !pending || pending.length === 0) {
    return [];
  }

  const ids = pending.map((row) => (row as EventRow).id);

  const { data: claimed, error: claimError } = await supabase
    .from("event_queue")
    .update({ status: "processing", processed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, organization_id, event_type, payload, idempotency_key, created_at");

  if (claimError || !claimed) {
    return [];
  }

  return claimed as EventRow[];
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
