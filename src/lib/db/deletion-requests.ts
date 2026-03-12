import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type DbResult<T> = { data: T | null; error: string | null };

type DeletionEntityType = "user" | "conversation" | "agent" | "organization";

type DeletionRequestRow = {
  id: string;
  organization_id: string;
  requested_by: string | null;
  entity_type: string;
  entity_id: string;
  status: string | null;
  reason: string | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string | null;
};

type CreateDeletionRequestInput = {
  organizationId: string;
  requestedBy: string;
  entityType: DeletionEntityType;
  entityId: string;
  reason?: string;
};

type CompletePendingDeletionRequestsInput = {
  organizationId: string;
  entityType: DeletionEntityType;
  entityIds: string[];
};

const DELETION_REQUESTS_TABLE_MISSING_ERROR =
  "Could not find the table 'public.deletion_requests' in the schema cache";

export function isDeletionRequestsUnavailableError(
  error: string | null | undefined
): boolean {
  return error?.includes(DELETION_REQUESTS_TABLE_MISSING_ERROR) ?? false;
}

export async function createDeletionRequest(
  input: CreateDeletionRequestInput
): Promise<DbResult<DeletionRequestRow>> {
  const supabase = createServiceSupabaseClient();
  const fromTable = ((table: string) => supabase.from(table as never)) as (
    table: string
  ) => ReturnType<typeof supabase.from>;

  const { data, error } = await fromTable("deletion_requests")
    .insert({
      organization_id: input.organizationId,
      requested_by: input.requestedBy,
      entity_type: input.entityType,
      entity_id: input.entityId,
      reason: input.reason ?? null,
      status: "pending",
    })
    .select("id, organization_id, requested_by, entity_type, entity_id, status, reason, processed_at, error_message, created_at")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as DeletionRequestRow, error: null };
}

export async function completePendingDeletionRequests(
  input: CompletePendingDeletionRequestsInput
): Promise<DbResult<string[]>> {
  const uniqueEntityIds = [...new Set(input.entityIds)];

  if (uniqueEntityIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = createServiceSupabaseClient();
  const fromTable = ((table: string) => supabase.from(table as never)) as (
    table: string
  ) => ReturnType<typeof supabase.from>;

  const { data, error } = await fromTable("deletion_requests")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("organization_id", input.organizationId)
    .eq("entity_type", input.entityType)
    .eq("status", "pending")
    .in("entity_id", uniqueEntityIds)
    .select("entity_id");

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: ((data ?? []) as Array<{ entity_id: string }>).map((row) => row.entity_id),
    error: null,
  };
}