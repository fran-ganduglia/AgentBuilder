import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { executeHubSpotToolAction } from "@/lib/integrations/hubspot-agent-runtime";
import {
  assertGoogleGmailRuntimeUsable,
  executeGoogleGmailWriteToolAction,
} from "@/lib/integrations/google-gmail-agent-runtime";
import {
  assertGoogleCalendarRuntimeUsable,
  executeGoogleCalendarWriteToolAction,
} from "@/lib/integrations/google-calendar-agent-runtime";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import { executeGoogleGmailWriteToolSchema } from "@/lib/integrations/google-agent-tools";
import { executeGoogleCalendarWriteToolSchema } from "@/lib/integrations/google-agent-tools";
import { executeHubSpotCrmToolSchema } from "@/lib/integrations/hubspot-tools";
import { executeSalesforceToolAction } from "@/lib/integrations/salesforce-agent-runtime";
import { executeSalesforceCrmToolSchema } from "@/lib/integrations/salesforce-tools";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";
import type { EventRow } from "@/lib/workers/event-queue";
import {
  buildWorkflowStepIdempotencyKey,
  computeWorkflowRetryDelayMs,
  decideRunAfterStepCompletion,
  decideRunAfterStepFailure,
  getLatestWorkflowSteps,
  normalizeWorkflowExecutionError,
  shouldRetryWorkflowStep,
  type WorkflowEngineStep,
  type WorkflowRunTransitionDecision,
} from "@/lib/workflows/execution-engine";
import { executeWorkflowCompensations } from "@/lib/workflows/compensation";

type WorkflowRunRecord = {
  id: string;
  organization_id: string;
  agent_id: string;
  created_by: string | null;
  metadata: Json;
};

type WorkflowStepRecord = {
  id: string;
  workflow_run_id: string;
  organization_id: string;
  provider: string;
  action: string;
  status: string;
  step_id: string;
  step_index: number;
  is_required: boolean;
  approval_policy: string;
  approval_timeout_ms: number | null;
  attempt: number;
  max_attempts: number;
  compensation_action: string | null;
  compensation_status: string;
  input_payload: Json;
  output_payload: Json | null;
};

function asRecord(value: Json | null | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json>;
}

function getString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getActionInput(inputPayload: Json): unknown {
  return asRecord(inputPayload).action_input ?? null;
}

function toEngineStep(step: WorkflowStepRecord): WorkflowEngineStep {
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
  approvalItemId?: string;
  traceId?: string | null;
  processAfter?: string | null;
}): Promise<void> {
  await enqueueEvent({
    organizationId: input.organizationId,
    eventType: "workflow.step.execute",
    entityType: "workflow_step",
    entityId: input.workflowStepId,
    payload: {
      workflowRunId: input.workflowRunId,
      workflowStepId: input.workflowStepId,
      ...(input.approvalItemId ? { approvalItemId: input.approvalItemId } : {}),
    },
    idempotencyKey: `workflow.step.execute:${input.workflowStepId}`,
    correlationId: input.workflowRunId,
    traceId: input.traceId ?? input.workflowStepId,
    processAfter: input.processAfter ?? null,
    maxAttempts: 3,
  });
}

async function updateRunAfterDecision(input: {
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
}

async function markStepFailed(input: {
  organizationId: string;
  workflowStepId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  await supabase
    .from("workflow_steps")
    .update({
      status: "failed",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.workflowStepId)
    .eq("organization_id", input.organizationId);
}

function buildUpdatedEngineSteps(
  steps: WorkflowStepRecord[],
  currentStepId: string,
  nextStatus: WorkflowEngineStep["status"]
): WorkflowEngineStep[] {
  return steps.map((entry) =>
    entry.id === currentStepId
      ? { ...toEngineStep(entry), status: nextStatus }
      : toEngineStep(entry)
  );
}

export async function processWorkflowStepExecution(
  event: EventRow
): Promise<void> {
  const payload = event.payload as {
    workflowRunId?: string;
    workflowStepId?: string;
    approvalItemId?: string;
  };

  if (!payload.workflowRunId || !payload.workflowStepId) {
    throw new Error("event.workflow.step.execute missing workflowRunId or workflowStepId");
  }

  const supabase = createServiceSupabaseClient();
  const [stepResult, runResult, approvalResult, runStepsResult] = await Promise.all([
    supabase
      .from("workflow_steps")
      .select("id, workflow_run_id, organization_id, provider, action, status, step_id, step_index, is_required, approval_policy, approval_timeout_ms, attempt, max_attempts, compensation_action, compensation_status, input_payload, output_payload")
      .eq("id", payload.workflowStepId)
      .eq("organization_id", event.organization_id)
      .maybeSingle(),
    supabase
      .from("workflow_runs")
      .select("id, organization_id, agent_id, created_by, metadata")
      .eq("id", payload.workflowRunId)
      .eq("organization_id", event.organization_id)
      .maybeSingle(),
    payload.approvalItemId
      ? supabase
          .from("approval_items")
          .select("id, status")
          .eq("id", payload.approvalItemId)
          .eq("organization_id", event.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("workflow_steps")
      .select("id, workflow_run_id, organization_id, provider, action, status, step_id, step_index, is_required, approval_policy, approval_timeout_ms, attempt, max_attempts, compensation_action, compensation_status, input_payload, output_payload")
      .eq("workflow_run_id", payload.workflowRunId)
      .eq("organization_id", event.organization_id)
      .order("step_index", { ascending: true })
      .order("attempt", { ascending: true }),
  ]);

  if (stepResult.error || !stepResult.data) {
    throw new Error(stepResult.error?.message ?? "workflow_step_not_found");
  }

  if (runResult.error || !runResult.data) {
    throw new Error(runResult.error?.message ?? "workflow_run_not_found");
  }

  if (approvalResult.error) {
    throw new Error(approvalResult.error.message);
  }

  if (runStepsResult.error) {
    throw new Error(runStepsResult.error.message);
  }

  const step = stepResult.data as WorkflowStepRecord;
  const run = runResult.data as WorkflowRunRecord;
  const runSteps = (runStepsResult.data ?? []) as WorkflowStepRecord[];

  if (step.workflow_run_id !== run.id) {
    throw new Error("workflow_step_does_not_belong_to_run");
  }

  if (approvalResult.data && approvalResult.data.status !== "approved") {
    return;
  }

  if (step.status === "completed") {
    return;
  }

  const latestLogicalStep = getLatestWorkflowSteps(runSteps.map(toEngineStep)).find(
    (entry) => entry.step_id === step.step_id
  );

  if (latestLogicalStep && latestLogicalStep.id !== step.id) {
    return;
  }

  if (step.status !== "queued" && step.status !== "running" && step.status !== "waiting_approval") {
    return;
  }

  const integrationId = getString(asRecord(run.metadata).integration_id);
  const requestedBy = run.created_by;

  if (!integrationId) {
    const errorCode = "validation_error";
    const errorMessage = "Falta integration_id en el workflow run para ejecutar el step.";
    await markStepFailed({
      organizationId: event.organization_id,
      workflowStepId: step.id,
      errorCode,
      errorMessage,
    });
    await updateRunAfterDecision({
      organizationId: event.organization_id,
      workflowRunId: run.id,
      fallbackCurrentStepId: step.step_id,
      decision: decideRunAfterStepFailure({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "failed"),
        currentStepId: step.id,
        failureReason: "execution_failed",
      }),
      failureCode: errorCode,
      failureMessage: errorMessage,
    });
    throw new Error("workflow_step_missing_integration_id");
  }

  if (!requestedBy) {
    const errorCode = "validation_error";
    const errorMessage = "Falta created_by en el workflow run para ejecutar el step.";
    await markStepFailed({
      organizationId: event.organization_id,
      workflowStepId: step.id,
      errorCode,
      errorMessage,
    });
    await updateRunAfterDecision({
      organizationId: event.organization_id,
      workflowRunId: run.id,
      fallbackCurrentStepId: step.step_id,
      decision: decideRunAfterStepFailure({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "failed"),
        currentStepId: step.id,
        failureReason: "execution_failed",
      }),
      failureCode: errorCode,
      failureMessage: errorMessage,
    });
    throw new Error("workflow_step_missing_created_by");
  }

  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("workflow_steps")
      .update({
        status: "running",
        started_at: now,
        error_code: null,
        error_message: null,
        finished_at: null,
      })
      .eq("id", step.id)
      .eq("organization_id", event.organization_id),
    supabase
      .from("workflow_runs")
      .update({
        status: "running",
        current_step_id: step.step_id,
        failure_code: null,
        failure_message: null,
        last_transition_at: now,
        finished_at: null,
      })
      .eq("id", run.id)
      .eq("organization_id", event.organization_id),
  ]);

  try {
    if (step.provider === "hubspot") {
      const actionInput = executeHubSpotCrmToolSchema.parse(
        getActionInput(step.input_payload)
      );
      const execution = await executeHubSpotToolAction({
        organizationId: event.organization_id,
        userId: requestedBy,
        agentId: run.agent_id,
        integrationId,
        actionInput,
        workflow: {
          workflowRunId: run.id,
          workflowStepId: step.id,
        },
      });

      if (execution.error || !execution.data) {
        throw new Error(execution.error ?? "No se pudo ejecutar la accion de HubSpot.");
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("workflow_steps")
        .update({
          status: "completed",
          provider_request_key: execution.data.requestId,
          output_payload: execution.data as unknown as Json,
          finished_at: finishedAt,
          error_code: null,
          error_message: null,
        })
        .eq("id", step.id)
        .eq("organization_id", event.organization_id);

      const decision = decideRunAfterStepCompletion({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "completed"),
        currentStepId: step.id,
      });

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision,
      });

      if (decision.nextStepToEnqueueId) {
        await queueWorkflowStepExecution({
          organizationId: event.organization_id,
          workflowRunId: run.id,
          workflowStepId: decision.nextStepToEnqueueId,
          traceId: step.id,
        });
      }

      return;
    }

    if (step.provider === "salesforce") {
      const actionInput = executeSalesforceCrmToolSchema.parse(
        getActionInput(step.input_payload)
      );
      const execution = await executeSalesforceToolAction({
        organizationId: event.organization_id,
        userId: requestedBy,
        agentId: run.agent_id,
        integrationId,
        actionInput,
        workflow: {
          workflowRunId: run.id,
          workflowStepId: step.id,
        },
      });

      if (execution.error || !execution.data) {
        throw new Error(execution.error ?? "No se pudo ejecutar la accion de Salesforce.");
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("workflow_steps")
        .update({
          status: "completed",
          provider_request_key: execution.data.requestId,
          output_payload: execution.data as unknown as Json,
          finished_at: finishedAt,
          error_code: null,
          error_message: null,
        })
        .eq("id", step.id)
        .eq("organization_id", event.organization_id);

      const decision = decideRunAfterStepCompletion({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "completed"),
        currentStepId: step.id,
      });

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision,
      });

      if (decision.nextStepToEnqueueId) {
        await queueWorkflowStepExecution({
          organizationId: event.organization_id,
          workflowRunId: run.id,
          workflowStepId: decision.nextStepToEnqueueId,
          traceId: step.id,
        });
      }

      return;
    }

    if (step.provider === "gmail") {
      const runtimeResult = await getGoogleAgentToolRuntimeWithServiceRole(
        run.agent_id,
        event.organization_id,
        "gmail"
      );

      if (runtimeResult.error || !runtimeResult.data) {
        throw new Error(runtimeResult.error ?? "No se pudo cargar la runtime de Gmail.");
      }

      if (!runtimeResult.data.ok) {
        throw new Error(runtimeResult.data.message);
      }

      const usableRuntime = assertGoogleGmailRuntimeUsable(runtimeResult.data);
      if (usableRuntime.error || !usableRuntime.data) {
        throw new Error(usableRuntime.error ?? "Gmail no esta disponible para este step.");
      }

      const actionInput = executeGoogleGmailWriteToolSchema.parse(
        getActionInput(step.input_payload)
      );
      const execution = await executeGoogleGmailWriteToolAction({
        organizationId: event.organization_id,
        userId: requestedBy,
        agentId: run.agent_id,
        runtime: usableRuntime.data,
        actionInput,
        workflow: {
          workflowRunId: run.id,
          workflowStepId: step.id,
        },
      });

      if (execution.error || !execution.data) {
        throw new Error(execution.error ?? "No se pudo ejecutar la accion de Gmail.");
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("workflow_steps")
        .update({
          status: "completed",
          provider_request_key: execution.data.requestId,
          output_payload: execution.data as unknown as Json,
          finished_at: finishedAt,
          error_code: null,
          error_message: null,
        })
        .eq("id", step.id)
        .eq("organization_id", event.organization_id);

      const decision = decideRunAfterStepCompletion({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "completed"),
        currentStepId: step.id,
      });

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision,
      });

      if (decision.nextStepToEnqueueId) {
        await queueWorkflowStepExecution({
          organizationId: event.organization_id,
          workflowRunId: run.id,
          workflowStepId: decision.nextStepToEnqueueId,
          traceId: step.id,
        });
      }

      return;
    }

    if (step.provider === "google_calendar") {
      const runtimeResult = await getGoogleAgentToolRuntimeWithServiceRole(
        run.agent_id,
        event.organization_id,
        "google_calendar"
      );

      if (runtimeResult.error || !runtimeResult.data) {
        throw new Error(
          runtimeResult.error ?? "No se pudo cargar la runtime de Google Calendar."
        );
      }

      if (!runtimeResult.data.ok) {
        throw new Error(runtimeResult.data.message);
      }

      const usableRuntime = assertGoogleCalendarRuntimeUsable(runtimeResult.data);
      if (usableRuntime.error || !usableRuntime.data) {
        throw new Error(
          usableRuntime.error ?? "Google Calendar no esta disponible para este step."
        );
      }

      const actionInput = executeGoogleCalendarWriteToolSchema.parse(
        getActionInput(step.input_payload)
      );
      const execution = await executeGoogleCalendarWriteToolAction({
        organizationId: event.organization_id,
        userId: requestedBy,
        agentId: run.agent_id,
        runtime: usableRuntime.data,
        actionInput,
        workflow: {
          workflowRunId: run.id,
          workflowStepId: step.id,
        },
      });

      if (execution.error || !execution.data) {
        throw new Error(
          execution.error ?? "No se pudo ejecutar la accion de Google Calendar."
        );
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("workflow_steps")
        .update({
          status: "completed",
          provider_request_key: execution.data.requestId,
          output_payload: execution.data as unknown as Json,
          finished_at: finishedAt,
          error_code: null,
          error_message: null,
        })
        .eq("id", step.id)
        .eq("organization_id", event.organization_id);

      const decision = decideRunAfterStepCompletion({
        steps: buildUpdatedEngineSteps(runSteps, step.id, "completed"),
        currentStepId: step.id,
      });

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision,
      });

      if (decision.nextStepToEnqueueId) {
        await queueWorkflowStepExecution({
          organizationId: event.organization_id,
          workflowRunId: run.id,
          workflowStepId: decision.nextStepToEnqueueId,
          traceId: step.id,
        });
      }

      return;
    }

    throw new Error(`Proveedor no soportado todavia para workflow execution: ${step.provider}`);
  } catch (error) {
    const normalized = normalizeWorkflowExecutionError(error);
    console.error("workflow.step.execution_failed", {
      workflowRunId: run.id,
      workflowStepId: step.id,
      provider: step.provider,
      action: step.action,
      errorCode: normalized.code,
      errorMessage: normalized.message,
      retryable: normalized.retryable,
      rawError: error instanceof Error ? error.message : String(error),
    });
    await markStepFailed({
      organizationId: event.organization_id,
      workflowStepId: step.id,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });

    if (shouldRetryWorkflowStep(toEngineStep(step), normalized)) {
      const retryAttempt = step.attempt + 1;
      const retryQueuedAt = new Date().toISOString();
      const retryResult = await supabase
        .from("workflow_steps")
        .insert({
          workflow_run_id: step.workflow_run_id,
          organization_id: step.organization_id,
          step_id: step.step_id,
          step_index: step.step_index,
          provider: step.provider,
          action: step.action,
          status: "queued",
          is_required: step.is_required,
          approval_policy: step.approval_policy,
          approval_timeout_ms: step.approval_timeout_ms,
          attempt: retryAttempt,
          max_attempts: step.max_attempts,
          idempotency_key: buildWorkflowStepIdempotencyKey(
            step.workflow_run_id,
            step.step_id,
            retryAttempt
          ),
          compensation_action: step.compensation_action,
          compensation_status: step.compensation_status,
          input_payload: step.input_payload,
          queued_at: retryQueuedAt,
        })
        .select("id")
        .single();

      if (retryResult.error || !retryResult.data) {
        throw new Error(retryResult.error?.message ?? "No se pudo crear el retry del workflow step.");
      }

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision: {
          runStatus: "queued",
          currentStepId: step.step_id,
          nextStepToEnqueueId: retryResult.data.id,
          markCompensationPendingStepIds: [],
          finished: false,
        },
      });

      await queueWorkflowStepExecution({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        workflowStepId: retryResult.data.id,
        traceId: step.id,
        processAfter: new Date(
          Date.now() + computeWorkflowRetryDelayMs(toEngineStep(step), normalized)
        ).toISOString(),
      });

      return;
    }

    const decision = decideRunAfterStepFailure({
      steps: buildUpdatedEngineSteps(runSteps, step.id, "failed"),
      currentStepId: step.id,
      failureReason: "execution_failed",
    });

    if (decision.markCompensationPendingStepIds.length > 0) {
      const compensation = await executeWorkflowCompensations({
        organizationId: event.organization_id,
        workflowRun: run,
        workflowSteps: runSteps,
        failedStepId: step.id,
      });

      await updateRunAfterDecision({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        fallbackCurrentStepId: step.step_id,
        decision: {
          ...decision,
          runStatus: compensation.manualRepairRequired ? "manual_repair_required" : "failed",
        },
        failureCode: normalized.code,
        failureMessage: normalized.message,
      });

      return;
    }

    await updateRunAfterDecision({
      organizationId: event.organization_id,
      workflowRunId: run.id,
      fallbackCurrentStepId: step.step_id,
      decision,
      failureCode: normalized.code,
      failureMessage: normalized.message,
    });

    if (decision.nextStepToEnqueueId) {
      await queueWorkflowStepExecution({
        organizationId: event.organization_id,
        workflowRunId: run.id,
        workflowStepId: decision.nextStepToEnqueueId,
        traceId: step.id,
      });
    }
  }
}
