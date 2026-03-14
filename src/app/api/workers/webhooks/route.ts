import { NextResponse } from "next/server";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { claimEvents, markDone, markFailed } from "@/lib/workers/event-queue";
import { deliverWebhooks } from "@/lib/workers/webhook-deliverer";

const WEBHOOK_EVENT_TYPES = [
  "agent.created",
  "agent.updated",
  "agent.deleted",
  "conversation.created",
  "message.created",
  "document.ready",
  "plan.limit_warning",
  "plan.limit_reached",
];

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const events = await claimEvents(WEBHOOK_EVENT_TYPES, 5);

  if (events.length === 0) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await deliverWebhooks({
        eventId: event.id,
        organizationId: event.organization_id,
        eventType: event.event_type,
        payload: event.payload,
      });

      await markDone(event.id);
      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      console.error("worker.webhooks.deliver_error", {
        eventId: event.id,
        error: errorMessage,
      });
      await markFailed(event.id, errorMessage);
      failed++;
    }
  }

  return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed, failed } }));
}

