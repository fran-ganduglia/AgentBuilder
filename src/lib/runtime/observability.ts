import type { RuntimeEventV1 } from "./types";

type RuntimeEventLoggerV1 = (
  eventType: RuntimeEventV1["type"],
  payload: Record<string, string | number | null>
) => void;

export type RuntimeUsageMetricsV1 = {
  llmCalls: number;
  tokensInput: number;
  tokensOutput: number;
  provider?: string | null;
  providerRequestId?: string | null;
  approvalItemId?: string | null;
  workflowRunId?: string | null;
};

function applyUsageMetrics(
  event: RuntimeEventV1,
  metrics: RuntimeUsageMetricsV1
): RuntimeEventV1 {
  return {
    ...event,
    llmCalls: metrics.llmCalls,
    tokensInput: metrics.tokensInput,
    tokensOutput: metrics.tokensOutput,
    provider: metrics.provider ?? event.provider,
    providerRequestId: metrics.providerRequestId ?? event.providerRequestId,
    approvalItemId: metrics.approvalItemId ?? event.approvalItemId,
    workflowRunId: metrics.workflowRunId ?? event.workflowRunId,
  };
}

export function enrichRuntimeEvents(input: {
  events: RuntimeEventV1[];
  plannerMetrics?: RuntimeUsageMetricsV1 | null;
  postprocessMetrics?: (RuntimeUsageMetricsV1 & {
    actionId: string;
    status?: "runtime.node.completed" | "runtime.node.failed";
  }) | null;
}): RuntimeEventV1[] {
  const events = input.events.map((event) => ({ ...event }));

  if (input.plannerMetrics) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.type === "runtime.plan.completed" || events[index]?.type === "runtime.plan.failed") {
        events[index] = applyUsageMetrics(events[index], input.plannerMetrics);
        break;
      }
    }
  }

  if (input.postprocessMetrics) {
    const expectedType = input.postprocessMetrics.status ?? "runtime.node.completed";
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const current = events[index];
      if (
        current?.type === expectedType &&
        current.actionId === input.postprocessMetrics.actionId &&
        current.node === "postprocess"
      ) {
        events[index] = applyUsageMetrics(current, input.postprocessMetrics);
        break;
      }
    }
  }

  return events;
}

export function serializeRuntimeEvent(event: RuntimeEventV1): Record<string, string | number | null> {
  return {
    request_id: event.requestId,
    trace_id: event.traceId,
    action_id: event.actionId ?? null,
    action_type: event.actionType ?? null,
    node: event.node ?? null,
    status: event.status ?? null,
    latency_ms: event.latencyMs ?? null,
    llm_calls: event.llmCalls ?? null,
    tokens_input: event.tokensInput ?? null,
    tokens_output: event.tokensOutput ?? null,
    provider: event.provider ?? null,
    provider_request_id: event.providerRequestId ?? null,
    approval_item_id: event.approvalItemId ?? null,
    runtime_run_id: event.runtimeRunId ?? null,
    workflow_run_id: event.workflowRunId ?? null,
    workflow_step_id: event.workflowStepId ?? null,
  };
}

export function logRuntimeEvents(
  events: RuntimeEventV1[],
  logger: RuntimeEventLoggerV1 = (eventType, payload) => {
    console.info(eventType, payload);
  }
): void {
  for (const event of events) {
    logger(event.type, serializeRuntimeEvent(event));
  }
}
