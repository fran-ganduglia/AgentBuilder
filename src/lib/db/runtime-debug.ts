import "server-only";

import { insertAuditLog } from "@/lib/db/audit";
import { enqueueRuntimeResumeEvent } from "@/lib/runtime/runtime-queue-dispatcher";
import {
  buildManualRepairResult,
  inferReplaySourceFromTrace,
  type RuntimeReplaySourceV1,
} from "@/lib/runtime/debug-tools";
import type {
  RuntimeActionPlan,
  RuntimeActionType,
  RuntimeDeadLetterRecordV1,
  RuntimeGraphNodeId,
  RuntimeManualRepairResultV1,
  RuntimeResumeReasonV1,
} from "@/lib/runtime/types";
import { RUNTIME_ACTION_TYPES } from "@/lib/runtime/types";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRuntimeActionPlan(value: unknown): value is RuntimeActionPlan {
  const record = asRecord(value);
  return (
    !!record &&
    (record.version === 1 || record.version === 3) &&
    Array.isArray(record.actions)
  );
}

function parseRuntimeActionPlan(value: Json | null): RuntimeActionPlan | null {
  return isRuntimeActionPlan(value) ? (value as unknown as RuntimeActionPlan) : null;
}

function parseRuntimeActionType(value: string | null | undefined): RuntimeActionType | undefined {
  return value && RUNTIME_ACTION_TYPES.includes(value as RuntimeActionType)
    ? (value as RuntimeActionType)
    : undefined;
}

export async function getRuntimeReplaySource(input: {
  organizationId: string;
  runtimeRunId: string;
}): Promise<DbResult<RuntimeReplaySourceV1>> {
  const supabase = createServiceSupabaseClient();
  const [{ data: runData, error: runError }, { data: eventsData, error: eventsError }] =
    await Promise.all([
      supabase
        .from("runtime_runs")
        .select(
          "id, organization_id, agent_id, conversation_id, request_id, trace_id, status, started_at, finished_at, current_action_index, checkpoint_node, action_plan, estimated_cost_usd, llm_calls, tokens_input, tokens_output"
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

  const trace = {
    runtimeRunId: runData.id,
    requestId: runData.request_id,
    traceId: runData.trace_id,
    status: runData.status,
    startedAt: runData.started_at,
    finishedAt: runData.finished_at,
    events: (eventsData ?? []).map((row) => ({
      runtimeRunId: row.runtime_run_id,
      createdAt: row.created_at,
      actionId: row.action_id,
      actionType:
        typeof asRecord(row.payload)?.action_type === "string"
          ? (asRecord(row.payload)?.action_type as string)
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
    sideEffects: [],
  };

  return {
    data: inferReplaySourceFromTrace({
      run: {
        id: runData.id,
        organizationId: runData.organization_id,
        agentId: runData.agent_id,
        conversationId: runData.conversation_id,
        requestId: runData.request_id,
        traceId: runData.trace_id,
        status: runData.status,
        startedAt: runData.started_at,
        finishedAt: runData.finished_at,
        estimatedCostUsd: Number(runData.estimated_cost_usd ?? 0),
        llmCalls: runData.llm_calls ?? 0,
        tokensInput: runData.tokens_input ?? 0,
        tokensOutput: runData.tokens_output ?? 0,
        currentActionIndex: runData.current_action_index ?? 0,
        checkpointNode: runData.checkpoint_node,
        actionPlan: parseRuntimeActionPlan(runData.action_plan),
      },
      trace,
    }),
    error: null,
  };
}

export async function listRuntimeDeadLetters(input: {
  organizationId: string;
  limit?: number;
}): Promise<DbResult<RuntimeDeadLetterRecordV1[]>> {
  const supabase = createServiceSupabaseClient();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const [{ data: runsData, error: runsError }, { data: queueData, error: queueError }] =
    await Promise.all([
      supabase
        .from("runtime_runs")
        .select("id, status, checkpoint_node, updated_at")
        .eq("organization_id", input.organizationId)
        .in("status", ["failed", "manual_repair_required"])
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("event_queue")
        .select("id, entity_id, created_at")
        .eq("organization_id", input.organizationId)
        .eq("event_type", "runtime.queue.dispatch")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

  const error = runsError?.message ?? queueError?.message ?? null;
  if (error) {
    return { data: null, error };
  }

  const runtimeRunIds = [
    ...(runsData ?? []).map((row) => row.id),
    ...(queueData ?? [])
      .map((row) => (typeof row.entity_id === "string" ? row.entity_id : null))
      .filter((value): value is string => !!value),
  ];

  if (runtimeRunIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("runtime_events")
    .select("runtime_run_id, created_at, reason, workflow_run_id, workflow_step_id")
    .eq("organization_id", input.organizationId)
    .in("runtime_run_id", runtimeRunIds)
    .order("created_at", { ascending: false });

  if (eventsError) {
    return { data: null, error: eventsError.message };
  }

  const latestEventByRunId = new Map<string, (typeof eventsData)[number]>();
  for (const event of eventsData ?? []) {
    if (!latestEventByRunId.has(event.runtime_run_id)) {
      latestEventByRunId.set(event.runtime_run_id, event);
    }
  }

  const failedQueueEventByRunId = new Map<string, string>();
  for (const event of queueData ?? []) {
    if (typeof event.entity_id === "string" && !failedQueueEventByRunId.has(event.entity_id)) {
      failedQueueEventByRunId.set(event.entity_id, event.id);
    }
  }

  const rows = [...new Set(runtimeRunIds)].map((runtimeRunId) => {
    const run = (runsData ?? []).find((candidate) => candidate.id === runtimeRunId);
    const latestEvent = latestEventByRunId.get(runtimeRunId);

    return {
      runtimeRunId,
      status: run?.status ?? "failed",
      latestReason: latestEvent?.reason ?? null,
      latestEventAt: latestEvent?.created_at ?? run?.updated_at ?? new Date().toISOString(),
      checkpointNode: run?.checkpoint_node ?? null,
      workflowRunId: latestEvent?.workflow_run_id ?? null,
      workflowStepId: latestEvent?.workflow_step_id ?? null,
      failedQueueEventId: failedQueueEventByRunId.get(runtimeRunId) ?? null,
    };
  });

  return {
    data: rows.sort((left, right) => right.latestEventAt.localeCompare(left.latestEventAt)),
    error: null,
  };
}

export async function enqueueRuntimeManualRepair(input: {
  organizationId: string;
  userId: string;
  runtimeRunId: string;
  checkpointNode: RuntimeGraphNodeId;
  resumeReason?: RuntimeResumeReasonV1;
  reason?: string;
}): Promise<DbResult<RuntimeManualRepairResultV1>> {
  const sourceResult = await getRuntimeReplaySource({
    organizationId: input.organizationId,
    runtimeRunId: input.runtimeRunId,
  });

  if (sourceResult.error || !sourceResult.data) {
    return { data: null, error: sourceResult.error ?? "runtime_run_not_found" };
  }

  const latestResumeEvent = [...sourceResult.data.trace.events]
    .reverse()
    .find((event) => event.workflowRunId && event.workflowStepId);

  if (!latestResumeEvent?.workflowRunId || !latestResumeEvent.workflowStepId) {
    return { data: null, error: "runtime_manual_repair_missing_workflow_target" };
  }

  const resumeReason = input.resumeReason ?? "resume_after_retry_delay";
  const actionId = latestResumeEvent.actionId ?? undefined;
  const actionType =
    parseRuntimeActionType(latestResumeEvent.actionType) ??
    (actionId
      ? sourceResult.data.actionPlan?.actions.find((action) => action.id === actionId)?.type
      : undefined);

  await enqueueRuntimeResumeEvent({
    organizationId: input.organizationId,
    runtimeRunId: input.runtimeRunId,
    traceId: sourceResult.data.traceId,
    resumeToken: {
      version: 1,
      runtimeRunId: input.runtimeRunId,
      resumeReason,
      checkpointNode: input.checkpointNode,
      actionId,
      actionType,
      target: {
        kind: "workflow_step_execute",
        workflowRunId: latestResumeEvent.workflowRunId,
        workflowStepId: latestResumeEvent.workflowStepId,
        ...(latestResumeEvent.approvalItemId
          ? { approvalItemId: latestResumeEvent.approvalItemId }
          : {}),
      },
      requestedAt: new Date().toISOString(),
      requestedBy: input.userId,
    },
  });

  await supabaseUpdateRuntimeRunForRepair({
    organizationId: input.organizationId,
    runtimeRunId: input.runtimeRunId,
    checkpointNode: input.checkpointNode,
  });

  await insertAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "runtime.manual_repair.enqueued",
    resourceType: "runtime_run",
    resourceId: input.runtimeRunId,
    newValue: {
      checkpoint_node: input.checkpointNode,
      workflow_run_id: latestResumeEvent.workflowRunId,
      workflow_step_id: latestResumeEvent.workflowStepId,
      resume_reason: resumeReason,
      reason: input.reason ?? null,
    } as Json,
  });

  return {
    data: buildManualRepairResult({
      runtimeRunId: input.runtimeRunId,
      checkpointNode: input.checkpointNode,
      workflowRunId: latestResumeEvent.workflowRunId,
      workflowStepId: latestResumeEvent.workflowStepId,
      resumeReason,
      approvalItemId: latestResumeEvent.approvalItemId ?? undefined,
    }),
    error: null,
  };
}

async function supabaseUpdateRuntimeRunForRepair(input: {
  organizationId: string;
  runtimeRunId: string;
  checkpointNode: RuntimeGraphNodeId;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();

  await supabase
    .from("runtime_runs")
    .update({
      status: "waiting_async_execution",
      checkpoint_node: input.checkpointNode,
      finished_at: null,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.runtimeRunId);
}
