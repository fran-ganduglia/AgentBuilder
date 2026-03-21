import type { Json } from "@/types/database";
import type { RuntimeActionType } from "./types";

export type RuntimeMigrationMessageRecordV1 = {
  createdAt: string;
  metadata: Json | null;
};

export type RuntimeCapabilityMigrationSnapshotV1 = {
  actionType: RuntimeActionType;
  runtimePrimaryCount: number;
  successCount: number;
  needsUserCount: number;
  blockedCount: number;
  failedCount: number;
  waitingApprovalCount: number;
  runtimeSuccessCount: number;
  runtimeNonSuccessCount: number;
  runtimeSuccessRate: number | null;
  runtimeObservability: RuntimeObservabilityCountersV1;
  status: "runtime_active" | "runtime_attention_needed" | "no_recent_runtime_traffic";
  recommendation: "healthy" | "stabilize_runtime";
  blockers: string[];
};

export type RuntimeObservabilityCountersV1 = {
  plannerEmptyCount: number;
  runtimeClarificationCount: number;
  runtimeFailureCount: number;
  unsupportedActionCount: number;
};

export type RuntimeOutcomeCountsV1 = {
  runtimePrimaryCount: number;
  successCount: number;
  needsUserCount: number;
  blockedCount: number;
  failedCount: number;
  waitingApprovalCount: number;
};

export type RuntimeMigrationSnapshotV1 = {
  windowHours: number;
  assistantMessagesConsidered: number;
  runtimePrimaryCount: number;
  runtimeCoverageRate: number | null;
  runtimeSuccessRate: number | null;
  runtimeOutcomeCounts: RuntimeOutcomeCountsV1;
  runtimeObservability: RuntimeObservabilityCountersV1;
  capabilities: RuntimeCapabilityMigrationSnapshotV1[];
  manualChecksPending: string[];
};

type JsonRecord = Record<string, Json>;

function asRecord(value: Json | null | undefined): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asActionType(value: Json | undefined): RuntimeActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value) {
    case "search_email":
    case "summarize_thread":
    case "send_email":
    case "create_event":
    case "archive_thread":
    case "apply_label":
    case "reschedule_event":
    case "cancel_event":
    case "list_events":
    case "read_sheet_range":
    case "append_sheet_rows":
    case "update_sheet_range":
    case "search_records":
    case "create_lead":
    case "update_lead":
    case "create_task":
      return value;
    default:
      return null;
  }
}

function getRuntimeActionTypes(metadata: Json | null): RuntimeActionType[] {
  const metadataRecord = asRecord(metadata);
  const runtimeRecord = asRecord(metadataRecord?.runtime ?? null);
  const actionPlanRecord = asRecord(runtimeRecord?.actionPlan ?? null);
  const actions = actionPlanRecord?.actions;
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((action) => asActionType(asRecord(action as Json)?.type))
    .filter((actionType): actionType is RuntimeActionType => actionType !== null);
}

function getRoutingDecision(metadata: Json | null): "runtime_primary" | null {
  const metadataRecord = asRecord(metadata);
  const runtimeRecord = asRecord(metadataRecord?.runtime ?? null);
  const decision = runtimeRecord?.routingDecision;
  if (decision === "runtime_primary") {
    return decision;
  }

  return null;
}

function getRuntimeOutcome(metadata: Json | null): string | null {
  const metadataRecord = asRecord(metadata);
  const runtimeRecord = asRecord(metadataRecord?.runtime ?? null);
  return typeof runtimeRecord?.outcome === "string" ? runtimeRecord.outcome : null;
}

function getRuntimeObservabilityCounters(metadata: Json | null): RuntimeObservabilityCountersV1 {
  const metadataRecord = asRecord(metadata);
  const runtimeObservabilityRecord = asRecord(metadataRecord?.runtime_observability ?? null);

  const getCount = (key: keyof RuntimeObservabilityCountersV1): number => {
    const value = runtimeObservabilityRecord?.[
      key === "plannerEmptyCount"
        ? "planner_empty_count"
        : key === "runtimeClarificationCount"
          ? "runtime_clarification_count"
          : key === "runtimeFailureCount"
            ? "runtime_failure_count"
            : "unsupported_action_count"
    ];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    plannerEmptyCount: getCount("plannerEmptyCount"),
    runtimeClarificationCount: getCount("runtimeClarificationCount"),
    runtimeFailureCount: getCount("runtimeFailureCount"),
    unsupportedActionCount: getCount("unsupportedActionCount"),
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function buildRuntimeMigrationSnapshot(input: {
  messages: RuntimeMigrationMessageRecordV1[];
  windowHours: number;
}): RuntimeMigrationSnapshotV1 {
  const capabilityMap = new Map<
    RuntimeActionType,
    Omit<RuntimeCapabilityMigrationSnapshotV1, "runtimeSuccessRate" | "status" | "recommendation" | "blockers">
  >();
  let runtimePrimaryCount = 0;
  let runtimePrimarySuccessCount = 0;
  const runtimeOutcomeCounts: RuntimeOutcomeCountsV1 = {
    runtimePrimaryCount: 0,
    successCount: 0,
    needsUserCount: 0,
    blockedCount: 0,
    failedCount: 0,
    waitingApprovalCount: 0,
  };
  const runtimeObservability: RuntimeObservabilityCountersV1 = {
    plannerEmptyCount: 0,
    runtimeClarificationCount: 0,
    runtimeFailureCount: 0,
    unsupportedActionCount: 0,
  };

  for (const message of input.messages) {
    const routingDecision = getRoutingDecision(message.metadata);
    const runtimeOutcome = getRuntimeOutcome(message.metadata);
    const actionTypes = getRuntimeActionTypes(message.metadata);
    const messageRuntimeObservability = getRuntimeObservabilityCounters(message.metadata);

    if (routingDecision === "runtime_primary") {
      runtimePrimaryCount += 1;
      runtimeOutcomeCounts.runtimePrimaryCount += 1;
      if (runtimeOutcome === "success" || runtimeOutcome === "completed_with_degradation") {
        runtimePrimarySuccessCount += 1;
        runtimeOutcomeCounts.successCount += 1;
      } else if (runtimeOutcome === "needs_user") {
        runtimeOutcomeCounts.needsUserCount += 1;
      } else if (runtimeOutcome === "blocked") {
        runtimeOutcomeCounts.blockedCount += 1;
      } else if (runtimeOutcome === "failed") {
        runtimeOutcomeCounts.failedCount += 1;
      } else if (runtimeOutcome === "waiting_approval") {
        runtimeOutcomeCounts.waitingApprovalCount += 1;
      }
      runtimeObservability.plannerEmptyCount += messageRuntimeObservability.plannerEmptyCount;
      runtimeObservability.runtimeClarificationCount +=
        messageRuntimeObservability.runtimeClarificationCount;
      runtimeObservability.runtimeFailureCount += messageRuntimeObservability.runtimeFailureCount;
      runtimeObservability.unsupportedActionCount +=
        messageRuntimeObservability.unsupportedActionCount;
    } else {
      continue;
    }

    for (const actionType of actionTypes) {
      const current = capabilityMap.get(actionType) ?? {
        actionType,
        runtimePrimaryCount: 0,
        successCount: 0,
        needsUserCount: 0,
        blockedCount: 0,
        failedCount: 0,
        waitingApprovalCount: 0,
        runtimeSuccessCount: 0,
        runtimeNonSuccessCount: 0,
        runtimeObservability: {
          plannerEmptyCount: 0,
          runtimeClarificationCount: 0,
          runtimeFailureCount: 0,
          unsupportedActionCount: 0,
        },
      };

      if (routingDecision === "runtime_primary") {
        current.runtimePrimaryCount += 1;
        if (runtimeOutcome === "success" || runtimeOutcome === "completed_with_degradation") {
          current.runtimeSuccessCount += 1;
          current.successCount += 1;
        } else if (runtimeOutcome === "needs_user") {
          current.needsUserCount += 1;
          current.runtimeNonSuccessCount += 1;
        } else if (runtimeOutcome === "blocked") {
          current.blockedCount += 1;
          current.runtimeNonSuccessCount += 1;
        } else if (runtimeOutcome === "failed") {
          current.failedCount += 1;
          current.runtimeNonSuccessCount += 1;
        } else if (runtimeOutcome === "waiting_approval") {
          current.waitingApprovalCount += 1;
          current.runtimeNonSuccessCount += 1;
        } else {
          current.runtimeNonSuccessCount += 1;
        }
        current.runtimeObservability.plannerEmptyCount += messageRuntimeObservability.plannerEmptyCount;
        current.runtimeObservability.runtimeClarificationCount +=
          messageRuntimeObservability.runtimeClarificationCount;
        current.runtimeObservability.runtimeFailureCount +=
          messageRuntimeObservability.runtimeFailureCount;
        current.runtimeObservability.unsupportedActionCount +=
          messageRuntimeObservability.unsupportedActionCount;
      }

      capabilityMap.set(actionType, current);
    }
  }

  const assistantMessagesConsidered = runtimePrimaryCount;
  const capabilities = [...capabilityMap.values()]
    .map((capability): RuntimeCapabilityMigrationSnapshotV1 => {
      const runtimeAttempts =
        capability.runtimeSuccessCount + capability.runtimeNonSuccessCount;
      const runtimeSuccessRate =
        runtimeAttempts > 0 ? round(capability.runtimeSuccessCount / runtimeAttempts) : null;
      const status =
        capability.runtimePrimaryCount === 0
          ? "no_recent_runtime_traffic"
          : runtimeSuccessRate !== null && runtimeSuccessRate >= 0.95
            ? "runtime_active"
            : "runtime_attention_needed";
      const blockers: string[] = [];

      if (capability.runtimePrimaryCount === 0) {
        blockers.push("Sin trafico reciente en runtime para esta capability.");
      }
      if (runtimeSuccessRate !== null && runtimeSuccessRate < 0.95) {
        blockers.push("El success rate reciente del runtime sigue por debajo del umbral operativo.");
      }
      if (runtimeAttempts > 0 && runtimeAttempts < 3) {
        blockers.push("La muestra reciente del runtime todavia es chica para confiar en su cobertura.");
      }

      return {
        ...capability,
        runtimeSuccessRate,
        status,
        recommendation: blockers.length === 0 ? "healthy" : "stabilize_runtime",
        blockers,
      };
    })
    .sort((left, right) => left.actionType.localeCompare(right.actionType));

  return {
    windowHours: input.windowHours,
    assistantMessagesConsidered,
    runtimePrimaryCount,
    runtimeCoverageRate:
      assistantMessagesConsidered > 0
        ? round(runtimePrimaryCount / assistantMessagesConsidered)
        : null,
    runtimeSuccessRate:
      runtimePrimaryCount > 0
        ? round(runtimePrimarySuccessCount / runtimePrimaryCount)
        : null,
    runtimeOutcomeCounts,
    runtimeObservability,
    capabilities,
    manualChecksPending: [
      "Confirmar paridad funcional y QA operativa fuera de la muestra automatica.",
      "Verificar trazabilidad y runbooks antes de expandir mas acciones en runtime.",
    ],
  };
}
