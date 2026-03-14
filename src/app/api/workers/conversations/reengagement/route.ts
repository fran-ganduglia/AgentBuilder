import { NextResponse } from "next/server";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const STALE_AFTER_HOURS = 48;
const BATCH_LIMIT = 20;

async function listStaleConversations(): Promise<Array<{ id: string; organization_id: string }>> {
  const supabase = createServiceSupabaseClient();
  const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, organization_id")
    .eq("status", "active")
    .lt("started_at", staleThreshold)
    .is("ended_at", null)
    .limit(BATCH_LIMIT);

  if (error || !data) {
    return [];
  }

  return data;
}

async function closeConversation(id: string, organizationId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("conversations")
    .update({ status: "closed", ended_at: now })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("ended_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const stale = await listStaleConversations();

  if (stale.length === 0) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  let processed = 0;
  let failed = 0;

  for (const conversation of stale) {
    try {
      await closeConversation(conversation.id, conversation.organization_id);
      console.info("worker.conversations.reengagement.closed", {
        conversationId: conversation.id,
        organizationId: conversation.organization_id,
      });
      processed++;
    } catch (err) {
      console.error("worker.conversations.reengagement.close_error", {
        conversationId: conversation.id,
        organizationId: conversation.organization_id,
        error: err instanceof Error ? err.message : "unknown",
      });
      failed++;
    }
  }

  return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed, failed } }));
}
