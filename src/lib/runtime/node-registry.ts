import type { AdapterRegistryV1 } from "./adapters/registry";
import {
  createExecuteNodeHandlerV1,
  createSimulateNodeHandlerV1,
} from "./executor";
import { createValidateNodeHandlerV1 } from "./policy-engine";
import {
  createResolveNodeHandlerV1,
  type RuntimeResolverEngineDepsV1,
  type RuntimeResolverRegistryV1,
} from "./resolver-engine";
import type {
  ExecutionContextV1,
  NodeResultV1,
  RuntimeActionV1,
  RuntimeNodeHandlerInputV1,
  RuntimeNodeHandlerV1,
  RuntimeNodeRegistryV1,
  RuntimePolicyContextV1,
} from "./types";

type RuntimePolicySnapshotV1 = {
  status?: "success" | "needs_llm" | "needs_user" | "blocked";
  decision?:
    | "execute"
    | "ask_user"
    | "use_llm"
    | "enqueue_approval"
    | "queue_for_async"
    | "retry"
    | "degrade_to_partial"
    | "block";
  reason?: string;
  requiresApproval?: boolean;
};

function appendMessageMetadata(
  ctx: ExecutionContextV1,
  patch: Record<string, unknown>
): Pick<NodeResultV1, "contextPatch"> {
  return {
    contextPatch: {
      messageMetadata: {
        ...ctx.messageMetadata,
        ...patch,
      },
    },
  };
}

function readPolicySnapshot(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
}): RuntimePolicySnapshotV1 | null {
  const actionPolicy = input.action.metadata?.policy;
  if (actionPolicy && typeof actionPolicy === "object") {
    return actionPolicy as RuntimePolicySnapshotV1;
  }

  const messagePolicy = input.ctx.messageMetadata.runtime_policy;
  if (messagePolicy && typeof messagePolicy === "object") {
    return messagePolicy as RuntimePolicySnapshotV1;
  }

  return null;
}

function buildClarificationQuestion(input: {
  reason?: string;
  candidates?: unknown[];
}): string {
  const reason = input.reason;
  const candidateCount = input.candidates?.length ?? 0;

  if (!reason) {
    return "Necesito una aclaracion concreta para continuar con esta accion.";
  }

  if (reason.includes("thread")) {
    if (candidateCount > 1) {
      return `Encontre ${candidateCount} hilos recientes. ¿Cual queres usar?`;
    }

    return "Necesito que me indiques exactamente que hilo quieres usar.";
  }

  if (reason.includes("event")) {
    if (candidateCount > 1) {
      return `Encontre ${candidateCount} eventos recientes. ¿Cual queres usar?`;
    }

    return "Necesito que me indiques exactamente que evento quieres usar.";
  }

  if (reason.includes("recipient") || reason.includes("to")) {
    if (candidateCount > 1) {
      return `Encontre ${candidateCount} contactos. ¿Cual queres usar?`;
    }

    return "Necesito el email exacto del destinatario para continuar.";
  }

  if (reason.includes("start") || reason.includes("end") || reason.includes("time")) {
    return "Necesito una fecha y horario claros para continuar.";
  }

  if (reason.includes("title") || reason.includes("subject")) {
    return "Necesito que me confirmes el titulo o asunto exacto antes de seguir.";
  }

  return "Necesito un dato mas especifico para continuar con esta accion.";
}

function classifyError(input: RuntimeNodeHandlerInputV1): {
  status: NodeResultV1["status"];
  classification: string;
  reason: string;
} {
  const reason = input.sourceReason ?? "runtime_error";
  const normalizedReason = reason.toLowerCase();

  if (input.sourceNode === "postprocess" && input.sourceStatus === "failed") {
    return {
      status: "completed_with_degradation",
      classification: "postprocess_degraded",
      reason,
    };
  }

  if (
    normalizedReason.includes("auth") ||
    normalizedReason.includes("scope") ||
    normalizedReason.includes("inactive") ||
    normalizedReason.includes("plan_")
  ) {
    return {
      status: "blocked",
      classification: "policy_or_auth_block",
      reason,
    };
  }

  if (input.sourceStatus === "retry") {
    return {
      status: "retry",
      classification: "retryable",
      reason,
    };
  }

  if (input.sourceStatus === "blocked") {
    return {
      status: "blocked",
      classification: "blocked",
      reason,
    };
  }

  return {
    status: input.sourceStatus ?? "failed",
    classification: "fatal",
    reason,
  };
}

export function createNoopNodeHandlerV1(): RuntimeNodeHandlerV1 {
  return async () => ({ status: "success" });
}

export function createPolicyGateNodeHandlerV1(): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }) => {
    const policy = readPolicySnapshot({ ctx, action });
    if (!policy?.status) {
      return {
        status: "blocked",
        reason: "missing_policy_snapshot",
        policyDecision: {
          outcome: "block",
          reason: "missing_policy_snapshot",
        },
      };
    }

    if (policy.status === "needs_user") {
      return {
        status: "needs_user",
        reason: policy.reason ?? "policy_requires_user",
        policyDecision: {
          outcome: policy.decision ?? "ask_user",
          reason: policy.reason ?? "policy_requires_user",
        },
        output: policy as Record<string, unknown>,
      };
    }

    if (policy.status === "needs_llm") {
      return {
        status: "needs_llm",
        reason: policy.reason ?? "policy_requires_llm",
        policyDecision: {
          outcome: policy.decision ?? "use_llm",
          reason: policy.reason ?? "policy_requires_llm",
        },
        output: policy as Record<string, unknown>,
      };
    }

    if (policy.status === "blocked") {
      return {
        status: "blocked",
        reason: policy.reason ?? "policy_blocked_action",
        policyDecision: {
          outcome: policy.decision ?? "block",
          reason: policy.reason ?? "policy_blocked_action",
        },
        output: policy as Record<string, unknown>,
      };
    }

    return {
      status: "success",
      reason: policy.reason ?? (policy.requiresApproval ? "approval_required" : "ready_to_execute"),
      policyDecision: {
        outcome: policy.decision ?? (policy.requiresApproval ? "enqueue_approval" : "execute"),
        reason: policy.reason ?? (policy.requiresApproval ? "approval_required" : "ready_to_execute"),
      },
      output: policy as Record<string, unknown>,
    };
  };
}

export function createPostprocessNodeHandlerV1(): RuntimeNodeHandlerV1 {
  return async ({ ctx, action }) => ({
    status: "success",
    ...appendMessageMetadata(ctx, {
      runtime_postprocess: {
        actionId: action.id,
        actionType: action.type,
        capturedAt: new Date().toISOString(),
      },
    }),
  });
}

export function createUserClarificationNodeHandlerV1(): RuntimeNodeHandlerV1 {
  return async (input) => {
    const candidates = Array.isArray(input.sourceOutput?.candidates)
      ? input.sourceOutput?.candidates
      : [];
    const question = buildClarificationQuestion({
      reason: input.sourceReason,
      candidates,
    });

    return {
      status: "needs_user",
      reason: input.sourceReason ?? "clarification_required",
      ...appendMessageMetadata(input.ctx, {
        runtime_user_clarification: {
          actionId: input.action.id,
          sourceNode: input.sourceNode ?? input.node,
          reason: input.sourceReason ?? null,
          question,
          candidates,
        },
      }),
      output: {
        question,
        candidates,
      },
    };
  };
}

export function createErrorHandlerNodeHandlerV1(): RuntimeNodeHandlerV1 {
  return async (input) => {
    const classification = classifyError(input);

    return {
      status: classification.status,
      reason: classification.reason,
      ...appendMessageMetadata(input.ctx, {
        runtime_error_handler: {
          actionId: input.action.id,
          sourceNode: input.sourceNode ?? input.node,
          sourceStatus: input.sourceStatus ?? null,
          classification: classification.classification,
          reason: classification.reason,
        },
      }),
      executionOutcome: classification.status === "completed_with_degradation"
        ? {
            outcome: "degraded",
            reason: classification.reason,
          }
        : undefined,
      policyDecision: classification.status === "retry"
        ? {
            outcome: "retry",
            reason: classification.reason,
          }
        : classification.status === "blocked"
          ? {
              outcome: "block",
              reason: classification.reason,
            }
          : undefined,
      output: {
        classification: classification.classification,
        sourceNode: input.sourceNode ?? input.node,
        sourceStatus: input.sourceStatus ?? null,
      },
    };
  };
}

export function createRuntimeNodeRegistryV1(input?: {
  resolverRegistry?: RuntimeResolverRegistryV1;
  resolverDeps?: RuntimeResolverEngineDepsV1;
  getPolicyContext?: (payload: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    resolution: {
      resolvedFields: string[];
      missingFields: string[];
      llmFields: string[];
      blockedFields: string[];
      ambiguousFields: string[];
    };
  }) => Promise<RuntimePolicyContextV1 | undefined> | RuntimePolicyContextV1 | undefined;
  adapterRegistry?: AdapterRegistryV1;
  llmRepair?: RuntimeNodeHandlerV1;
  overrides?: Partial<RuntimeNodeRegistryV1>;
}): RuntimeNodeRegistryV1 {
  return {
    normalize: createNoopNodeHandlerV1(),
    enrich: createNoopNodeHandlerV1(),
    resolve: createResolveNodeHandlerV1({
      registry: input?.resolverRegistry,
      deps: input?.resolverDeps,
    }),
    validate: createValidateNodeHandlerV1({
      getPolicyContext: input?.getPolicyContext,
    }),
    policy_gate: createPolicyGateNodeHandlerV1(),
    simulate: createSimulateNodeHandlerV1({
      registry: input?.adapterRegistry,
    }),
    execute: createExecuteNodeHandlerV1({
      registry: input?.adapterRegistry,
    }),
    postprocess: createPostprocessNodeHandlerV1(),
    llm_repair: input?.llmRepair ?? createUserClarificationNodeHandlerV1(),
    user_clarification: createUserClarificationNodeHandlerV1(),
    error_handler: createErrorHandlerNodeHandlerV1(),
    ...(input?.overrides ?? {}),
  };
}
