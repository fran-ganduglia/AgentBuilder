import { estimateLlmCostUsd } from "@/lib/engine/observability";
import { getActionDefinitionV1 } from "./action-catalog";
import { estimateRuntimeActionCostUsd } from "./pricing";
import type {
  ActionExecutionOutcomeV1,
  ExecutionContextV1,
  RuntimeActionPlan,
  RuntimeEventV1,
  RuntimeUsageEventV1,
} from "./types";

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function isExecutedOutcome(status: ActionExecutionOutcomeV1["status"]): boolean {
  return status === "success" || status === "completed_with_degradation";
}

function buildBaseUsageEvent(input: {
  ctx: Pick<ExecutionContextV1, "organizationId" | "agentId" | "surface">;
  runtimeRunId: string;
  usageKind: RuntimeUsageEventV1["usageKind"];
  occurredAt: string;
  actionType?: RuntimeUsageEventV1["actionType"];
  provider?: RuntimeUsageEventV1["provider"];
  quantity?: number;
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCostUsd?: number;
  approvalItemId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  providerRequestId?: string;
  metadata?: Record<string, unknown>;
}): RuntimeUsageEventV1 {
  return {
    organizationId: input.ctx.organizationId,
    agentId: input.ctx.agentId,
    runtimeRunId: input.runtimeRunId,
    actionType: input.actionType,
    provider: input.provider ?? null,
    usageKind: input.usageKind,
    quantity: input.quantity ?? 1,
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    estimatedCostUsd: roundUsd(input.estimatedCostUsd ?? 0),
    occurredAt: input.occurredAt,
    surface: input.ctx.surface ?? null,
    approvalItemId: input.approvalItemId,
    workflowRunId: input.workflowRunId,
    workflowStepId: input.workflowStepId,
    providerRequestId: input.providerRequestId,
    metadata: input.metadata,
  };
}

export function buildRuntimeUsageEvents(input: {
  ctx: Pick<ExecutionContextV1, "organizationId" | "agentId" | "surface">;
  runtimeRunId: string;
  actionPlan: RuntimeActionPlan;
  actionOutcomes: ActionExecutionOutcomeV1[];
  traceEvents: RuntimeEventV1[];
  plannerUsage?: {
    model?: string | null;
    provider?: string | null;
    tokensInput: number;
    tokensOutput: number;
  } | null;
  postprocessUsage?: {
    actionId?: string;
    model?: string | null;
    provider?: string | null;
    tokensInput: number;
    tokensOutput: number;
  } | null;
  occurredAt?: string;
}): RuntimeUsageEventV1[] {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const usageEvents: RuntimeUsageEventV1[] = [];
  const actionOutcomeById = new Map(
    input.actionOutcomes.map((outcome) => [outcome.actionId, outcome])
  );

  if (input.plannerUsage && (input.plannerUsage.tokensInput > 0 || input.plannerUsage.tokensOutput > 0)) {
    usageEvents.push(
      buildBaseUsageEvent({
        ctx: input.ctx,
        runtimeRunId: input.runtimeRunId,
        usageKind: "llm_planner_call",
        provider: input.plannerUsage.provider ?? null,
        tokensInput: input.plannerUsage.tokensInput,
        tokensOutput: input.plannerUsage.tokensOutput,
        estimatedCostUsd: estimateLlmCostUsd(
          input.plannerUsage.tokensInput,
          input.plannerUsage.tokensOutput
        ),
        occurredAt,
        metadata: {
          model: input.plannerUsage.model ?? null,
          actionPlanVersion: input.actionPlan.version,
        },
      })
    );
  }

  if (
    input.postprocessUsage &&
    (input.postprocessUsage.tokensInput > 0 || input.postprocessUsage.tokensOutput > 0)
  ) {
    const actionType = input.postprocessUsage.actionId
      ? actionOutcomeById.get(input.postprocessUsage.actionId)?.actionType
      : undefined;
    usageEvents.push(
      buildBaseUsageEvent({
        ctx: input.ctx,
        runtimeRunId: input.runtimeRunId,
        usageKind: "llm_postprocess_call",
        actionType,
        provider: input.postprocessUsage.provider ?? null,
        tokensInput: input.postprocessUsage.tokensInput,
        tokensOutput: input.postprocessUsage.tokensOutput,
        estimatedCostUsd: estimateLlmCostUsd(
          input.postprocessUsage.tokensInput,
          input.postprocessUsage.tokensOutput
        ),
        occurredAt,
        metadata: {
          model: input.postprocessUsage.model ?? null,
          actionId: input.postprocessUsage.actionId ?? null,
        },
      })
    );
  }

  for (const event of input.traceEvents) {
    if (
      event.node !== "llm_repair" ||
      (event.type !== "runtime.node.completed" && event.type !== "runtime.node.failed")
    ) {
      continue;
    }

    usageEvents.push(
      buildBaseUsageEvent({
        ctx: input.ctx,
        runtimeRunId: input.runtimeRunId,
        usageKind: "llm_repair_call",
        actionType: event.actionType,
        provider: event.provider ?? null,
        tokensInput: event.tokensInput ?? 0,
        tokensOutput: event.tokensOutput ?? 0,
        estimatedCostUsd: estimateLlmCostUsd(event.tokensInput ?? 0, event.tokensOutput ?? 0),
        occurredAt,
        metadata: {
          actionId: event.actionId ?? null,
          reason: event.reason ?? null,
          status: event.status ?? null,
        },
      })
    );
  }

  for (const outcome of input.actionOutcomes) {
    if (isExecutedOutcome(outcome.status)) {
      usageEvents.push(
        buildBaseUsageEvent({
          ctx: input.ctx,
          runtimeRunId: input.runtimeRunId,
          usageKind: "action_executed",
          actionType: outcome.actionType,
          quantity: 1,
          estimatedCostUsd: estimateRuntimeActionCostUsd(outcome.actionType),
          occurredAt,
          metadata: {
            actionId: outcome.actionId,
            status: outcome.status,
          },
        })
      );

      const sideEffectKind = getActionDefinitionV1(outcome.actionType).sideEffectKind;
      if (sideEffectKind !== "read") {
        usageEvents.push(
          buildBaseUsageEvent({
            ctx: input.ctx,
            runtimeRunId: input.runtimeRunId,
            usageKind: "side_effect_write",
            actionType: outcome.actionType,
            quantity: 1,
            occurredAt,
            approvalItemId:
              typeof outcome.output?.approvalItemId === "string"
                ? outcome.output.approvalItemId
                : undefined,
            workflowRunId:
              typeof outcome.output?.workflowRunId === "string"
                ? outcome.output.workflowRunId
                : undefined,
            workflowStepId:
              typeof outcome.output?.workflowStepId === "string"
                ? outcome.output.workflowStepId
                : undefined,
            metadata: {
              actionId: outcome.actionId,
              sideEffectKind,
              status: outcome.status,
            },
          })
        );
      }
    }

    if (outcome.status === "waiting_approval") {
      usageEvents.push(
        buildBaseUsageEvent({
          ctx: input.ctx,
          runtimeRunId: input.runtimeRunId,
          usageKind: "approval_enqueued",
          actionType: outcome.actionType,
          quantity: 1,
          occurredAt,
          approvalItemId:
            typeof outcome.output?.approvalItemId === "string"
              ? outcome.output.approvalItemId
              : undefined,
          workflowRunId:
            typeof outcome.output?.workflowRunId === "string"
              ? outcome.output.workflowRunId
              : undefined,
          workflowStepId:
            typeof outcome.output?.workflowStepId === "string"
              ? outcome.output.workflowStepId
              : undefined,
          metadata: {
            actionId: outcome.actionId,
            status: outcome.status,
          },
        })
      );
    }
  }

  const providerCallKeys = new Set<string>();
  for (const event of input.traceEvents) {
    if (!event.providerRequestId || !event.actionId) {
      continue;
    }

    const key = `${event.actionId}:${event.providerRequestId}`;
    if (providerCallKeys.has(key)) {
      continue;
    }

    providerCallKeys.add(key);
    usageEvents.push(
      buildBaseUsageEvent({
        ctx: input.ctx,
        runtimeRunId: input.runtimeRunId,
        usageKind: "provider_call",
        actionType: event.actionType,
        provider: event.provider ?? null,
        quantity: 1,
        occurredAt,
        approvalItemId: event.approvalItemId,
        workflowRunId: event.workflowRunId,
        workflowStepId: event.workflowStepId,
        providerRequestId: event.providerRequestId,
        metadata: {
          actionId: event.actionId,
          node: event.node ?? null,
          status: event.status ?? null,
        },
      })
    );
  }

  const runtimeRunCostUsd = usageEvents.reduce(
    (sum, event) => sum + event.estimatedCostUsd,
    0
  );
  const runtimeRunTokensInput = usageEvents.reduce(
    (sum, event) =>
      event.usageKind === "llm_planner_call" ||
      event.usageKind === "llm_repair_call" ||
      event.usageKind === "llm_postprocess_call"
        ? sum + event.tokensInput
        : sum,
    0
  );
  const runtimeRunTokensOutput = usageEvents.reduce(
    (sum, event) =>
      event.usageKind === "llm_planner_call" ||
      event.usageKind === "llm_repair_call" ||
      event.usageKind === "llm_postprocess_call"
        ? sum + event.tokensOutput
        : sum,
    0
  );

  usageEvents.push(
    buildBaseUsageEvent({
      ctx: input.ctx,
      runtimeRunId: input.runtimeRunId,
      usageKind: "runtime_run",
      quantity: 1,
      tokensInput: runtimeRunTokensInput,
      tokensOutput: runtimeRunTokensOutput,
      estimatedCostUsd: runtimeRunCostUsd,
      occurredAt,
      metadata: {
        actionCount: input.actionPlan.actions.length,
        executedActionCount: input.actionOutcomes.filter((outcome) => isExecutedOutcome(outcome.status)).length,
        approvalsEnqueued: input.actionOutcomes.filter((outcome) => outcome.status === "waiting_approval").length,
      },
    })
  );

  return usageEvents;
}
