import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { buildRuntimeEventInsert, insertRuntimeEvents } from "@/lib/db/runtime-events";
import { updateRuntimeRun } from "@/lib/db/runtime-runs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert } from "@/types/database";
import {
  decideRunAfterStepFailure,
  type WorkflowEngineStep,
  type WorkflowRunTransitionDecision,
} from "@/lib/workflows/execution-engine";
import { executeWorkflowCompensations } from "@/lib/workflows/compensation";
import {
  appendRuntimeWorkflowTraceEvent,
  getRuntimeRunIdFromWorkflowMetadata,
  persistRuntimeWorkflowTrace,
  readRuntimeWorkflowTrace,
} from "@/lib/runtime/workflow-bridge";
import {
  enqueueWorkflowStepRuntimeResume,
  getRuntimeQueueDispatchPayloadFromMetadata,
} from "@/lib/runtime/runtime-queue-dispatcher";
import type { RuntimeActionType } from "@/lib/runtime/types";

type DbResult<T> = { data: T | null; error: string | null };

export type ApprovalItemRow = Tables<"approval_items">;
export type ApprovalItemInsert = TablesInsert<"approval_items">;
export type ApprovalItemStatus = ApprovalItemRow["status"];
type WorkflowStepRow = Tables<"workflow_steps">;
type WorkflowRunRow = Tables<"workflow_runs">;

export type ApprovalListFilters = {
  status?: ApprovalItemStatus;
  limit?: number;
  agentId?: string;
};

export type ResolveApprovalItemInput = {
  organizationId: string;
  approvalItemId: string;
  userId: string;
  action: "approve" | "reject";
  resolutionNote?: string | null;
};

const DEFAULT_APPROVAL_LIMIT = 50;

function toEngineStep(step: WorkflowStepRow): WorkflowEngineStep {
  return {
    id: step.id,
    step_id: step.step_id,
    step_index: step.step_index,
    status: step.status,
    is_required: step.is_required,
    attempt: step.attempt,
    max_attempts: step.max_attempts,
    compensation_action: step.compensation_action,
  };
}

async function queueWorkflowStepExecution(input: {
  organizationId: string;
  workflowRunId: string;
  workflowStepId: string;
  runtimeRunId?: string | null;
  runtimeActionId?: string;
  runtimeActionType?: RuntimeActionType;
  traceId?: string | null;
}): Promise<void> {
  const enqueuedViaRuntime = await enqueueWorkflowStepRuntimeResume({
    organizationId: input.organizationId,
    runtimeRunId: input.runtimeRunId ?? null,
    workflowRunId: input.workflowRunId,
    workflowStepId: input.workflowStepId,
    checkpointNode: "execute",
    resumeReason: "resume_after_approval",
    traceId: input.traceId ?? input.runtimeRunId ?? input.workflowStepId,
    actionId: input.runtimeActionId,
    actionType: input.runtimeActionType,
  });

  if (enqueuedViaRuntime) {
    return;
  }

  await enqueueEvent({
    organizationId: input.organizationId,
    eventType: "workflow.step.execute",
    entityType: "workflow_step",
    entityId: input.workflowStepId,
    payload: {
      workflowRunId: input.workflowRunId,
      workflowStepId: input.workflowStepId,
    },
    idempotencyKey: `workflow.step.execute:${input.workflowStepId}`,
    correlationId: input.workflowRunId,
    traceId: input.traceId ?? input.workflowStepId,
    maxAttempts: 3,
  });
}

async function applyRunDecision(input: {
  organizationId: string;
  workflowRunId: string;
  fallbackCurrentStepId: string | null;
  decision: WorkflowRunTransitionDecision;
  failureCode?: string | null;
  failureMessage?: string | null;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  if (input.decision.markCompensationPendingStepIds.length > 0) {
    await supabase
      .from("workflow_steps")
      .update({ compensation_status: "pending" })
      .in("id", input.decision.markCompensationPendingStepIds)
      .eq("organization_id", input.organizationId);
  }

  await supabase
    .from("workflow_runs")
    .update({
      status: input.decision.runStatus,
      current_step_id: input.decision.currentStepId ?? input.fallbackCurrentStepId,
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      last_transition_at: now,
      finished_at: input.decision.finished ? now : null,
    })
    .eq("id", input.workflowRunId)
    .eq("organization_id", input.organizationId);

  if (input.decision.nextStepToEnqueueId) {
    await queueWorkflowStepExecution({
      organizationId: input.organizationId,
      workflowRunId: input.workflowRunId,
      workflowStepId: input.decision.nextStepToEnqueueId,
    });
  }
}

async function transitionAfterApprovalFailure(input: {
  organizationId: string;
  workflowRunId: string;
  workflowStepId: string;
  errorCode: string;
  errorMessage: string;
  stepStatus: "failed" | "failed_due_to_expired_approval";
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  await supabase
    .from("workflow_steps")
    .update({
      status: input.stepStatus,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      finished_at: now,
    })
    .eq("id", input.workflowStepId)
    .eq("organization_id", input.organizationId);

  const { data: runSteps, error } = await supabase
    .from("workflow_steps")
    .select("id, workflow_run_id, organization_id, provider, action, status, step_id, step_index, is_required, approval_policy, approval_timeout_ms, attempt, max_attempts, compensation_action, compensation_status, input_payload, output_payload")
    .eq("workflow_run_id", input.workflowRunId)
    .eq("organization_id", input.organizationId)
    .order("step_index", { ascending: true })
    .order("attempt", { ascending: true });

  if (error) {
    return;
  }

  const { data: workflowRun, error: workflowRunError } = await supabase
    .from("workflow_runs")
    .select("id, organization_id, agent_id, created_by, metadata")
    .eq("id", input.workflowRunId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (workflowRunError || !workflowRun) {
    return;
  }

  const decision = decideRunAfterStepFailure({
    steps: (runSteps ?? []).map((step) =>
      step.id === input.workflowStepId
        ? { ...toEngineStep(step as WorkflowStepRow), status: input.stepStatus }
        : toEngineStep(step as WorkflowStepRow)
    ),
    currentStepId: input.workflowStepId,
    failureReason:
      input.errorCode === "approval_expired"
        ? "approval_expired"
        : "approval_rejected",
  });

  if (decision.markCompensationPendingStepIds.length > 0) {
    const compensation = await executeWorkflowCompensations({
      organizationId: input.organizationId,
      workflowRun: workflowRun as WorkflowRunRow,
      workflowSteps: (runSteps ?? []) as WorkflowStepRow[],
      failedStepId: input.workflowStepId,
    });

    await applyRunDecision({
      organizationId: input.organizationId,
      workflowRunId: input.workflowRunId,
      fallbackCurrentStepId:
        (runSteps ?? []).find((step) => step.id === input.workflowStepId)?.step_id ?? null,
      decision: {
        ...decision,
        runStatus: compensation.manualRepairRequired ? "manual_repair_required" : "failed",
      },
      failureCode: input.errorCode,
      failureMessage: input.errorMessage,
    });

    return;
  }

  await applyRunDecision({
    organizationId: input.organizationId,
    workflowRunId: input.workflowRunId,
    fallbackCurrentStepId:
      (runSteps ?? []).find((step) => step.id === input.workflowStepId)?.step_id ?? null,
    decision,
    failureCode: input.errorCode,
    failureMessage: input.errorMessage,
  });
}

async function markWorkflowExpired(
  organizationId: string,
  workflowRunId: string,
  workflowStepId: string
): Promise<void> {
  await transitionAfterApprovalFailure({
    organizationId,
    workflowRunId,
    workflowStepId,
    errorCode: "approval_expired",
    errorMessage: "La aprobacion expiro antes de resolverse.",
    stepStatus: "failed_due_to_expired_approval",
  });

  const supabase = createServiceSupabaseClient();
  const [{ data: workflowRun }, { data: approvalItem }] = await Promise.all([
    supabase
      .from("workflow_runs")
      .select("metadata")
      .eq("id", workflowRunId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("approval_items")
      .select("id")
      .eq("workflow_run_id", workflowRunId)
      .eq("workflow_step_id", workflowStepId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  const trace = appendRuntimeWorkflowTraceEvent({
    current: readRuntimeWorkflowTrace(workflowRun?.metadata),
    runtimeRunId: getRuntimeRunIdFromWorkflowMetadata(workflowRun?.metadata),
    approvalItemId: approvalItem?.id ?? null,
    workflowRunId,
    workflowStepId,
    event: {
      at: new Date().toISOString(),
      event: "approval_expired",
      status: "blocked",
      reason: "approval_expired",
      approvalItemId: approvalItem?.id ?? null,
      workflowRunId,
      workflowStepId,
    },
  });
  await persistRuntimeWorkflowTrace({
    organizationId,
    workflowRunId,
    workflowStepId,
    trace,
    mirrorToStepOutput: true,
  });
  if (trace.runtimeRunId) {
    await insertRuntimeEvents([
      buildRuntimeEventInsert({
        organizationId,
        runtimeRunId: trace.runtimeRunId,
        event: {
          type: "runtime.action.blocked",
          requestId: trace.requestId ?? workflowRunId,
          traceId: trace.traceId ?? workflowRunId,
          runtimeRunId: trace.runtimeRunId,
          actionId: trace.actionId ?? undefined,
          actionType: (trace.actionType as RuntimeActionType | null) ?? undefined,
          status: "blocked",
          reason: "approval_expired",
          approvalItemId: approvalItem?.id ?? undefined,
          workflowRunId,
          workflowStepId,
        },
        payload: {
          workflow_trace_event: "approval_expired",
        },
      }),
    ]);
    await updateRuntimeRun(organizationId, trace.runtimeRunId, {
      status: "blocked",
      checkpoint_node: "execute",
      finished_at: new Date().toISOString(),
    });
  }
}

export async function insertApprovalItem(
  input: ApprovalItemInsert
): Promise<DbResult<ApprovalItemRow>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("approval_items")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function expireStaleApprovalItems(
  organizationId?: string
): Promise<DbResult<number>> {
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from("approval_items")
    .update({
      status: "expired",
      resolved_at: new Date().toISOString(),
      resolution_note: "Expirado automaticamente por timeout de aprobacion.",
    })
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString())
    .select("id, organization_id, workflow_run_id, workflow_step_id");

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  const expiredItems = data ?? [];

  await Promise.all(
    expiredItems.map((item) =>
      markWorkflowExpired(
        item.organization_id,
        item.workflow_run_id,
        item.workflow_step_id
      )
    )
  );

  return { data: expiredItems.length, error: null };
}

export async function listApprovalItems(
  organizationId: string,
  filters: ApprovalListFilters = {}
): Promise<DbResult<ApprovalItemRow[]>> {
  await expireStaleApprovalItems(organizationId);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("approval_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? DEFAULT_APPROVAL_LIMIT);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.agentId) {
    query = query.eq("agent_id", filters.agentId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function countPendingApprovalItems(
  organizationId: string
): Promise<DbResult<number>> {
  await expireStaleApprovalItems(organizationId);

  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("approval_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "pending");

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: count ?? 0, error: null };
}

export async function getApprovalItemById(
  organizationId: string,
  approvalItemId: string
): Promise<DbResult<ApprovalItemRow>> {
  await expireStaleApprovalItems(organizationId);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("approval_items")
    .select("*")
    .eq("id", approvalItemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

export async function resolveApprovalItem(
  input: ResolveApprovalItemInput
): Promise<DbResult<ApprovalItemRow>> {
  await expireStaleApprovalItems(input.organizationId);

  const supabase = createServiceSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("approval_items")
    .select("*")
    .eq("id", input.approvalItemId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (currentError) {
    return { data: null, error: currentError.message };
  }

  if (!current) {
    return { data: null, error: "NOT_FOUND" };
  }

  if (current.status !== "pending") {
    return { data: null, error: "APPROVAL_ALREADY_RESOLVED" };
  }

  const now = new Date().toISOString();
  const nextStatus = input.action === "approve" ? "approved" : "rejected";
  const { data, error } = await supabase
    .from("approval_items")
    .update({
      status: nextStatus,
      resolved_at: now,
      resolved_by: input.userId,
      resolution_note: input.resolutionNote ?? null,
    })
    .eq("id", input.approvalItemId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (input.action === "approve") {
    await supabase
      .from("workflow_steps")
      .update({
        status: "queued",
        error_code: null,
        error_message: null,
        finished_at: null,
      })
      .eq("id", current.workflow_step_id)
      .eq("organization_id", input.organizationId);

    await supabase
      .from("workflow_runs")
      .update({
        status: "queued",
        failure_code: null,
        failure_message: null,
        last_transition_at: now,
        finished_at: null,
      })
      .eq("id", current.workflow_run_id)
      .eq("organization_id", input.organizationId);

    const { data: workflowRun } = await supabase
      .from("workflow_runs")
      .select("metadata")
      .eq("id", current.workflow_run_id)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    const runtimeResumeMetadata = getRuntimeQueueDispatchPayloadFromMetadata(workflowRun?.metadata);
    const trace = appendRuntimeWorkflowTraceEvent({
      current: readRuntimeWorkflowTrace(workflowRun?.metadata),
      runtimeRunId: getRuntimeRunIdFromWorkflowMetadata(workflowRun?.metadata),
      approvalItemId: current.id,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      event: {
        at: now,
        event: "approval_approved",
        status: "queued",
        approvalItemId: current.id,
        workflowRunId: current.workflow_run_id,
        workflowStepId: current.workflow_step_id,
      },
    });
    await persistRuntimeWorkflowTrace({
      organizationId: input.organizationId,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      trace,
      mirrorToStepOutput: true,
    });
    if (trace.runtimeRunId) {
      await insertRuntimeEvents([
        buildRuntimeEventInsert({
          organizationId: input.organizationId,
          runtimeRunId: trace.runtimeRunId,
          event: {
            type: "runtime.node.completed",
            requestId: trace.requestId ?? current.workflow_run_id,
            traceId: trace.traceId ?? current.workflow_run_id,
            runtimeRunId: trace.runtimeRunId,
            actionId: trace.actionId ?? undefined,
            actionType: (trace.actionType as RuntimeActionType | null) ?? undefined,
            node: "execute",
            status: "waiting_async_execution",
            approvalItemId: current.id,
            workflowRunId: current.workflow_run_id,
            workflowStepId: current.workflow_step_id,
          },
          payload: {
            workflow_trace_event: "approval_approved",
          },
        }),
      ]);
      await updateRuntimeRun(input.organizationId, trace.runtimeRunId, {
        status: "waiting_async_execution",
        checkpoint_node: "execute",
        finished_at: null,
      });
    }

    await queueWorkflowStepExecution({
      organizationId: input.organizationId,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      runtimeRunId: trace.runtimeRunId,
      runtimeActionId: runtimeResumeMetadata.actionId,
      runtimeActionType: runtimeResumeMetadata.actionType,
      traceId: current.id,
    });
  } else {
    await transitionAfterApprovalFailure({
      organizationId: input.organizationId,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      errorCode: "approval_rejected",
      errorMessage: "La aprobacion fue rechazada por un operador.",
      stepStatus: "failed",
    });

    const { data: workflowRun } = await supabase
      .from("workflow_runs")
      .select("metadata")
      .eq("id", current.workflow_run_id)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    const trace = appendRuntimeWorkflowTraceEvent({
      current: readRuntimeWorkflowTrace(workflowRun?.metadata),
      runtimeRunId: getRuntimeRunIdFromWorkflowMetadata(workflowRun?.metadata),
      approvalItemId: current.id,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      event: {
        at: now,
        event: "approval_rejected",
        status: "blocked",
        reason: "approval_rejected",
        approvalItemId: current.id,
        workflowRunId: current.workflow_run_id,
        workflowStepId: current.workflow_step_id,
      },
    });
    await persistRuntimeWorkflowTrace({
      organizationId: input.organizationId,
      workflowRunId: current.workflow_run_id,
      workflowStepId: current.workflow_step_id,
      trace,
      mirrorToStepOutput: true,
    });
    if (trace.runtimeRunId) {
      await insertRuntimeEvents([
        buildRuntimeEventInsert({
          organizationId: input.organizationId,
          runtimeRunId: trace.runtimeRunId,
          event: {
            type: "runtime.action.blocked",
            requestId: trace.requestId ?? current.workflow_run_id,
            traceId: trace.traceId ?? current.workflow_run_id,
            runtimeRunId: trace.runtimeRunId,
            actionId: trace.actionId ?? undefined,
            actionType: (trace.actionType as RuntimeActionType | null) ?? undefined,
            status: "blocked",
            reason: "approval_rejected",
            approvalItemId: current.id,
            workflowRunId: current.workflow_run_id,
            workflowStepId: current.workflow_step_id,
          },
          payload: {
            workflow_trace_event: "approval_rejected",
          },
        }),
      ]);
      await updateRuntimeRun(input.organizationId, trace.runtimeRunId, {
        status: "blocked",
        checkpoint_node: "execute",
        finished_at: new Date().toISOString(),
      });
    }
  }

  // Clear pending_crm_action from conversation metadata so the chat rail
  // does not re-show the confirmation panel after resolve/reject.
  const context = current.context as Record<string, unknown> | null;
  const conversationId = typeof context?.["conversation_id"] === "string"
    ? context["conversation_id"]
    : null;

  if (conversationId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (conv) {
      const currentMeta = (conv.metadata as Record<string, unknown>) ?? {};
      await supabase
        .from("conversations")
        .update({
          metadata: { ...currentMeta, pending_crm_action: null },
        })
        .eq("id", conversationId)
        .eq("organization_id", input.organizationId);
    }
  }

  return { data: data ?? null, error: null };
}
