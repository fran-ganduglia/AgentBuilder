export type PlannedParam =
  | {
      kind: "primitive";
      value: string | number | boolean | null;
    }
  | {
      kind: "entity_ref";
      entityType: string;
      value: string;
      label?: string;
    }
  | {
      kind: "temporal_ref";
      value: string;
      granularity?: "datetime" | "date" | "time" | "range";
    }
  | {
      kind: "collection";
      items: PlannedParam[];
    }
  | {
      kind: "generated_text";
      value: string;
    }
  | {
      kind: "unresolved";
      reason?: string;
    };

export type PlannedAction = {
  type: string;
  provider: string;
  params: Record<string, PlannedParam>;
  requiresApprovalHint?: boolean;
};

export type ActionPlan = {
  actions: PlannedAction[];
  plannerConfidence: number;
  missingFields: string[];
  candidateProviders: string[];
};

export type EngineStepId = string;

export type FailureKind =
  | "missing_data"
  | "ambiguous_reference"
  | "low_confidence"
  | "auth"
  | "scope"
  | "approval_required"
  | "budget"
  | "provider_retryable"
  | "provider_fatal";

export type ResolverResult<TResolvedParams = Record<string, unknown>> =
  | {
      status: "ok";
      resolvedParams: TResolvedParams;
    }
  | {
      status: "clarify" | "fallback" | "deny";
      resolvedParams: TResolvedParams | null;
      failure?: FailureKind;
    };

export type PolicyDecision =
  | "execute"
  | "clarify_user"
  | "llm_fallback"
  | "enqueue_approval"
  | "retry_technical"
  | "fail_closed";

export type ActionDefinition<
  TResolvedParams = Record<string, unknown>,
  TContext = unknown,
  TState = unknown,
> = {
  type: string;
  provider: string;
  steps: EngineStepId[];
  resolverSchema: unknown;
  executionMode: "sync" | "approval_async";
  policyKey: string;
  resolve: (input: {
    action: PlannedAction;
    context: TContext;
    state: TState;
  }) => Promise<ResolverResult<TResolvedParams>>;
};

export type EngineStepHandler<TContext, TResolvedParams, TState> = (input: {
  context: TContext;
  action: PlannedAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: ActionDefinition<TResolvedParams, any, any>;
  resolvedParams: TResolvedParams;
  state: TState;
}) => Promise<TState>;

export type PolicyEvaluatorInput<TResolvedParams> = {
  action: PlannedAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: ActionDefinition<TResolvedParams, any, any>;
  resolverResult: ResolverResult<TResolvedParams>;
};

export type PolicyEvaluator<TResolvedParams> = (
  input: PolicyEvaluatorInput<TResolvedParams>
) => PolicyDecision;

export type ActionRegistry<TContext, TState> = Map<
  string,
  ActionDefinition<Record<string, unknown>, TContext, TState>
>;

export type EngineStepRegistry<TContext, TState> = Map<
  EngineStepId,
  EngineStepHandler<TContext, Record<string, unknown>, TState>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunActionResult<TResolvedParams, TState> =
  | {
      status: "executed";
      policyDecision: "execute";
      resolvedParams: TResolvedParams;
      state: TState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: ActionDefinition<TResolvedParams, any, any>;
    }
  | {
      status: "approval_enqueued";
      policyDecision: "enqueue_approval";
      resolvedParams: TResolvedParams;
      state: TState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: ActionDefinition<TResolvedParams, any, any>;
    }
  | {
      status: "policy_blocked";
      policyDecision: Exclude<PolicyDecision, "execute">;
      resolvedParams: TResolvedParams | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: ActionDefinition<TResolvedParams, any, any>;
      failure?: FailureKind;
    };

export type ExecutedActionTrace<TResolvedParams, TState> = {
  action: PlannedAction;
  resolvedParams: TResolvedParams;
  state: TState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: ActionDefinition<TResolvedParams, any, any>;
};

export type RunActionPlanResult<TResolvedParams, TState> =
  | {
      status: "executed";
      policyDecision: "execute";
      state: TState;
      executedActions: Array<ExecutedActionTrace<TResolvedParams, TState>>;
    }
  | {
      status: "approval_enqueued";
      policyDecision: "enqueue_approval";
      state: TState;
      executedActions: Array<ExecutedActionTrace<TResolvedParams, TState>>;
      enqueuedAction: PlannedAction;
      enqueuedActionIndex: number;
      resolvedParams: TResolvedParams;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: ActionDefinition<TResolvedParams, any, any>;
    }
  | {
      status: "policy_blocked";
      policyDecision: Exclude<PolicyDecision, "execute">;
      state: TState;
      blockedAction: PlannedAction;
      blockedActionIndex: number;
      executedActions: Array<ExecutedActionTrace<TResolvedParams, TState>>;
      resolvedParams: TResolvedParams | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: ActionDefinition<TResolvedParams, any, any>;
      failure?: FailureKind;
    };
