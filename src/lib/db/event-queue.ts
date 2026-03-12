import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json, TablesInsert } from "@/types/database";

type EventQueueInsert = TablesInsert<"event_queue">;

export type EventPayload = Record<string, Json>;

export type EnqueueEventInput = {
  organizationId: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  payload: EventPayload;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
  processAfter?: string | null;
  maxAttempts?: number | null;
};

function buildInsertPayload(input: EnqueueEventInput): EventQueueInsert {
  return {
    organization_id: input.organizationId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload,
    idempotency_key: input.idempotencyKey ?? null,
    correlation_id: input.correlationId ?? null,
    trace_id: input.traceId ?? null,
    process_after: input.processAfter ?? null,
    max_attempts: input.maxAttempts ?? null,
  };
}

export async function enqueueEvent(input: EnqueueEventInput): Promise<void> {
  try {
    const serviceClient = createServiceSupabaseClient();
    const { error } = await serviceClient
      .from("event_queue")
      .insert(buildInsertPayload(input));

    if (!error) {
      return;
    }

    if (error.code === "23505" && input.idempotencyKey) {
      console.info("event_queue.duplicate_event", {
        eventType: input.eventType,
        entityId: input.entityId,
        idempotencyKey: input.idempotencyKey,
      });
      return;
    }

    console.error("event_queue.enqueue_error", {
      eventType: input.eventType,
      entityId: input.entityId,
      error: error.message,
    });
  } catch (error) {
    console.error("event_queue.unexpected_enqueue_error", {
      eventType: input.eventType,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}