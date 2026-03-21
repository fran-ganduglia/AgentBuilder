import "server-only";

import { buildRuntimeOperationsSnapshot, type RuntimeOperationsEventRecordV1, type RuntimeOperationsRunRecordV1, type RuntimeOperationsSnapshotV1, type RuntimeRunTraceViewV1 } from "@/lib/runtime/operations";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

function asRecord(value: Json | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function getRuntimeOperationsSnapshot(input: {
  organizationId: string;
  windowHours?: number;
}): Promise<DbResult<RuntimeOperationsSnapshotV1>> {
  const supabase = createServiceSupabaseClient();
  const windowHours = Math.max(1, input.windowHours ?? 24);
  const since = new Date(Date.now() - windowHours * 2 * 60 * 60 * 1000).toISOString();

  const [
    { data: runsData, error: runsError },
    { data: eventsData, error: eventsError },
    { data: approvalsData, error: approvalsError },
    { data: queueData, error: queueError },
  ] = await Promise.all([
    supabase
      .from("runtime_runs")
      .select(
        "id, request_id, trace_id, status, started_at, finished_at, estimated_cost_usd, llm_calls, tokens_input, tokens_output"
      )
      .eq("organization_id", input.organizationId)
      .gte("started_at", since)
      .order("started_at", { ascending: false }),
    supabase
      .from("runtime_events")
      .select(
        "runtime_run_id, created_at, action_id, status, reason, provider, provider_request_id, approval_item_id, workflow_run_id, workflow_step_id, node, payload"
      )
      .eq("organization_id", input.organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase
      .from("approval_items")
      .select("id, created_at")
      .eq("organization_id", input.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("event_queue")
      .select("id, status, created_at")
      .eq("organization_id", input.organizationId)
      .eq("event_type", "runtime.queue.dispatch")
      .in("status", ["pending", "processing", "failed"])
      .order("created_at", { ascending: true }),
  ]);

  const error =
    runsError?.message ??
    eventsError?.message ??
    approvalsError?.message ??
    queueError?.message ??
    null;

  if (error) {
    return { data: null, error };
  }

  const runs: RuntimeOperationsRunRecordV1[] = (runsData ?? []).map((row) => ({
    id: row.id,
    requestId: row.request_id,
    traceId: row.trace_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    llmCalls: row.llm_calls ?? 0,
    tokensInput: row.tokens_input ?? 0,
    tokensOutput: row.tokens_output ?? 0,
  }));
  const events: RuntimeOperationsEventRecordV1[] = (eventsData ?? []).map((row) => ({
    runtimeRunId: row.runtime_run_id,
    createdAt: row.created_at,
    actionId: row.action_id,
    actionType:
      asRecord(row.payload)?.["action_type"] &&
      typeof asRecord(row.payload)?.["action_type"] === "string"
        ? (asRecord(row.payload)?.["action_type"] as string)
        : null,
    node: row.node,
    status: row.status,
    reason: row.reason,
    provider: row.provider,
    providerRequestId: row.provider_request_id,
    approvalItemId: row.approval_item_id,
    workflowRunId: row.workflow_run_id,
    workflowStepId: row.workflow_step_id,
    payload: asRecord(row.payload),
  }));

  const snapshot = buildRuntimeOperationsSnapshot({
    runs,
    events,
    approvalBacklog: {
      pendingCount: approvalsData?.length ?? 0,
      oldestPendingCreatedAt: approvalsData?.[0]?.created_at ?? null,
    },
    runtimeQueueBacklog: {
      pendingCount: (queueData ?? []).filter((row) => row.status === "pending").length,
      processingCount: (queueData ?? []).filter((row) => row.status === "processing").length,
      failedCount: (queueData ?? []).filter((row) => row.status === "failed").length,
      oldestPendingCreatedAt:
        (queueData ?? []).find((row) => row.status === "pending")?.created_at ?? null,
    },
    windowHours,
  });

  return { data: snapshot, error: null };
}

export async function getRuntimeRunTraceView(input: {
  organizationId: string;
  runtimeRunId: string;
}): Promise<DbResult<RuntimeRunTraceViewV1>> {
  const supabase = createServiceSupabaseClient();
  const [{ data: runData, error: runError }, { data: eventsData, error: eventsError }] =
    await Promise.all([
      supabase
        .from("runtime_runs")
        .select(
          "id, request_id, trace_id, status, started_at, finished_at, estimated_cost_usd, llm_calls, tokens_input, tokens_output"
        )
        .eq("organization_id", input.organizationId)
        .eq("id", input.runtimeRunId)
        .maybeSingle(),
      supabase
        .from("runtime_events")
        .select(
          "runtime_run_id, created_at, action_id, status, reason, provider, provider_request_id, approval_item_id, workflow_run_id, workflow_step_id, node, payload"
        )
        .eq("organization_id", input.organizationId)
        .eq("runtime_run_id", input.runtimeRunId)
        .order("created_at", { ascending: true }),
    ]);

  const error = runError?.message ?? eventsError?.message ?? null;
  if (error) {
    return { data: null, error };
  }

  if (!runData) {
    return { data: null, error: "NOT_FOUND" };
  }

  const snapshot = buildRuntimeOperationsSnapshot({
    runs: [
      {
        id: runData.id,
        requestId: runData.request_id,
        traceId: runData.trace_id,
        status: runData.status,
        startedAt: runData.started_at,
        finishedAt: runData.finished_at,
        estimatedCostUsd: Number(runData.estimated_cost_usd ?? 0),
        llmCalls: runData.llm_calls ?? 0,
        tokensInput: runData.tokens_input ?? 0,
        tokensOutput: runData.tokens_output ?? 0,
      },
    ],
    events: (eventsData ?? []).map((row) => ({
      runtimeRunId: row.runtime_run_id,
      createdAt: row.created_at,
      actionId: row.action_id,
      actionType:
        asRecord(row.payload)?.["action_type"] &&
        typeof asRecord(row.payload)?.["action_type"] === "string"
          ? (asRecord(row.payload)?.["action_type"] as string)
          : null,
      node: row.node,
      status: row.status,
      reason: row.reason,
      provider: row.provider,
      providerRequestId: row.provider_request_id,
      approvalItemId: row.approval_item_id,
      workflowRunId: row.workflow_run_id,
      workflowStepId: row.workflow_step_id,
      payload: asRecord(row.payload),
    })),
    approvalBacklog: {
      pendingCount: 0,
      oldestPendingCreatedAt: null,
    },
    runtimeQueueBacklog: {
      pendingCount: 0,
      processingCount: 0,
      failedCount: 0,
      oldestPendingCreatedAt: null,
    },
    windowHours: 24,
  });

  return { data: snapshot.traces.runs[0] ?? null, error: null };
}
