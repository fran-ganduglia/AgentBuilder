import { NextResponse } from "next/server";
import { validateCronRequest } from "@/lib/workers/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { processDeletionRequest } from "@/lib/workers/deletion-processor";

type DeletionRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
};

async function claimDeletionRequests(limit: number): Promise<DeletionRow[]> {
  const supabase = createServiceSupabaseClient();

  // Since deletion_requests may not be in generated types, use type assertion.
  const fromTable = supabase.from as (table: string) => ReturnType<typeof supabase.from>;

  const { data: pending, error: fetchError } = await fromTable("deletion_requests")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError || !pending || pending.length === 0) {
    return [];
  }

  const ids = (pending as Array<{ id: string }>).map((row) => row.id);
  const { data: claimed, error: claimError } = await fromTable("deletion_requests")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, organization_id, entity_type, entity_id, requested_by");

  if (claimError || !claimed) {
    return [];
  }

  return claimed as unknown as DeletionRow[];
}

export async function POST(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rows = await claimDeletionRequests(5);
  if (rows.length === 0) {
    return NextResponse.json({ data: { processed: 0 } });
  }

  console.info("worker.deletion.claimed", { count: rows.length });

  const supabase = createServiceSupabaseClient();
  const fromTable = supabase.from as (table: string) => ReturnType<typeof supabase.from>;

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
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", row.id);

      failed++;
    }
  }

  console.info("worker.deletion.finished", { processed, failed });

  return NextResponse.json({ data: { processed, failed } });
}
