import { NextResponse } from "next/server";
import { validateCronRequest } from "@/lib/workers/auth";
import { claimEvents, markDone, markFailed } from "@/lib/workers/event-queue";
import { processDocument } from "@/lib/workers/rag-processor";

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const events = await claimEvents(["document.uploaded"], 5);

  if (events.length === 0) {
    return NextResponse.json({ data: { processed: 0 } });
  }

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const payload = event.payload as {
        document_id: string;
        agent_id: string;
        storage_path: string;
        file_type: string;
        file_name: string;
      };

      await processDocument({
        eventId: event.id,
        organizationId: event.organization_id,
        payload,
      });

      await markDone(event.id);
      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      console.error("worker.rag.process_error", {
        eventId: event.id,
        error: errorMessage,
      });
      await markFailed(event.id, errorMessage);
      failed++;
    }
  }

  return NextResponse.json({ data: { processed, failed } });
}

