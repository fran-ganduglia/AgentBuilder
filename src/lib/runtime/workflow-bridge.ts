import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

import { createAdapterRegistryV1 } from "./adapters/registry";
import { executeAction } from "./executor";
import type {
  ExecutionContextV1,
  ExecutionOutcomeV1,
  RuntimeActionV1,
} from "./types";

type JsonRecord = Record<string, Json>;

export type RuntimeWorkflowTraceEventV1 = {
  at: string;
  event:
    | "approval_enqueued"
    | "approval_approved"
    | "approval_rejected"
    | "approval_expired"
    | "async_execution_started"
    | "async_execution_completed"
    | "async_execution_failed";
  status:
    | "waiting_approval"
    | "queued"
    | "blocked"
    | "running"
    | "completed"
    | "failed"
    | "manual_repair_required"
    | "completed_with_degradation";
  reason?: string | null;
  provider?: string | null;
  providerRequestId?: string | null;
  approvalItemId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
};

export type RuntimeWorkflowTraceV1 = {
  runtimeRunId: string | null;
  traceId: string | null;
  requestId: string | null;
  actionId: string | null;
  actionType: string | null;
  provider: string | null;
  approvalItemId: string | null;
  workflowRunId: string | null;
  workflowStepId: string | null;
  status:
    | "waiting_approval"
    | "queued"
    | "blocked"
    | "running"
    | "completed"
    | "failed"
    | "manual_repair_required"
    | "completed_with_degradation";
  events: RuntimeWorkflowTraceEventV1[];
};

function asJsonRecord(value: Json | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asRuntimeAction(value: Json | undefined): RuntimeActionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.type !== "string" ||
    typeof candidate.approvalMode !== "string" ||
    !candidate.params ||
    typeof candidate.params !== "object" ||
    Array.isArray(candidate.params)
  ) {
    return null;
  }

  return candidate as unknown as RuntimeActionV1;
}

export function getRuntimeActionFromWorkflowPayload(
  inputPayload: Json | null | undefined
): RuntimeActionV1 | null {
  return asRuntimeAction(asJsonRecord(inputPayload).abstract_action);
}

export function readRuntimeWorkflowTrace(
  metadata: Json | null | undefined
): RuntimeWorkflowTraceV1 | null {
  const candidate = asJsonRecord(metadata).runtime_execution_trace;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const trace = candidate as Record<string, unknown>;
  if (!Array.isArray(trace.events) || typeof trace.status !== "string") {
    return null;
  }

  return candidate as unknown as RuntimeWorkflowTraceV1;
}

export function appendRuntimeWorkflowTraceEvent(input: {
  current: RuntimeWorkflowTraceV1 | null;
  runtimeRunId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  actionId?: string | null;
  actionType?: string | null;
  provider?: string | null;
  approvalItemId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  event: RuntimeWorkflowTraceEventV1;
}): RuntimeWorkflowTraceV1 {
  return {
    runtimeRunId: input.current?.runtimeRunId ?? input.runtimeRunId ?? null,
    traceId: input.current?.traceId ?? input.traceId ?? null,
    requestId: input.current?.requestId ?? input.requestId ?? null,
    actionId: input.current?.actionId ?? input.actionId ?? null,
    actionType: input.current?.actionType ?? input.actionType ?? null,
    provider: input.event.provider ?? input.current?.provider ?? input.provider ?? null,
    approvalItemId:
      input.event.approvalItemId ??
      input.current?.approvalItemId ??
      input.approvalItemId ??
      null,
    workflowRunId:
      input.event.workflowRunId ??
      input.current?.workflowRunId ??
      input.workflowRunId ??
      null,
    workflowStepId:
      input.event.workflowStepId ??
      input.current?.workflowStepId ??
      input.workflowStepId ??
      null,
    status: input.event.status,
    events: [...(input.current?.events ?? []), input.event],
  };
}

export function getRuntimeRunIdFromWorkflowMetadata(
  metadata: Json | null | undefined
): string | null {
  const value = asJsonRecord(metadata).runtime_run_id;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function persistRuntimeWorkflowTrace(input: {
  organizationId: string;
  workflowRunId: string;
  workflowStepId?: string | null;
  trace: RuntimeWorkflowTraceV1;
  mirrorToStepOutput?: boolean;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  await supabase
    .from("workflow_runs")
    .update({
      metadata: {
        ...(asJsonRecord(
          (
            await supabase
              .from("workflow_runs")
              .select("metadata")
              .eq("id", input.workflowRunId)
              .eq("organization_id", input.organizationId)
              .maybeSingle()
          ).data?.metadata
        )),
        runtime_execution_trace: input.trace as unknown as Json,
      },
    })
    .eq("id", input.workflowRunId)
    .eq("organization_id", input.organizationId);

  if (!input.workflowStepId) {
    return;
  }

  const stepResult = await supabase
    .from("workflow_steps")
    .select("output_payload")
    .eq("id", input.workflowStepId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (!input.mirrorToStepOutput || stepResult.error || !stepResult.data) {
    return;
  }

  await supabase
    .from("workflow_steps")
    .update({
      output_payload: {
        ...asJsonRecord(stepResult.data.output_payload),
        runtime_execution_trace: input.trace as unknown as Json,
      },
    })
    .eq("id", input.workflowStepId)
    .eq("organization_id", input.organizationId);
}

export async function executeApprovedRuntimeAction(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
}): Promise<ExecutionOutcomeV1> {
  return executeAction({
    ctx: input.ctx,
    action: {
      ...input.action,
      approvalMode: "auto",
    },
    registry: createAdapterRegistryV1({
      enqueueApproval: async () => ({
        data: null,
        error: "El runtime async no puede volver a encolar approvals.",
      }),
    }),
  });
}
