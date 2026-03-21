export const RUNTIME_ACTION_TYPES = [
  "search_email",
  "summarize_thread",
  "send_email",
  "create_draft_email",
  "create_draft_reply",
  "send_reply",
  "archive_thread",
  "apply_label",
  "create_event",
  "reschedule_event",
  "cancel_event",
  "list_events",
  "check_availability",
  "read_sheet_range",
  "append_sheet_rows",
  "update_sheet_range",
  "list_sheets",
  "find_rows",
  "append_records",
  "get_headers",
  "preview_sheet",
  "clear_range",
  "create_spreadsheet",
  "search_records",
  "create_lead",
  "update_lead",
  "create_task",
] as const;

export const RUNTIME_GRAPH_NODES = [
  "normalize",
  "enrich",
  "resolve",
  "validate",
  "policy_gate",
  "simulate",
  "execute",
  "postprocess",
] as const;

export const RUNTIME_AUXILIARY_NODES = [
  "llm_repair",
  "user_clarification",
  "error_handler",
] as const;

export const RUNTIME_NODE_STATUSES = [
  "success",
  "retry",
  "needs_llm",
  "needs_user",
  "failed",
  "blocked",
  "waiting_approval",
  "waiting_async_execution",
  "completed_with_degradation",
] as const;

export const RUNTIME_USAGE_KINDS = [
  "runtime_run",
  "action_executed",
  "approval_enqueued",
  "llm_planner_call",
  "llm_repair_call",
  "llm_postprocess_call",
  "provider_call",
  "side_effect_write",
] as const;

export type RuntimeActionType = (typeof RUNTIME_ACTION_TYPES)[number];
export type RuntimeGraphNodeId = (typeof RUNTIME_GRAPH_NODES)[number];
export type RuntimeAuxiliaryNodeId = (typeof RUNTIME_AUXILIARY_NODES)[number];
export type RuntimeNodeId = RuntimeGraphNodeId | RuntimeAuxiliaryNodeId;
export type RuntimeNodeStatus = (typeof RUNTIME_NODE_STATUSES)[number];
export type RuntimeUsageKindV1 = (typeof RUNTIME_USAGE_KINDS)[number];

export type PrimitiveParamValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<string | number | boolean | null>;

export type ParamValueV1 =
  | {
      kind: "primitive";
      value: PrimitiveParamValue;
    }
  | {
      kind: "entity";
      entityType: string;
      value: string;
      label?: string;
      identifiers?: Record<string, string>;
    }
  | {
      kind: "reference";
      refType: string;
      value: string;
      label?: string;
    }
  | {
      kind: "time";
      value: string;
      timezone?: string;
      granularity?: "datetime" | "date" | "time" | "range";
    }
  | {
      kind: "computed";
      value: Record<string, unknown> | ReadonlyArray<unknown> | PrimitiveParamValue;
      source: string;
    }
  | {
      kind: "unknown";
      reason?: string;
    };

export type RuntimeApprovalMode = "auto" | "required";
export type RuntimeSideEffectKindV1 = "read" | "write" | "destructive";
export type RuntimeProviderV1 =
  | "gmail"
  | "google_calendar"
  | "google_sheets"
  | "salesforce";
export type RuntimeAdapterCapabilityV1 =
  | "email"
  | "calendar"
  | "sheets"
  | "crm";
export type RuntimePolicyDecisionOutcomeV1 =
  | "execute"
  | "ask_user"
  | "use_llm"
  | "enqueue_approval"
  | "queue_for_async"
  | "retry"
  | "degrade_to_partial"
  | "block";

export type RuntimeUsageEventV1 = {
  organizationId: string;
  agentId: string;
  runtimeRunId: string;
  actionType?: RuntimeActionType;
  provider?: string | null;
  usageKind: RuntimeUsageKindV1;
  quantity: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  occurredAt: string;
  surface?: RuntimeSurfaceV1 | null;
  approvalItemId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  providerRequestId?: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeSurfaceV1 =
  | "chat_web"
  | "api_run"
  | "automation"
  | "worker"
  | "approval_continuation"
  | "webhook";

export type RuntimeRiskLevelV1 = "low" | "medium" | "high";

export type RuntimeActionV1 = {
  id: string;
  type: RuntimeActionType;
  params: Record<string, ParamValueV1>;
  approvalMode: RuntimeApprovalMode;
  metadata?: Record<string, unknown>;
};

export type ActionOutputMappingV3 = {
  outputPath: string;
  toParamKey: string;
  required?: boolean;
  valueType?: ParamValueV1["kind"];
  refType?: string;
  entityType?: string;
  labelPath?: string;
  timezone?: string;
  granularity?: "datetime" | "date" | "time" | "range";
};

export type ActionDependencyV3 = {
  fromActionId: string;
  toActionId: string;
  outputMapping: ActionOutputMappingV3[];
};

export type ActionPlanV1 = {
  version: 1;
  intent: string;
  actions: RuntimeActionV1[];
  confidence: number;
  missingFields: string[];
};

export type RuntimeExecutionModeV3 = "sync" | "async_preferred";

export type ActionPlanV3 = {
  version: 3;
  intent: string;
  actions: RuntimeActionV1[];
  edges: ActionDependencyV3[];
  entryActionIds: string[];
  executionMode: RuntimeExecutionModeV3;
  confidence: number;
  missingFields: string[];
  triggerContext?: Record<string, unknown>;
};

export type RuntimeActionPlan = ActionPlanV1 | ActionPlanV3;

export type RuntimeExecutionStateSnapshotV3 = {
  completedActionIds: string[];
  actionOutputsByActionId: Record<string, Record<string, unknown>>;
  executionOrder: string[];
};

export type RuntimeResumeReasonV1 =
  | "resume_after_approval"
  | "resume_after_retry_delay"
  | "resume_after_user_input"
  | "resume_scheduled_trigger"
  | "resume_post_side_effect";

export type RuntimeResumeTargetV1 = {
  kind: "workflow_step_execute";
  workflowRunId: string;
  workflowStepId: string;
  approvalItemId?: string;
};

export type RuntimeResumeTokenV1 = {
  version: 1;
  runtimeRunId: string;
  resumeReason: RuntimeResumeReasonV1;
  checkpointNode: RuntimeGraphNodeId;
  actionId?: string;
  actionType?: RuntimeActionType;
  target: RuntimeResumeTargetV1;
  requestedAt: string;
  requestedBy?: string;
  sourceEventId?: string;
};

export type ExecutionCheckpointV1 = {
  planVersion: RuntimeActionPlan["version"];
  actionId: string;
  actionIndex: number;
  node: RuntimeNodeId;
  status: Exclude<RuntimeNodeStatus, "success" | "needs_llm">;
  resumeFrom: RuntimeGraphNodeId;
  reason?: string;
  createdAt: string;
  retries: number;
  llmRepairCalls: number;
  nodeVisitCounts: Partial<Record<RuntimeNodeId, number>>;
  errorFingerprint?: string;
  actionSnapshot: RuntimeActionV1;
  contextSnapshot: Pick<
    ExecutionContextV1,
    "budget" | "conversationMetadata" | "messageMetadata" | "timezone"
  >;
  executionStateSnapshot?: RuntimeExecutionStateSnapshotV3;
};

export type RuntimeBudgetV1 = {
  plannerCallsMax: number;
  plannerCallsUsed: number;
  llmRepairCallsMaxPerAction: number;
  llmRepairCallsMaxPerRequest?: number;
  llmRepairCallsUsedInRequest?: number;
  syncRetriesMaxPerAction: number;
  maxNodeVisitsPerAction?: number;
  maxRetriesPerNode?: number;
  maxActionsPerPlan?: number;
  repeatedErrorFingerprintLimit?: number;
  destructiveActionsMaxPerRequest?: number;
  destructiveActionsUsedInRequest?: number;
};

export type ExecutionContextV1 = {
  runtimeRunId?: string;
  requestId: string;
  traceId: string;
  organizationId: string;
  agentId: string;
  conversationId: string;
  userId?: string;
  messageId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  surface?: RuntimeSurfaceV1;
  channel?: "web" | "whatsapp" | "email" | "api";
  timezone?: string | null;
  conversationMetadata: Record<string, unknown>;
  messageMetadata: Record<string, unknown>;
  budget: RuntimeBudgetV1;
};

export type RuntimeEventV1 = {
  type:
    | "runtime.plan.started"
    | "runtime.plan.completed"
    | "runtime.plan.failed"
    | "runtime.resume.enqueued"
    | "runtime.resume.dispatched"
    | "runtime.node.started"
    | "runtime.node.completed"
    | "runtime.node.failed"
    | "runtime.action.completed"
    | "runtime.action.approval_enqueued"
    | "runtime.action.blocked";
  requestId: string;
  traceId: string;
  runtimeRunId?: string;
  actionId?: string;
  actionType?: RuntimeActionType;
  node?: RuntimeNodeId;
  status?: RuntimeNodeStatus | "completed";
  latencyMs?: number;
  llmCalls?: number;
  tokensInput?: number;
  tokensOutput?: number;
  provider?: string;
  providerRequestId?: string;
  approvalItemId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  reason?: string;
};

export type NodeResultV1 = {
  status: RuntimeNodeStatus;
  contextPatch?: Partial<ExecutionContextV1>;
  actionPatch?: Partial<RuntimeActionV1>;
  reason?: string;
  retryAfterMs?: number;
  output?: Record<string, unknown>;
  provider?: string;
  providerRequestId?: string;
  approvalItemId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  events?: RuntimeEventV1[];
  policyDecision?: {
    outcome: RuntimePolicyDecisionOutcomeV1;
    reason?: string;
  };
  executionOutcome?: {
    outcome:
      | "executed"
      | "approval_enqueued"
      | "async_execution_enqueued"
      | "degraded"
      | "skipped";
    reason?: string;
  };
};

export type ResolverSourceV1 =
  | "explicit_turn"
  | "conversation_context"
  | "local_metadata"
  | "integration_read"
  | "deterministic_transform"
  | "llm_repair";

export type ResolverResultV1 = {
  paramKey: string;
  status: Exclude<RuntimeNodeStatus, "retry">;
  resolutionStatus?: "resolved" | "ambiguous" | "missing" | "blocked";
  resolvedParam?: ParamValueV1;
  reason?: string;
  source?: ResolverSourceV1;
  output?: Record<string, unknown>;
};

export type RuntimeResolutionSummaryV1 = {
  resolvedFields: string[];
  missingFields: string[];
  llmFields: string[];
  blockedFields: string[];
  ambiguousFields: string[];
};

export type RuntimePolicyContextV1 = {
  hasAuth?: boolean;
  organizationActive?: boolean;
  agentActive?: boolean;
  integrationActive?: boolean;
  requiredScopesPresent?: boolean;
  actionAllowedByPlan?: boolean;
  actionAllowedByAgent?: boolean;
  actionAllowedByOrganization?: boolean;
  actionSupported?: boolean;
  surfaceAllowed?: boolean;
  channelAllowed?: boolean;
  providerAllowed?: boolean;
  integrationAllowed?: boolean;
  approvalRequiredByPolicy?: boolean;
  riskLevel?: RuntimeRiskLevelV1;
  planName?: string | null;
  surface?: RuntimeSurfaceV1;
  channel?: ExecutionContextV1["channel"];
  provider?: RuntimeProviderV1 | null;
  activeConcurrentRunsForOrganization?: number;
  maxConcurrentRunsForOrganization?: number | null;
  activeConcurrentRunsForAgent?: number;
  maxConcurrentRunsForAgent?: number | null;
  activeRunsForSurface?: number;
  maxRunsForSurface?: number | null;
  dailySideEffectsUsed?: number;
  maxDailySideEffects?: number | null;
  monthlySideEffectsUsed?: number;
  maxMonthlySideEffects?: number | null;
  providerBudgetDecision?: "allow" | "queue" | "throttle" | "reject";
  estimatedRunCostUsd?: number | null;
  maxEstimatedRunCostUsd?: number | null;
  organizationLlmCostUsdDaily?: number | null;
  maxOrganizationLlmCostUsdDaily?: number | null;
  estimatedLlmCost?: number | null;
  availableTurnBudget?: number | null;
};

export type RuntimePolicyEvaluationV1 = {
  status: "success" | "needs_llm" | "needs_user" | "blocked";
  decision: RuntimePolicyDecisionOutcomeV1;
  reason?: string;
  requiresApproval: boolean;
  criticalFields: string[];
  output: RuntimeResolutionSummaryV1 & {
    requiresApproval: boolean;
    canUseLlmRepair: boolean;
    llmEligibleFields: string[];
    llmForbiddenFields: string[];
  };
};

export type RuntimeNodeVisitV1 = {
  node: RuntimeNodeId;
  status: RuntimeNodeStatus;
  attempt: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  reason?: string;
  viaLlmRepair: boolean;
  errorFingerprint?: string;
  policyDecision?: NodeResultV1["policyDecision"];
  executionOutcome?: NodeResultV1["executionOutcome"];
};

export type ActionExecutionOutcomeV1 = {
  actionId: string;
  actionType: RuntimeActionType;
  status: Exclude<RuntimeNodeStatus, "retry" | "needs_llm">;
  action: RuntimeActionV1;
  dependencyActionIds?: string[];
  currentNode?: RuntimeNodeId;
  retries: number;
  llmRepairCalls: number;
  reason?: string;
  output?: Record<string, unknown>;
  checkpoint?: ExecutionCheckpointV1;
};

export type ExecutionTraceV1 = {
  requestId: string;
  traceId: string;
  planVersion: RuntimeActionPlan["version"];
  graph: readonly RuntimeGraphNodeId[];
  actions: Array<
    ActionExecutionOutcomeV1 & {
      nodeVisits: RuntimeNodeVisitV1[];
    }
  >;
  events: RuntimeEventV1[];
  checkpoint?: ExecutionCheckpointV1;
};

export type RuntimeNodeHandlerInputV1 = {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  node: RuntimeNodeId;
  attempt: number;
  llmRepairCalls: number;
  sourceNode?: RuntimeNodeId;
  sourceStatus?: RuntimeNodeStatus;
  sourceReason?: string;
  sourceOutput?: Record<string, unknown>;
};

export type RuntimeNodeHandlerV1 = (
  input: RuntimeNodeHandlerInputV1
) => Promise<NodeResultV1> | NodeResultV1;

export type RuntimeLlmRepairHandlerInputV1 = {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  node: RuntimeGraphNodeId;
  reason?: string;
  attempt: number;
  llmRepairCalls: number;
};

export type RuntimeLlmRepairHandlerV1 = (
  input: RuntimeLlmRepairHandlerInputV1
) => Promise<NodeResultV1> | NodeResultV1;

export type ProviderPayloadV1 = Record<string, unknown>;

export type SimulationResultV1 = {
  provider: string;
  payload: ProviderPayloadV1;
  summary: string;
  preview: Record<string, unknown>;
};

export type ExecutionOutcomeV1 = {
  provider: RuntimeProviderV1;
  payload: ProviderPayloadV1;
  output: Record<string, unknown>;
  summary: string;
  providerRequestId?: string;
  approvalItemId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  idempotencyKey?: string;
};

export type RuntimeAdapterErrorCodeV1 =
  | "auth"
  | "scope"
  | "rate_limit"
  | "feature_disabled"
  | "circuit_open"
  | "budget_queued"
  | "budget_throttled"
  | "budget_exhausted"
  | "provider_retryable"
  | "provider_fatal"
  | "validation";

export type RuntimeNormalizedAdapterErrorV1 = {
  code: RuntimeAdapterErrorCodeV1;
  status: "failed" | "blocked";
  reason: string;
  retryAfterMs?: number;
  provider?: RuntimeProviderV1;
  providerRequestId?: string;
};

export type AdapterManifestV1 = {
  id: string;
  version: string;
  provider: RuntimeProviderV1;
  capability: RuntimeAdapterCapabilityV1;
  supportedActionTypes: RuntimeActionType[];
  requiredScopes: string[];
  operationalLimits: {
    maxActionsPerPlan?: number;
    maxConcurrentRunsPerOrganization?: number;
    maxDailySideEffects?: number;
  };
  supportsSimulation: boolean;
  supportsCompensation: boolean;
  featureFlagKey: string;
};

export type AdapterCapabilityProbeV1 = {
  adapterId: string;
  provider: RuntimeProviderV1;
  version: string;
  enabled: boolean;
  supportedActionTypes: RuntimeActionType[];
  reason?: string;
};

export type AdapterHealthStatusV1 =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "disabled"
  | "circuit_open";

export type AdapterHealthSnapshotV1 = {
  status: AdapterHealthStatusV1;
  checkedAt: string;
  provider: RuntimeProviderV1;
  integrationId?: string;
  reason?: string;
  consecutiveFailures: number;
  circuitOpenUntil?: string;
};

export type IntegrationAdapterV1 = {
  manifest: AdapterManifestV1;
  provider: RuntimeProviderV1;
  capability: RuntimeAdapterCapabilityV1;
  actionTypes: RuntimeActionType[];
  supports: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => boolean;
  compile: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => Promise<ProviderPayloadV1> | ProviderPayloadV1;
  simulate: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => Promise<SimulationResultV1> | SimulationResultV1;
  execute: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => Promise<ExecutionOutcomeV1> | ExecutionOutcomeV1;
  normalizeOutput: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    output: unknown;
  }) => Record<string, unknown>;
  normalizeError: (input: {
    error: unknown;
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
  }) => RuntimeNormalizedAdapterErrorV1;
  probeCapabilities?: (input?: {
    ctx?: ExecutionContextV1;
  }) => Promise<AdapterCapabilityProbeV1> | AdapterCapabilityProbeV1;
  getHealth?: (input?: {
    ctx?: ExecutionContextV1;
    integrationId?: string;
  }) => Promise<AdapterHealthSnapshotV1> | AdapterHealthSnapshotV1;
  compensate?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    output: Record<string, unknown>;
    reason?: string;
  }) => Promise<ExecutionOutcomeV1> | ExecutionOutcomeV1;
  buildIdempotencyMaterial: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    payload: ProviderPayloadV1;
  }) => ProviderPayloadV1;
};

export type RuntimeNodeRegistryV1 = Record<RuntimeNodeId, RuntimeNodeHandlerV1>;

export type RunExecutionGraphInputV1 = {
  ctx: ExecutionContextV1;
  actionPlan: RuntimeActionPlan;
  nodes: RuntimeNodeRegistryV1;
  llmRepair?: RuntimeLlmRepairHandlerV1;
  allowLlmRepair?: (input: {
    ctx: ExecutionContextV1;
    action: RuntimeActionV1;
    node: RuntimeGraphNodeId;
    reason?: string;
  }) => boolean;
  resumeFromCheckpoint?: ExecutionCheckpointV1 | null;
  now?: () => Date;
};

export type RunExecutionGraphResultV1 = {
  outcome: "success" | "needs_user" | "failed" | "blocked";
  actions: ActionExecutionOutcomeV1[];
  trace: ExecutionTraceV1;
  context: ExecutionContextV1;
};

export type RuntimeReplayModeV1 = "runtime_replay" | "dry_run";

export type ReplayRequestV1 = {
  runtimeRunId: string;
  mode: RuntimeReplayModeV1;
  reason?: string;
  resumeFromCheckpoint?: ExecutionCheckpointV1 | null;
};

export type RuntimeTraceTimelineEntryV1 = {
  at: string;
  eventType: string;
  actionId?: string | null;
  actionType?: string | null;
  node?: string | null;
  status?: string | null;
  reason?: string | null;
  provider?: string | null;
  providerRequestId?: string | null;
  approvalItemId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
};

export type RuntimeTraceActionViewV1 = {
  actionId: string;
  actionType?: string | null;
  latestStatus?: string | null;
  latestReason?: string | null;
  timeline: RuntimeTraceTimelineEntryV1[];
};

export type RuntimeTraceViewerV1 = {
  runtimeRunId: string;
  requestId: string;
  traceId: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  timeline: RuntimeTraceTimelineEntryV1[];
  actions: RuntimeTraceActionViewV1[];
};

export type RuntimeActionDiffV1 = {
  actionId: string;
  baselineActionType?: string | null;
  candidateActionType?: string | null;
  baselineStatus?: string | null;
  candidateStatus?: string | null;
  baselineReason?: string | null;
  candidateReason?: string | null;
  changed: boolean;
};

export type RuntimeRunDiffV1 = {
  baselineRuntimeRunId: string;
  candidateRuntimeRunId: string;
  changed: boolean;
  statusChanged: boolean;
  actionPlanChanged: boolean;
  checkpointChanged: boolean;
  eventCountDelta: number;
  actions: RuntimeActionDiffV1[];
};

export type RuntimeReplayResultV1 = {
  sourceRuntimeRunId: string;
  replayRequest: ReplayRequestV1;
  outcome: RunExecutionGraphResultV1["outcome"];
  actions: ActionExecutionOutcomeV1[];
  trace: ExecutionTraceV1;
  context: ExecutionContextV1;
};

export type RuntimeManualRepairRequestV1 = {
  runtimeRunId: string;
  checkpointNode: RuntimeGraphNodeId;
  resumeReason?: RuntimeResumeReasonV1;
  reason?: string;
};

export type RuntimeManualRepairResultV1 = {
  runtimeRunId: string;
  enqueued: boolean;
  checkpointNode: RuntimeGraphNodeId;
  resumeReason: RuntimeResumeReasonV1;
  workflowRunId: string;
  workflowStepId: string;
  approvalItemId?: string;
};

export type RuntimeDeadLetterRecordV1 = {
  runtimeRunId: string;
  status: string;
  latestReason?: string | null;
  latestEventAt: string;
  checkpointNode?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  failedQueueEventId?: string | null;
};

export const DEFAULT_RUNTIME_BUDGET_V1 = {
  plannerCallsMax: 1,
  plannerCallsUsed: 0,
  llmRepairCallsMaxPerAction: 2,
  llmRepairCallsMaxPerRequest: 2,
  llmRepairCallsUsedInRequest: 0,
  syncRetriesMaxPerAction: 3,
  maxNodeVisitsPerAction: 12,
  maxRetriesPerNode: 3,
  maxActionsPerPlan: 5,
  repeatedErrorFingerprintLimit: 2,
  destructiveActionsMaxPerRequest: 1,
  destructiveActionsUsedInRequest: 0,
} satisfies Required<RuntimeBudgetV1>;
