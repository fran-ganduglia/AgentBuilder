import { NextResponse } from "next/server";
import { isAgentDeletionDeadlineReached } from "@/lib/agents/agent-deletion";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { processDeletionRequest } from "@/lib/workers/deletion-processor";

type DeletionRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  created_at: string | null;
};

const CLAIM_BATCH_LIMIT = 5;
const FETCH_CANDIDATES_LIMIT = 50;

function canProcessDeletionRequest(row: DeletionRow): boolean {
  if (row.entity_type !== "agent") {
    return true;
  }

  return isAgentDeletionDeadlineReached(row.created_at);
}

async function claimDeletionRequests(limit: number): Promise<DeletionRow[]> {
  const supabase = createServiceSupabaseClient();
  const fromTable = ((table: string) => supabase.from(table as never)) as (
    table: string
  ) => ReturnType<typeof supabase.from>;

  const { data: pending, error: fetchError } = await fromTable("deletion_requests")
    .select("id, organization_id, entity_type, entity_id, requested_by, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.max(limit * 10, FETCH_CANDIDATES_LIMIT));

  if (fetchError || !pending || pending.length === 0) {
    return [];
  }

  const eligibleRows = (pending as DeletionRow[])
    .filter(canProcessDeletionRequest)
    .slice(0, limit);

  if (eligibleRows.length === 0) {
    return [];
  }

  const ids = eligibleRows.map((row) => row.id);
  const { data: claimed, error: claimError } = await fromTable("deletion_requests")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, organization_id, entity_type, entity_id, requested_by, created_at");

  if (claimError || !claimed) {
    return [];
  }

  return claimed as unknown as DeletionRow[];
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const rows = await claimDeletionRequests(CLAIM_BATCH_LIMIT);
  if (rows.length === 0) {
    return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed: 0 } }));
  }

  console.info("worker.deletion.claimed", { count: rows.length });

  const supabase = createServiceSupabaseClient();
  const fromTable = ((table: string) => supabase.from(table as never)) as (
    table: string
  ) => ReturnType<typeof supabase.from>;

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await processDeletionRequest(row);
      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      console.error("worker.deletion.process_error", {
        requestId: row.id,
        entityType: row.entity_type,
        error: errorMessage,
      });

      await fromTable("deletion_requests")
        .update({ status: "failed", error_message: errorMessage, processed_at: new Date().toISOString() })
        .eq("id", row.id);

      failed++;
    }
  }

  console.info("worker.deletion.finished", { processed, failed });

  return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed, failed } }));
}
