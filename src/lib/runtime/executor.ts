import "server-only";

import { insertAuditLog } from "@/lib/db/audit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getWorkflowActionMatrixEntry } from "@/lib/workflows/action-matrix";
import type { Json } from "@/types/database";

import type {
  ExecutionContextV1,
  ExecutionOutcomeV1,
  NodeResultV1,
  RuntimeActionV1,
  RuntimeNodeHandlerV1,
  SimulationResultV1,
} from "./types";
import {
  createAdapterRegistryV1,
  type AdapterRegistryV1,
  type RuntimeApprovalEnqueuerV1,
} from "./adapters/registry";
import { selectAdapter } from "./adapters/selector";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeApprovalRecordV1 = {
  approvalItemId: string;
  workflowRunId: string;
  workflowStepId: string;
  idempotencyKey: string;
  expiresAt: string;
};

function asJsonRecord(value: Record<string, unknown>): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Record<string, Json>;
}

function addTimeoutMs(value: number): string {
  return new Date(Date.now() + value).toISOString();
}

async function getExistingApprovalByIdempotencyKey(input: {
  organizationId: string;
  idempotencyKey: string;
}): Promise<DbResult<RuntimeApprovalRecordV1>> {
  const supabase = createServiceSupabaseClient();
  const { data: workflowStep, error: workflowStepError } = await supabase
    .from("workflow_steps")
    .select("id, workflow_run_id")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (workflowStepError) {
    return { data: null, error: workflowStepError.message };
  }

  if (!workflowStep) {
    return { data: null, error: null };
  }

  const { data: approvalItem, error: approvalError } = await supabase
    .from("approval_items")
    .select("id, expires_at")
    .eq("organization_id", input.organizationId)
    .eq("workflow_step_id", workflowStep.id)
    .maybeSingle();

  if (approvalError) {
    return { data: null, error: approvalError.message };
  }

  if (!approvalItem) {
    return {
      data: null,
      error: "Se encontro el workflow step idempotente pero falta el approval item asociado.",
    };
  }

  return {
    data: {
      approvalItemId: approvalItem.id,
      workflowRunId: workflowStep.workflow_run_id,
      workflowStepId: workflowStep.id,
      idempotencyKey: input.idempotencyKey,
      expiresAt: approvalItem.expires_at,
    },
    error: null,
  };
}

export async function enqueueRuntimeApproval(input: {
  ctx: ExecutionContextV1;
  provider: "gmail" | "google_calendar" | "google_sheets" | "salesforce";
  action: string;
  integrationId: string;
  toolName: string;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  runtimeAction: RuntimeActionV1;
}): Promise<DbResult<RuntimeApprovalRecordV1>> {
  const existing = await getExistingApprovalByIdempotencyKey({
    organizationId: input.ctx.organizationId,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing.error || existing.data) {
    return existing;
  }

  const supabase = createServiceSupabaseClient();
  const actionPolicy = getWorkflowActionMatrixEntry(input.provider, input.action);
  const workflowStepKey = `${input.provider}:${input.action}:approval`;
  const now = new Date().toISOString();
  const expiresAt = addTimeoutMs(actionPolicy.approvalTimeoutMs);

  const { data: workflowRun, error: workflowRunError } = await supabase
    .from("workflow_runs")
    .insert({
      organization_id: input.ctx.organizationId,
      agent_id: input.ctx.agentId,
      conversation_id: input.ctx.conversationId,
      created_by: input.ctx.userId ?? null,
      trigger_source: "chat",
      trigger_event_type: `${input.provider}.${input.action}.approval_requested`,
      automation_preset: "assisted",
      status: "waiting_approval",
      current_step_id: workflowStepKey,
      started_at: now,
      last_transition_at: now,
      metadata: {
        approval_source: "runtime_v1",
        integration_id: input.integrationId,
        tool_name: input.toolName,
        runtime_run_id: input.ctx.runtimeRunId ?? null,
        runtime_action: input.action,
        runtime_action_type: input.runtimeAction.type,
        runtime_action_id: input.runtimeAction.id,
        runtime_trace_id: input.ctx.traceId,
        idempotency_key: input.idempotencyKey,
        runtime_execution_trace: {
          runtimeRunId: input.ctx.runtimeRunId ?? null,
          traceId: input.ctx.traceId,
          requestId: input.ctx.requestId,
          actionId: input.runtimeAction.id,
          actionType: input.runtimeAction.type,
          provider: input.provider,
          approvalItemId: null,
          workflowRunId: null,
          workflowStepId: null,
          status: "waiting_approval",
          events: [
            {
              at: now,
              event: "approval_enqueued",
              status: "waiting_approval",
              provider: input.provider,
            },
          ],
        },
      },
    })
    .select("id")
    .single();

  if (workflowRunError || !workflowRun) {
    return {
      data: null,
      error: workflowRunError?.message ?? "No se pudo crear el workflow run del runtime.",
    };
  }

  const { data: workflowStep, error: workflowStepError } = await supabase
    .from("workflow_steps")
    .insert({
      workflow_run_id: workflowRun.id,
      organization_id: input.ctx.organizationId,
      step_id: workflowStepKey,
      step_index: 1,
      provider: input.provider,
      action: input.action,
      status: "waiting_approval",
      is_required: true,
      approval_policy: "required",
      approval_timeout_ms: actionPolicy.approvalTimeoutMs,
      attempt: 1,
      max_attempts: 5,
      idempotency_key: input.idempotencyKey,
      compensation_action:
        input.provider === "google_calendar" && input.action === "create_event"
          ? "cancel_created_event"
          : null,
      compensation_status:
        input.provider === "google_calendar" && input.action === "create_event"
          ? "pending"
          : "not_required",
      input_payload: asJsonRecord({
        action_input: input.payload,
        abstract_action: input.runtimeAction as unknown as Record<string, unknown>,
        runtime_trace_id: input.ctx.traceId,
        runtime_request_id: input.ctx.requestId,
      }),
      queued_at: now,
      started_at: now,
    })
    .select("id")
    .single();

  if (workflowStepError || !workflowStep) {
    if (workflowStepError?.message.toLowerCase().includes("idempotency_key")) {
      await supabase
        .from("workflow_runs")
        .delete()
        .eq("id", workflowRun.id)
        .eq("organization_id", input.ctx.organizationId);

      return getExistingApprovalByIdempotencyKey({
        organizationId: input.ctx.organizationId,
        idempotencyKey: input.idempotencyKey,
      });
    }

    return {
      data: null,
      error: workflowStepError?.message ?? "No se pudo crear el workflow step del runtime.",
    };
  }

  const { data: approvalItem, error: approvalError } = await supabase
    .from("approval_items")
    .insert({
      organization_id: input.ctx.organizationId,
      workflow_run_id: workflowRun.id,
      workflow_step_id: workflowStep.id,
      agent_id: input.ctx.agentId,
      requested_by: input.ctx.userId ?? null,
      provider: input.provider,
      action: input.action,
      status: "pending",
      risk_level: actionPolicy.riskLevel,
      summary: input.summary,
      payload_summary: asJsonRecord(input.payload),
      context: asJsonRecord({
        conversation_id: input.ctx.conversationId,
        tool_name: input.toolName,
        runtime_trace_id: input.ctx.traceId,
        runtime_run_id: input.ctx.runtimeRunId ?? null,
        runtime_message_id: input.ctx.messageId,
      }),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (approvalError || !approvalItem) {
    return {
      data: null,
      error: approvalError?.message ?? "No se pudo crear el approval item del runtime.",
    };
  }

  await insertAuditLog({
    organizationId: input.ctx.organizationId,
    userId: input.ctx.userId ?? null,
    action: `runtime.${input.action}.approval_enqueued`,
    resourceType: "approval_item",
    resourceId: approvalItem.id,
    newValue: {
      workflow_run_id: workflowRun.id,
      workflow_step_id: workflowStep.id,
      provider: input.provider,
      idempotency_key: input.idempotencyKey,
    },
  });

  await supabase
    .from("workflow_runs")
    .update({
      metadata: {
        ...(((
          await supabase
            .from("workflow_runs")
            .select("metadata")
            .eq("id", workflowRun.id)
            .eq("organization_id", input.ctx.organizationId)
            .maybeSingle()
        ).data?.metadata as Record<string, Json> | null) ?? {}),
        runtime_execution_trace: {
          runtimeRunId: input.ctx.runtimeRunId ?? null,
          traceId: input.ctx.traceId,
          requestId: input.ctx.requestId,
          actionId: input.runtimeAction.id,
          actionType: input.runtimeAction.type,
          provider: input.provider,
          approvalItemId: approvalItem.id,
          workflowRunId: workflowRun.id,
          workflowStepId: workflowStep.id,
          status: "waiting_approval",
          events: [
            {
              at: now,
              event: "approval_enqueued",
              status: "waiting_approval",
              provider: input.provider,
              approvalItemId: approvalItem.id,
              workflowRunId: workflowRun.id,
              workflowStepId: workflowStep.id,
            },
          ],
        } as Json,
      },
    })
    .eq("id", workflowRun.id)
    .eq("organization_id", input.ctx.organizationId);

  return {
    data: {
      approvalItemId: approvalItem.id,
      workflowRunId: workflowRun.id,
      workflowStepId: workflowStep.id,
      idempotencyKey: input.idempotencyKey,
      expiresAt,
    },
    error: null,
  };
}

function createDefaultRegistry(): AdapterRegistryV1 {
  return createAdapterRegistryV1({
    enqueueApproval: enqueueRuntimeApproval as RuntimeApprovalEnqueuerV1,
  });
}

export async function simulateAction(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  registry?: AdapterRegistryV1;
}): Promise<SimulationResultV1> {
  const registry = input.registry ?? createDefaultRegistry();
  const adapter = selectAdapter({
    ctx: input.ctx,
    action: input.action,
    registry,
  });

  return adapter.simulate({
    ctx: input.ctx,
    action: input.action,
  });
}

export async function executeAction(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  registry?: AdapterRegistryV1;
}): Promise<ExecutionOutcomeV1> {
  const registry = input.registry ?? createDefaultRegistry();
  const adapter = selectAdapter({
    ctx: input.ctx,
    action: input.action,
    registry,
  });

  return adapter.execute({
    ctx: input.ctx,
    action: input.action,
  });
}

function mapAdapterError(
  adapter: AdapterRegistryV1["adapters"][string],
  ctx: ExecutionContextV1,
  action: RuntimeActionV1,
  error: unknown
): NodeResultV1 {
  const normalized = adapter.normalizeError({
    error,
    ctx,
    action,
  });
  return {
    status: normalized.status,
    reason: normalized.reason,
    retryAfterMs: normalized.retryAfterMs,
    provider: normalized.provider,
    providerRequestId: normalized.providerRequestId,
    output: {
      errorCode: normalized.code,
    },
  };
}

export function createSimulateNodeHandlerV1(input?: {
  registry?: AdapterRegistryV1;
}): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }) => {
    const registry = input?.registry ?? createDefaultRegistry();

    try {
      const simulation = await simulateAction({
        ctx,
        action,
        registry,
      });

      return {
        status: "success",
        actionPatch: {
          metadata: {
            ...(action.metadata ?? {}),
            simulation,
          },
        },
        contextPatch: {
          messageMetadata: {
            ...ctx.messageMetadata,
            runtime_simulation: simulation,
          },
        },
        provider: simulation.provider,
        output: simulation.preview,
      };
    } catch (error) {
      const adapter =
        Object.values(registry.adapters).find((candidate) =>
          candidate.supports({
            ctx,
            action,
          })
        ) ?? registry.adapters[Object.keys(registry.adapters)[0]];
      return adapter
        ? mapAdapterError(adapter, ctx, action, error)
        : {
            status: "failed",
            reason: error instanceof Error ? error.message : "runtime_adapter_failed",
          };
    }
  };
}

export function createExecuteNodeHandlerV1(input?: {
  registry?: AdapterRegistryV1;
}): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }) => {
    const registry = input?.registry ?? createDefaultRegistry();

    try {
      const execution = await executeAction({
        ctx,
        action,
        registry,
      });

      return {
        status: "success",
        reason: execution.summary,
        actionPatch: {
          metadata: {
            ...(action.metadata ?? {}),
            execution,
          },
        },
        contextPatch: {
          messageMetadata: {
            ...ctx.messageMetadata,
            runtime_execution: execution.output,
          },
        },
        provider: execution.provider,
        providerRequestId: execution.providerRequestId,
        approvalItemId: execution.approvalItemId,
      workflowRunId: execution.workflowRunId,
      workflowStepId: execution.workflowStepId,
      output: execution.output,
    };
  } catch (error) {
      const adapter =
        Object.values(registry.adapters).find((candidate) =>
          candidate.supports({
            ctx,
            action,
          })
        ) ?? registry.adapters[Object.keys(registry.adapters)[0]];
      return adapter
        ? mapAdapterError(adapter, ctx, action, error)
        : {
            status: "failed",
            reason: error instanceof Error ? error.message : "runtime_adapter_failed",
          };
    }
  };
}
