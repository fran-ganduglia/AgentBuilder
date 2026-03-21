import { NextResponse } from "next/server";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { claimEvents, markDone, markFailed } from "@/lib/workers/event-queue";
import {
  processAgentUpdated,
  processConversationCreated,
  processMessageCreated,
  processRuntimeQueueDispatch,
  processWorkflowStepExecute,
  processWhatsAppInboundMessageReceived,
} from "@/lib/workers/event-processor";

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const events = await claimEvents(
    [
      "message.created",
      "conversation.created",
      "whatsapp.inbound_message_received",
      "agent.updated",
      "workflow.step.execute",
      "runtime.queue.dispatch",
    ],
    10
  );

  if (events.length === 0) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      if (event.event_type === "message.created") {
        await processMessageCreated(event);
      } else if (event.event_type === "conversation.created") {
        await processConversationCreated(event);
      } else if (event.event_type === "whatsapp.inbound_message_received") {
        await processWhatsAppInboundMessageReceived(event);
      } else if (event.event_type === "agent.updated") {
        await processAgentUpdated(event);
      } else if (event.event_type === "workflow.step.execute") {
        await processWorkflowStepExecute(event);
      } else if (event.event_type === "runtime.queue.dispatch") {
        await processRuntimeQueueDispatch(event);
      }

      await markDone(event.id);
      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      console.error("worker.events.process_error", {
        eventId: event.id,
        eventType: event.event_type,
        error: errorMessage,
      });
      await markFailed(event.id, errorMessage);
      failed++;
    }
  }

  return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed, failed } }));
}
