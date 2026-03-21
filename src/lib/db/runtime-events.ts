import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json, Tables, TablesInsert } from "@/types/database";
import type { RuntimeEventV1 } from "@/lib/runtime/types";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeEventRow = Tables<"runtime_events">;
export type RuntimeEventInsert = TablesInsert<"runtime_events">;

function toJsonRecord(value: Record<string, unknown>): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Record<string, Json>;
}

export function buildRuntimeEventInsert(input: {
  organizationId: string;
  runtimeRunId: string;
  event: RuntimeEventV1;
  payload?: Record<string, unknown>;
}): RuntimeEventInsert {
  return {
    organization_id: input.organizationId,
    runtime_run_id: input.runtimeRunId,
    action_id: input.event.actionId ?? null,
    node: input.event.node ?? null,
    status: input.event.status ?? null,
    reason: input.event.reason ?? null,
    latency_ms: input.event.latencyMs ?? null,
    provider: input.event.provider ?? null,
    provider_request_id: input.event.providerRequestId ?? null,
    approval_item_id: input.event.approvalItemId ?? null,
    workflow_run_id: input.event.workflowRunId ?? null,
    workflow_step_id: input.event.workflowStepId ?? null,
    payload: toJsonRecord({
      type: input.event.type,
      request_id: input.event.requestId,
      trace_id: input.event.traceId,
      action_type: input.event.actionType,
      llm_calls: input.event.llmCalls,
      tokens_input: input.event.tokensInput,
      tokens_output: input.event.tokensOutput,
      ...(input.payload ?? {}),
    }),
  };
}

export async function insertRuntimeEvents(
  input: RuntimeEventInsert[]
): Promise<DbResult<RuntimeEventRow[]>> {
  if (input.length === 0) {
    return { data: [], error: null };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("runtime_events")
    .insert(input)
    .select("*");

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}
