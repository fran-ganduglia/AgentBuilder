import type {
  ActionDefinition,
  ActionRegistry,
  EngineStepHandler,
  EngineStepId,
  EngineStepRegistry,
  ExecutedActionTrace,
  PlannedAction,
  PolicyEvaluator,
  RunActionResult,
  RunActionPlanResult,
} from "./types";

export function buildActionRegistryKey(provider: string, type: string): string {
  return `${provider}:${type}`;
}

export function createActionRegistry<TContext, TState>(
  definitions: Array<ActionDefinition<Record<string, unknown>, TContext, TState>> = []
): ActionRegistry<TContext, TState> {
  return new Map(
    definitions.map((definition) => [
      buildActionRegistryKey(definition.provider, definition.type),
      definition,
    ])
  );
}

export function createEngineStepRegistry<TContext, TState>(
  steps: Array<[EngineStepId, EngineStepHandler<TContext, Record<string, unknown>, TState>]> = []
): EngineStepRegistry<TContext, TState> {
  return new Map(steps);
}

export async function runAction<TContext, TState, TResolvedParams = Record<string, unknown>>(input: {
  action: PlannedAction;
  context: TContext;
  initialState: TState;
  actions: ActionRegistry<TContext, TState>;
  engineSteps: EngineStepRegistry<TContext, TState>;
  evaluatePolicy: PolicyEvaluator<TResolvedParams>;
}): Promise<RunActionResult<TResolvedParams, TState>> {
  const definition = input.actions.get(
    buildActionRegistryKey(input.action.provider, input.action.type)
  ) as ActionDefinition<TResolvedParams, TContext, TState> | undefined;

  if (!definition) {
    throw new Error(
      `Missing action definition for ${input.action.provider}:${input.action.type}`
    );
  }

  const resolverResult = await definition.resolve({
    action: input.action,
    context: input.context,
    state: input.initialState,
  });
  const policyDecision = input.evaluatePolicy({
    action: input.action,
    definition,
    resolverResult,
  });

  if (policyDecision !== "execute") {
    if (policyDecision === "enqueue_approval") {
      if (resolverResult.status !== "ok") {
        return {
          status: "policy_blocked",
          policyDecision,
          resolvedParams: resolverResult.resolvedParams,
          definition,
          failure: resolverResult.failure,
        };
      }

      let state = input.initialState;
      const resolvedParams = resolverResult.resolvedParams;

      for (const stepId of definition.steps) {
        const step = input.engineSteps.get(stepId) as
          | EngineStepHandler<TContext, TResolvedParams, TState>
          | undefined;

        if (!step) {
          throw new Error(`Missing engine step handler for ${stepId}`);
        }

        state = await step({
          context: input.context,
          action: input.action,
          definition,
          resolvedParams,
          state,
        });
      }

      return {
        status: "approval_enqueued",
        policyDecision,
        resolvedParams,
        state,
        definition,
      };
    }

    return {
      status: "policy_blocked",
      policyDecision,
      resolvedParams: resolverResult.resolvedParams,
      definition,
      failure: resolverResult.status === "ok" ? undefined : resolverResult.failure,
    };
  }

  if (resolverResult.status !== "ok") {
    throw new Error("Policy allowed execution for a non-ok resolver result.");
  }

  const resolvedParams = resolverResult.resolvedParams;
  let state = input.initialState;

  for (const stepId of definition.steps) {
    const step = input.engineSteps.get(stepId) as
      | EngineStepHandler<TContext, TResolvedParams, TState>
      | undefined;

    if (!step) {
      throw new Error(`Missing engine step handler for ${stepId}`);
    }

    state = await step({
      context: input.context,
      action: input.action,
      definition,
      resolvedParams,
      state,
    });
  }

  return {
    status: "executed",
    policyDecision: "execute",
    resolvedParams,
    state,
    definition,
  };
}

export async function runActionPlan<
  TContext,
  TState,
  TResolvedParams = Record<string, unknown>,
>(input: {
  actions: PlannedAction[];
  context: TContext;
  initialState: TState;
  actionRegistry: ActionRegistry<TContext, TState>;
  engineSteps: EngineStepRegistry<TContext, TState>;
  evaluatePolicy: PolicyEvaluator<TResolvedParams>;
}): Promise<RunActionPlanResult<TResolvedParams, TState>> {
  let state = input.initialState;
  const executedActions: Array<ExecutedActionTrace<TResolvedParams, TState>> = [];

  for (const [index, action] of input.actions.entries()) {
    const result = await runAction<TContext, TState, TResolvedParams>({
      action,
      context: input.context,
      initialState: state,
      actions: input.actionRegistry,
      engineSteps: input.engineSteps,
      evaluatePolicy: input.evaluatePolicy,
    });

    if (result.status === "approval_enqueued") {
      state = result.state;
      executedActions.push({
        action,
        resolvedParams: result.resolvedParams,
        state: result.state,
        definition: result.definition,
      });

      return {
        status: "approval_enqueued",
        policyDecision: "enqueue_approval",
        state,
        executedActions,
        enqueuedAction: action,
        enqueuedActionIndex: index,
        resolvedParams: result.resolvedParams,
        definition: result.definition,
      };
    }

    if (result.status !== "executed") {
      return {
        status: "policy_blocked",
        policyDecision: result.policyDecision,
        state,
        blockedAction: action,
        blockedActionIndex: index,
        executedActions,
        resolvedParams: result.resolvedParams,
        definition: result.definition,
        failure: result.failure,
      };
    }

    state = result.state;
    executedActions.push({
      action,
      resolvedParams: result.resolvedParams,
      state: result.state,
      definition: result.definition,
    });
  }

  return {
    status: "executed",
    policyDecision: "execute",
    state,
    executedActions,
  };
}
