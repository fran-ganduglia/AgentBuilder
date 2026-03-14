import "server-only";

import { insertApprovalItem } from "@/lib/db/approval-items";
import { insertWorkflowRun } from "@/lib/db/workflow-runs";
import { insertWorkflowStep } from "@/lib/db/workflow-steps";
import { getWorkflowActionMatrixEntry } from "@/lib/workflows/action-matrix";
import type { Json } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };
type JsonRecord = Record<string, Json | undefined>;

export type ApprovalRequestRecord = {
  approvalItemId: string;
  workflowRunId: string;
  workflowStepId: string;
  expiresAt: string;
};

export type CreateApprovalRequestInput = {
  organizationId: string;
  agentId: string;
  conversationId: string;
  userId: string;
  provider: string;
  action: string;
  integrationId: string;
  toolName: string;
  summary: string;
  payloadSummary: JsonRecord;
  context?: JsonRecord;
  workflowTemplateId?: string | null;
  automationPreset?: "copilot" | "assisted" | "autonomous" | null;
};

function compactJsonRecord(record?: JsonRecord): Record<string, Json> {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined)
  ) as Record<string, Json>;
}

function addTimeoutMs(value: number): string {
  return new Date(Date.now() + value).toISOString();
}

function inferCompensationAction(
  provider: string,
  action: string
): string | null {
  if (provider === "hubspot" && action === "create_contact") {
    return "archive_created_contact";
  }

  if (provider === "hubspot" && action === "create_task") {
    return "archive_created_task";
  }

  if (provider === "salesforce" && action === "create_contact") {
    return "delete_created_contact";
  }

  if (provider === "salesforce" && action === "create_task") {
    return "delete_created_task";
  }

  if (provider === "google_calendar" && action === "create_event") {
    return "cancel_created_event";
  }

  return null;
}

export async function createApprovalRequest(
  input: CreateApprovalRequestInput
): Promise<DbResult<ApprovalRequestRecord>> {
  const actionPolicy = getWorkflowActionMatrixEntry(input.provider, input.action);
  const workflowStepKey = `${input.provider}:${input.action}:approval`;
  const compensationAction = inferCompensationAction(input.provider, input.action);
  const now = new Date().toISOString();
  const expiresAt = addTimeoutMs(actionPolicy.approvalTimeoutMs);

  const workflowRunResult = await insertWorkflowRun({
    organization_id: input.organizationId,
    agent_id: input.agentId,
    conversation_id: input.conversationId,
    created_by: input.userId,
    trigger_source: "chat",
    trigger_event_type: `${input.provider}.${input.action}.approval_requested`,
    workflow_template_id: input.workflowTemplateId ?? null,
    automation_preset: input.automationPreset ?? "assisted",
    status: "waiting_approval",
    current_step_id: workflowStepKey,
    started_at: now,
    last_transition_at: now,
    metadata: compactJsonRecord({
      approval_source: "chat",
      integration_id: input.integrationId,
      tool_name: input.toolName,
    }),
  });

  if (workflowRunResult.error || !workflowRunResult.data) {
    return { data: null, error: workflowRunResult.error ?? "No se pudo crear el workflow run." };
  }

  const workflowStepResult = await insertWorkflowStep({
    workflow_run_id: workflowRunResult.data.id,
    organization_id: input.organizationId,
    step_id: workflowStepKey,
    step_index: 1,
    provider: input.provider,
    action: input.action,
    status: "waiting_approval",
    is_required: true,
    approval_policy: "required",
    approval_timeout_ms: actionPolicy.approvalTimeoutMs,
    attempt: 1,
    max_attempts: 3,
    idempotency_key: `${workflowRunResult.data.id}:${workflowStepKey}:1`,
    compensation_action: compensationAction,
    compensation_status: compensationAction ? "pending" : "not_required",
    input_payload: compactJsonRecord(input.payloadSummary),
    queued_at: now,
    started_at: now,
  });

  if (workflowStepResult.error || !workflowStepResult.data) {
    return { data: null, error: workflowStepResult.error ?? "No se pudo crear el workflow step." };
  }

  const approvalItemResult = await insertApprovalItem({
    organization_id: input.organizationId,
    workflow_run_id: workflowRunResult.data.id,
    workflow_step_id: workflowStepResult.data.id,
    agent_id: input.agentId,
    requested_by: input.userId,
    provider: input.provider,
    action: input.action,
    status: "pending",
    risk_level: actionPolicy.riskLevel,
    summary: input.summary,
    payload_summary: compactJsonRecord(input.payloadSummary),
    context: compactJsonRecord({
      conversation_id: input.conversationId,
      integration_id: input.integrationId,
      tool_name: input.toolName,
      ...input.context,
    }),
    expires_at: expiresAt,
  });

  if (approvalItemResult.error || !approvalItemResult.data) {
    return { data: null, error: approvalItemResult.error ?? "No se pudo crear el approval item." };
  }

  return {
    data: {
      approvalItemId: approvalItemResult.data.id,
      workflowRunId: workflowRunResult.data.id,
      workflowStepId: workflowStepResult.data.id,
      expiresAt,
    },
    error: null,
  };
}
