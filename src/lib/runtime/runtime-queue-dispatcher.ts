import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { buildRuntimeEventInsert, insertRuntimeEvents } from "@/lib/db/runtime-events";
import { getRuntimeRunIdFromWorkflowMetadata } from "@/lib/runtime/workflow-bridge";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";
import type { EventRow } from "@/lib/workers/event-queue";

import type {
  RuntimeActionType,
  RuntimeGraphNodeId,
  RuntimeResumeReasonV1,
  RuntimeResumeTokenV1,
} from "./types";

type WorkflowResumeTargetInput = {
  runtimeRunId: string;
  workflowRunId: string;
  workflowStepId: string;
  checkpointNode: RuntimeGraphNodeId;
  resumeReason: RuntimeResumeReasonV1;
  requestedAt?: string;
  requestedBy?: string;
  sourceEventId?: string;
  actionId?: string;
  actionType?: RuntimeActionType;
  approvalItemId?: string;
};

type RuntimeQueueDispatchPayload = {
  runtimeRunId: string;
  resumeToken: RuntimeResumeTokenV1;
};

function asJsonRecord(value: Json | null | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json>;
}

export function buildWorkflowStepResumeToken(
  input: WorkflowResumeTargetInput
): RuntimeResumeTokenV1 {
  return {
    version: 1,
    runtimeRunId: input.runtimeRunId,
    resumeReason: input.resumeReason,
    checkpointNode: input.checkpointNode,
    actionId: input.actionId,
    actionType: input.actionType,
    target: {
      kind: "workflow_step_execute",
      workflowRunId: input.workflowRunId,
      workflowStepId: input.workflowStepId,
      ...(input.approvalItemId ? { approvalItemId: input.approvalItemId } : {}),
    },
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
  };
}

function isRuntimeResumeToken(value: unknown): value is RuntimeResumeTokenV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const target = candidate.target;

  return candidate.version === 1 &&
    typeof candidate.runtimeRunId === "string" &&
    typeof candidate.resumeReason === "string" &&
    typeof candidate.checkpointNode === "string" &&
    typeof candidate.requestedAt === "string" &&
    !!target &&
    typeof target === "object" &&
    !Array.isArray(target) &&
    (target as Record<string, unknown>).kind === "workflow_step_execute" &&
    typeof (target as Record<string, unknown>).workflowRunId === "string" &&
    typeof (target as Record<string, unknown>).workflowStepId === "string";
}

export function readRuntimeQueueDispatchPayload(
  payload: Record<string, unknown> | null | undefined
): RuntimeQueueDispatchPayload | null {
  if (!payload || typeof payload.runtimeRunId !== "string" || !isRuntimeResumeToken(payload.resumeToken)) {
    return null;
  }

  if (payload.resumeToken.runtimeRunId !== payload.runtimeRunId) {
    return null;
  }

  return {
    runtimeRunId: payload.runtimeRunId,
    resumeToken: payload.resumeToken,
  };
}

export async function enqueueRuntimeResumeEvent(input: {
  organizationId: string;
  runtimeRunId: string;
  resumeToken: RuntimeResumeTokenV1;
  traceId?: string | null;
  correlationId?: string | null;
  processAfter?: string | null;
  maxAttempts?: number | null;
}): Promise<void> {
  await insertRuntimeEvents([
    buildRuntimeEventInsert({
      organizationId: input.organizationId,
      runtimeRunId: input.runtimeRunId,
      event: {
        type: "runtime.resume.enqueued",
        requestId: input.resumeToken.sourceEventId ?? input.resumeToken.runtimeRunId,
        traceId: input.traceId ?? input.resumeToken.runtimeRunId,
        runtimeRunId: input.runtimeRunId,
        actionId: input.resumeToken.actionId,
        actionType: input.resumeToken.actionType,
        node: input.resumeToken.checkpointNode,
        status: "waiting_async_execution",
        approvalItemId: input.resumeToken.target.approvalItemId,
        workflowRunId: input.resumeToken.target.workflowRunId,
        workflowStepId: input.resumeToken.target.workflowStepId,
        reason: input.resumeToken.resumeReason,
      },
      payload: {
        resume_token: input.resumeToken,
      },
    }),
  ]);

  await enqueueEvent({
    organizationId: input.organizationId,
    eventType: "runtime.queue.dispatch",
    entityType: "runtime_run",
    entityId: input.runtimeRunId,
    payload: {
      runtimeRunId: input.runtimeRunId,
      resumeToken: input.resumeToken as unknown as Json,
    },
    idempotencyKey:
      `runtime.queue.dispatch:${input.runtimeRunId}:${input.resumeToken.resumeReason}:` +
      `${input.resumeToken.target.kind}:${input.resumeToken.target.workflowStepId}`,
    correlationId: input.correlationId ?? input.runtimeRunId,
    traceId: input.traceId ?? input.runtimeRunId,
    processAfter: input.processAfter ?? null,
    maxAttempts: input.maxAttempts ?? 3,
  });
}

export async function enqueueWorkflowStepRuntimeResume(input: {
  organizationId: string;
  runtimeRunId: string | null;
  workflowRunId: string;
  workflowStepId: string;
  checkpointNode: RuntimeGraphNodeId;
  resumeReason: RuntimeResumeReasonV1;
  traceId?: string | null;
  processAfter?: string | null;
  approvalItemId?: string;
  requestedBy?: string;
  sourceEventId?: string;
  actionId?: string;
  actionType?: RuntimeActionType;
}): Promise<boolean> {
  if (!input.runtimeRunId) {
    return false;
  }

  await enqueueRuntimeResumeEvent({
    organizationId: input.organizationId,
    runtimeRunId: input.runtimeRunId,
    traceId: input.traceId ?? input.runtimeRunId,
    processAfter: input.processAfter ?? null,
    resumeToken: buildWorkflowStepResumeToken({
      runtimeRunId: input.runtimeRunId,
      workflowRunId: input.workflowRunId,
      workflowStepId: input.workflowStepId,
      checkpointNode: input.checkpointNode,
      resumeReason: input.resumeReason,
      requestedBy: input.requestedBy,
      sourceEventId: input.sourceEventId,
      actionId: input.actionId,
      actionType: input.actionType,
      approvalItemId: input.approvalItemId,
    }),
  });

  return true;
}

export async function loadRuntimeQueueDispatchContext(input: {
  organizationId: string;
  payload: RuntimeQueueDispatchPayload;
}): Promise<RuntimeQueueDispatchPayload> {
  const supabase = createServiceSupabaseClient();
  const { data: runtimeRun, error: runtimeRunError } = await supabase
    .from("runtime_runs")
    .select("id, organization_id, trace_id, action_plan")
    .eq("id", input.payload.runtimeRunId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (runtimeRunError || !runtimeRun) {
    throw new Error(runtimeRunError?.message ?? "runtime_run_not_found");
  }

  if (input.payload.resumeToken.target.kind !== "workflow_step_execute") {
    throw new Error("runtime_resume_target_unsupported");
  }

  return input.payload;
}

export async function readRuntimeRunIdFromWorkflowRun(input: {
  organizationId: string;
  workflowRunId: string;
}): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("metadata")
    .eq("id", input.workflowRunId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return getRuntimeRunIdFromWorkflowMetadata(data.metadata);
}

export async function buildWorkflowStepEventFromRuntimeDispatch(
  event: EventRow
): Promise<EventRow> {
  const payload = readRuntimeQueueDispatchPayload(event.payload);
  if (!payload) {
    throw new Error("runtime_queue_dispatch_invalid_payload");
  }

  const hydrated = await loadRuntimeQueueDispatchContext({
    organizationId: event.organization_id,
    payload,
  });

  await insertRuntimeEvents([
    buildRuntimeEventInsert({
      organizationId: event.organization_id,
      runtimeRunId: hydrated.runtimeRunId,
      event: {
        type: "runtime.resume.dispatched",
        requestId: hydrated.resumeToken.sourceEventId ?? hydrated.runtimeRunId,
        traceId: event.id,
        runtimeRunId: hydrated.runtimeRunId,
        actionId: hydrated.resumeToken.actionId,
        actionType: hydrated.resumeToken.actionType,
        node: hydrated.resumeToken.checkpointNode,
        status: "waiting_async_execution",
        approvalItemId: hydrated.resumeToken.target.approvalItemId,
        workflowRunId: hydrated.resumeToken.target.workflowRunId,
        workflowStepId: hydrated.resumeToken.target.workflowStepId,
        reason: hydrated.resumeToken.resumeReason,
      },
      payload: {
        source_event_id: event.id,
        resume_token: hydrated.resumeToken,
      },
    }),
  ]);

  return buildWorkflowStepEventFromResumeToken(event, hydrated.resumeToken);
}

export function buildWorkflowStepEventFromResumeToken(
  event: EventRow,
  resumeToken: RuntimeResumeTokenV1
): EventRow {
  return {
    ...event,
    event_type: "workflow.step.execute",
    payload: {
      workflowRunId: resumeToken.target.workflowRunId,
      workflowStepId: resumeToken.target.workflowStepId,
      ...(resumeToken.target.approvalItemId
        ? { approvalItemId: resumeToken.target.approvalItemId }
        : {}),
    },
  };
}

export function getRuntimeQueueDispatchPayloadFromMetadata(value: Json | null | undefined): {
  actionId?: string;
  actionType?: RuntimeActionType;
} {
  const metadata = asJsonRecord(value);
  return {
    actionId:
      typeof metadata.runtime_action_id === "string" ? metadata.runtime_action_id : undefined,
    actionType:
      typeof metadata.runtime_action_type === "string"
        ? (metadata.runtime_action_type as RuntimeActionType)
        : undefined,
  };
}
