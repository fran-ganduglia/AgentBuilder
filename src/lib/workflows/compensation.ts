import "server-only";

import {
  assertGoogleCalendarRuntimeUsable,
  executeGoogleCalendarCompensationAction,
  type GoogleCalendarCompensationAction,
} from "@/lib/integrations/google-calendar-agent-runtime";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type { SalesforceCompensationAction } from "@/lib/integrations/salesforce-agent-runtime";
import { executeSalesforceCompensationAction } from "@/lib/integrations/salesforce-agent-runtime";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  getLatestWorkflowSteps,
  type WorkflowEngineStep,
} from "@/lib/workflows/execution-engine";
import type { Json } from "@/types/database";

type WorkflowRunCompensationRecord = {
  id: string;
  organization_id: string;
  agent_id: string;
  created_by: string | null;
  metadata: Json;
};

type WorkflowStepCompensationRecord = {
  id: string;
  workflow_run_id: string;
  organization_id: string;
  provider: string;
  action: string;
  status: string;
  step_id: string;
  step_index: number;
  is_required: boolean;
  attempt: number;
  max_attempts: number;
  compensation_action: string | null;
  compensation_status: string;
  output_payload: Json | null;
};

type CompensationTrace = {
  action: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  providerRequestKey: string | null;
  result?: Record<string, Json>;
  error?: {
    code: string;
    message: string;
  };
};

export type WorkflowCompensationSummary = {
  allSucceeded: boolean;
  manualRepairRequired: boolean;
  attemptedStepIds: string[];
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

function toEngineStep(step: WorkflowStepCompensationRecord): WorkflowEngineStep {
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

function getCompensationCandidates(
  steps: WorkflowStepCompensationRecord[],
  currentStepId: string
): WorkflowStepCompensationRecord[] {
  const currentStep = getLatestWorkflowSteps(steps.map(toEngineStep)).find(
    (step) => step.id === currentStepId
  );

  if (!currentStep) {
    return [];
  }

  const latestById = new Map(
    getLatestWorkflowSteps(steps.map(toEngineStep)).map((step) => [step.id, step])
  );

  return steps
    .filter((step) => {
      const latest = latestById.get(step.id);
      return (
        latest &&
        step.id === latest.id &&
        step.step_index < currentStep.step_index &&
        step.status === "completed"
      );
    })
    .sort((left, right) => right.step_index - left.step_index);
}

function buildTrace(
  input: Omit<CompensationTrace, "providerRequestKey"> & {
    providerRequestKey?: string | null;
  }
): Record<string, Json> {
  return {
    action: input.action,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    providerRequestKey: input.providerRequestKey ?? null,
    ...(input.result ? { result: input.result as Json } : {}),
    ...(input.error ? { error: input.error as Json } : {}),
  };
}

function isSalesforceCompensationAction(
  value: string | null
): value is SalesforceCompensationAction {
  return (
    value === "delete_created_contact" || value === "delete_created_task"
  );
}

function isGoogleCalendarCompensationAction(
  value: string | null
): value is GoogleCalendarCompensationAction {
  return value === "cancel_created_event";
}

async function persistCompensationTrace(input: {
  organizationId: string;
  stepId: string;
  status: "completed" | "failed" | "manual_repair_required";
  previousOutputPayload: Json | null;
  trace: Record<string, Json>;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const outputPayload = {
    ...asRecord(input.previousOutputPayload),
    compensation: input.trace,
  };

  await supabase
    .from("workflow_steps")
    .update({
      compensation_status: input.status,
      output_payload: outputPayload as Json,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.stepId)
    .eq("organization_id", input.organizationId);
}

export async function executeWorkflowCompensations(input: {
  organizationId: string;
  workflowRun: WorkflowRunCompensationRecord;
  workflowSteps: WorkflowStepCompensationRecord[];
  failedStepId: string;
}): Promise<WorkflowCompensationSummary> {
  const integrationId = getString(asRecord(input.workflowRun.metadata).integration_id);
  const requestedBy = input.workflowRun.created_by;
  const candidates = getCompensationCandidates(input.workflowSteps, input.failedStepId);
  const attemptedStepIds: string[] = [];

  if (!integrationId || !requestedBy) {
    return {
      allSucceeded: false,
      manualRepairRequired: true,
      attemptedStepIds,
    };
  }

  let manualRepairRequired = false;

  for (const step of candidates) {
    if (!step.compensation_action) {
      manualRepairRequired = true;
      continue;
    }

    attemptedStepIds.push(step.id);
    const startedAt = new Date().toISOString();

    try {
      const executionPayload = asRecord(step.output_payload);
      const providerObjectId = getString(executionPayload.providerObjectId);

      if (!providerObjectId) {
        throw new Error("Falta providerObjectId para compensar el step.");
      }

      if (step.provider === "salesforce") {
        if (!isSalesforceCompensationAction(step.compensation_action)) {
          throw new Error("Compensacion de Salesforce no soportada para este step.");
        }

        const compensation = await executeSalesforceCompensationAction({
          organizationId: input.organizationId,
          userId: requestedBy,
          agentId: input.workflowRun.agent_id,
          integrationId,
          compensationAction: step.compensation_action,
          providerObjectId,
          workflow: {
            workflowRunId: input.workflowRun.id,
            workflowStepId: step.id,
          },
        });

        if (compensation.error || !compensation.data) {
          throw new Error(compensation.error ?? "No se pudo compensar el step de Salesforce.");
        }

        await persistCompensationTrace({
          organizationId: input.organizationId,
          stepId: step.id,
          status: "completed",
          previousOutputPayload: step.output_payload,
          trace: buildTrace({
            action: step.compensation_action,
            status: "completed",
            startedAt,
            finishedAt: new Date().toISOString(),
            providerRequestKey: compensation.data.requestId,
            result: compensation.data as unknown as Record<string, Json>,
          }),
        });

        continue;
      }

      if (step.provider === "google_calendar") {
        if (!isGoogleCalendarCompensationAction(step.compensation_action)) {
          throw new Error("Compensacion de Google Calendar no soportada para este step.");
        }

        const runtimeResult = await getGoogleAgentToolRuntimeWithServiceRole(
          input.workflowRun.agent_id,
          input.organizationId,
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
            usableRuntime.error ?? "Google Calendar no esta disponible para compensar."
          );
        }

        const compensation = await executeGoogleCalendarCompensationAction({
          organizationId: input.organizationId,
          userId: requestedBy,
          agentId: input.workflowRun.agent_id,
          runtime: usableRuntime.data,
          compensationAction: step.compensation_action,
          providerObjectId,
          workflow: {
            workflowRunId: input.workflowRun.id,
            workflowStepId: step.id,
          },
        });

        if (compensation.error || !compensation.data) {
          throw new Error(compensation.error ?? "No se pudo compensar el step de Google Calendar.");
        }

        await persistCompensationTrace({
          organizationId: input.organizationId,
          stepId: step.id,
          status: "completed",
          previousOutputPayload: step.output_payload,
          trace: buildTrace({
            action: step.compensation_action,
            status: "completed",
            startedAt,
            finishedAt: new Date().toISOString(),
            providerRequestKey: compensation.data.requestId,
            result: compensation.data as unknown as Record<string, Json>,
          }),
        });

        continue;
      }

      throw new Error(`Proveedor sin compensacion soportada: ${step.provider}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error desconocido al compensar el step.";
      manualRepairRequired = true;

      await persistCompensationTrace({
        organizationId: input.organizationId,
        stepId: step.id,
        status: "failed",
        previousOutputPayload: step.output_payload,
        trace: buildTrace({
          action: step.compensation_action,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          error: {
            code: "compensation_failed",
            message: errorMessage,
          },
        }),
        errorCode: "compensation_failed",
        errorMessage,
      });
    }
  }

  const allPreviousCompletedSteps = getCompensationCandidates(
    input.workflowSteps,
    input.failedStepId
  );
  const hasUncompensableCompletedStep = allPreviousCompletedSteps.some(
    (step) => !step.compensation_action
  );

  return {
    allSucceeded:
      !manualRepairRequired &&
      !hasUncompensableCompletedStep &&
      attemptedStepIds.length ===
        allPreviousCompletedSteps.filter((step) => Boolean(step.compensation_action)).length,
    manualRepairRequired: manualRepairRequired || hasUncompensableCompletedStep,
    attemptedStepIds,
  };
}
