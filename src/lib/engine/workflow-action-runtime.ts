import "server-only";

import type { Json } from "@/types/database";
import { buildWorkflowOperationalMetrics, type OperationalMetrics } from "@/lib/engine/observability";
import { createActionRegistry, createEngineStepRegistry, runAction } from "@/lib/engine/runtime";
import type {
  ActionDefinition,
  FailureKind,
  PlannedAction,
  PolicyDecision,
  ResolverResult,
} from "@/lib/engine/types";
import { getWorkflowActionMatrixEntry } from "@/lib/workflows/action-matrix";
import type { WorkflowExecutionError } from "@/lib/workflows/execution-engine";
import {
  executeGoogleCalendarWriteToolSchema,
  executeGoogleGmailWriteToolSchema,
  GOOGLE_SHEETS_WRITE_TOOL_ACTIONS,
  executeGoogleSheetsWriteToolSchema,
} from "@/lib/integrations/google-agent-tools";
import {
  assertGoogleCalendarRuntimeUsable,
  executeGoogleCalendarWriteToolAction,
  type GoogleCalendarAgentRuntime,
} from "@/lib/integrations/google-calendar-agent-runtime";
import {
  assertGoogleGmailRuntimeUsable,
  executeGoogleGmailWriteToolAction,
  type GoogleGmailAgentRuntime,
} from "@/lib/integrations/google-gmail-agent-runtime";
import {
  getGoogleAgentToolRuntimeWithServiceRole,
  type GoogleAgentToolRuntime,
} from "@/lib/integrations/google-agent-runtime";
import {
  assertGoogleSheetsRuntimeUsable,
  executeGoogleSheetsWriteToolAction,
  type GoogleSheetsAgentRuntime,
} from "@/lib/integrations/google-sheets-agent-runtime";
import {
  executeSalesforceToolAction,
  type SalesforceToolExecutionResult,
} from "@/lib/integrations/salesforce-agent-runtime";
import {
  executeSalesforceCrmToolSchema,
  type ExecuteSalesforceCrmToolInput,
} from "@/lib/integrations/salesforce-tools";

type SupportedProvider =
  | "salesforce"
  | "gmail"
  | "google_calendar"
  | "google_sheets";

type WorkflowActionInput =
  | ExecuteSalesforceCrmToolInput
  | Record<string, unknown>;

type WorkflowGoogleRuntime =
  | GoogleGmailAgentRuntime
  | GoogleCalendarAgentRuntime
  | GoogleSheetsAgentRuntime;

type WorkflowActionContext = {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  workflowRunId: string;
  workflowStepId: string;
  provider: SupportedProvider;
  rawActionInput: unknown;
  deps: WorkflowActionRuntimeDeps;
};

type WorkflowActionState = {
  runtime: WorkflowGoogleRuntime | null;
  outputPayload: Json | null;
  providerRequestKey: string | null;
};

type WorkflowActionRuntimeDeps = {
  getGoogleRuntime: typeof getGoogleAgentToolRuntimeWithServiceRole;
  executeSalesforce: typeof executeSalesforceToolAction;
  executeGmail: typeof executeGoogleGmailWriteToolAction;
  executeCalendar: typeof executeGoogleCalendarWriteToolAction;
  executeSheets: typeof executeGoogleSheetsWriteToolAction;
};

const defaultDeps: WorkflowActionRuntimeDeps = {
  getGoogleRuntime: getGoogleAgentToolRuntimeWithServiceRole,
  executeSalesforce: executeSalesforceToolAction,
  executeGmail: executeGoogleGmailWriteToolAction,
  executeCalendar: executeGoogleCalendarWriteToolAction,
  executeSheets: executeGoogleSheetsWriteToolAction,
};

const WORKFLOW_STEP_LOAD_RUNTIME = "workflow.load_runtime";
const WORKFLOW_STEP_EXECUTE_ACTION = "workflow.execute_action";

type SupportedActionDefinition = {
  provider: SupportedProvider;
  action: string;
  steps: string[];
};

const SALESFORCE_ACTIONS = [
  "lookup_records",
  "list_leads_recent",
  "list_leads_by_status",
  "lookup_accounts",
  "lookup_opportunities",
  "lookup_cases",
  "summarize_pipeline",
  "create_task",
  "create_lead",
  "update_lead",
  "create_contact",
  "create_case",
  "update_case",
  "update_opportunity",
] as const;

const GMAIL_ACTIONS = [
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "archive_thread",
  "apply_label",
] as const;

const GOOGLE_CALENDAR_ACTIONS = [
  "create_event",
  "reschedule_event",
  "cancel_event",
] as const;

const GOOGLE_SHEETS_ACTIONS = GOOGLE_SHEETS_WRITE_TOOL_ACTIONS;

const SUPPORTED_ACTIONS: SupportedActionDefinition[] = [
  ...SALESFORCE_ACTIONS.map((action) => ({
    provider: "salesforce" as const,
    action,
    steps: [WORKFLOW_STEP_EXECUTE_ACTION],
  })),
  ...GMAIL_ACTIONS.map((action) => ({
    provider: "gmail" as const,
    action,
    steps: [WORKFLOW_STEP_LOAD_RUNTIME, WORKFLOW_STEP_EXECUTE_ACTION],
  })),
  ...GOOGLE_CALENDAR_ACTIONS.map((action) => ({
    provider: "google_calendar" as const,
    action,
    steps: [WORKFLOW_STEP_LOAD_RUNTIME, WORKFLOW_STEP_EXECUTE_ACTION],
  })),
  ...GOOGLE_SHEETS_ACTIONS.map((action) => ({
    provider: "google_sheets" as const,
    action,
    steps: [WORKFLOW_STEP_LOAD_RUNTIME, WORKFLOW_STEP_EXECUTE_ACTION],
  })),
];

function mapGoogleRuntimeFailure(
  runtime: Exclude<GoogleAgentToolRuntime, { ok: true }>
): WorkflowExecutionError {
  switch (runtime.code) {
    case "scope_missing":
      return {
        code: "scope_missing",
        message: runtime.message,
        retryable: false,
        retryAfterMs: null,
      };
    case "integration_unavailable":
      return {
        code: "reauth_required",
        message: runtime.message,
        retryable: false,
        retryAfterMs: null,
      };
    case "integration_missing":
    case "tool_missing":
    case "tool_invalid":
    case "tool_disabled":
    case "tool_misaligned":
    default:
      return {
        code: "validation_error",
        message: runtime.message,
        retryable: false,
        retryAfterMs: null,
      };
  }
}

function toResolverResult<TResolvedParams>(
  parsed: { success: boolean; data?: TResolvedParams }
): ResolverResult<TResolvedParams> {
  if (parsed.success) {
    return {
      status: "ok",
      resolvedParams: parsed.data as TResolvedParams,
    };
  }

  return {
    status: "deny",
    resolvedParams: null,
    failure: "missing_data",
  };
}

function resolveSalesforceAction(
  rawActionInput: unknown
): ResolverResult<ExecuteSalesforceCrmToolInput> {
  return toResolverResult(executeSalesforceCrmToolSchema.safeParse(rawActionInput));
}

function resolveGmailAction(
  rawActionInput: unknown
): ResolverResult<Record<string, unknown>> {
  return toResolverResult(executeGoogleGmailWriteToolSchema.safeParse(rawActionInput));
}

function resolveGoogleCalendarAction(
  rawActionInput: unknown
): ResolverResult<Record<string, unknown>> {
  return toResolverResult(executeGoogleCalendarWriteToolSchema.safeParse(rawActionInput));
}

function resolveGoogleSheetsAction(
  rawActionInput: unknown
): ResolverResult<Record<string, unknown>> {
  return toResolverResult(executeGoogleSheetsWriteToolSchema.safeParse(rawActionInput));
}

function resolveWorkflowAction(
  provider: SupportedProvider,
  rawActionInput: unknown
): ResolverResult<WorkflowActionInput> {
  if (provider === "salesforce") {
    return resolveSalesforceAction(rawActionInput);
  }

  if (provider === "gmail") {
    return resolveGmailAction(rawActionInput);
  }

  if (provider === "google_calendar") {
    return resolveGoogleCalendarAction(rawActionInput);
  }

  return resolveGoogleSheetsAction(rawActionInput);
}

function buildExecutionMode(provider: SupportedProvider, action: string) {
  const policy = getWorkflowActionMatrixEntry(provider, action);
  return policy.requiresConfirmation || policy.approvalMode === "always"
    ? "approval_async"
    : "sync";
}

function buildActionDefinitions(): Array<
  ActionDefinition<Record<string, unknown>, WorkflowActionContext, WorkflowActionState>
> {
  return SUPPORTED_ACTIONS.map(({ provider, action, steps }) => ({
    type: action,
    provider,
    steps: [...steps],
    resolverSchema: null,
    executionMode: buildExecutionMode(provider, action),
    policyKey: `${provider}:${action}`,
    resolve: async ({ context }) =>
      resolveWorkflowAction(
        provider,
        context.rawActionInput
      ) as ResolverResult<Record<string, unknown>>,
  }));
}

function mapFailureKindToWorkflowError(
  policyDecision: Exclude<PolicyDecision, "execute">,
  failure: FailureKind | undefined
): WorkflowExecutionError {
  if (policyDecision === "retry_technical") {
    return {
      code: "provider_error",
      message: "El engine marco esta accion como reintentable por una falla tecnica.",
      retryable: true,
      retryAfterMs: null,
    };
  }

  if (policyDecision === "enqueue_approval") {
    return {
      code: "validation_error",
      message: "Este workflow step todavia requiere aprobacion antes de poder ejecutarse.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (failure === "auth") {
    return {
      code: "reauth_required",
      message: "La integracion necesita reautenticacion antes de completar este step.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (failure === "scope") {
    return {
      code: "scope_missing",
      message: "La integracion no tiene permisos suficientes para completar este step.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (failure === "budget") {
    return {
      code: "budget_exhausted",
      message: "El presupuesto temporal del proveedor no permite completar este step ahora.",
      retryable: false,
      retryAfterMs: null,
    };
  }

  return {
    code: "validation_error",
    message: "El payload aprobado ya no cumple el contrato declarativo de esta accion.",
    retryable: false,
    retryAfterMs: null,
  };
}

export class WorkflowActionExecutionError extends Error {
  readonly workflowError: WorkflowExecutionError;
  readonly policyDecision: Exclude<PolicyDecision, "execute">;
  readonly failure: FailureKind | undefined;

  constructor(input: {
    workflowError: WorkflowExecutionError;
    policyDecision: Exclude<PolicyDecision, "execute">;
    failure?: FailureKind;
  }) {
    super(input.workflowError.message);
    this.name = "WorkflowActionExecutionError";
    this.workflowError = input.workflowError;
    this.policyDecision = input.policyDecision;
    this.failure = input.failure;
  }
}

export function isWorkflowActionExecutionError(
  error: unknown
): error is WorkflowActionExecutionError {
  return error instanceof WorkflowActionExecutionError;
}

function evaluateWorkflowActionPolicy<TResolvedParams>(input: {
  resolverResult: ResolverResult<TResolvedParams>;
}): PolicyDecision {
  if (input.resolverResult.status === "ok") {
    return "execute";
  }

  return input.resolverResult.failure === "provider_retryable"
    ? "retry_technical"
    : input.resolverResult.failure === "approval_required"
      ? "enqueue_approval"
      : "fail_closed";
}

function toJson(value: unknown): Json {
  return value as Json;
}

const workflowActionRegistry = createActionRegistry<
  WorkflowActionContext,
  WorkflowActionState
>(buildActionDefinitions());

const workflowEngineStepRegistry = createEngineStepRegistry<
  WorkflowActionContext,
  WorkflowActionState
>([
  [
    WORKFLOW_STEP_LOAD_RUNTIME,
    async ({ context, action, state }) => {
      const runtimeResult = await context.deps.getGoogleRuntime(
        context.agentId,
        context.organizationId,
        action.provider as "gmail" | "google_calendar" | "google_sheets"
      );

      if (runtimeResult.error || !runtimeResult.data) {
        throw new Error(
          runtimeResult.error ??
            `No se pudo cargar la runtime de ${action.provider} para este workflow step.`
        );
      }

      if (!runtimeResult.data.ok) {
        throw new WorkflowActionExecutionError({
          workflowError: mapGoogleRuntimeFailure(runtimeResult.data),
          policyDecision: "fail_closed",
          failure:
            runtimeResult.data.code === "scope_missing"
              ? "scope"
              : runtimeResult.data.code === "integration_unavailable"
                ? "auth"
                : "provider_fatal",
        });
      }

      if (action.provider === "gmail") {
        const usableRuntime = assertGoogleGmailRuntimeUsable(runtimeResult.data);
        if (usableRuntime.error || !usableRuntime.data) {
          throw new WorkflowActionExecutionError({
            workflowError: {
              code: "reauth_required",
              message:
                usableRuntime.error ?? "Gmail no esta disponible para este workflow step.",
              retryable: false,
              retryAfterMs: null,
            },
            policyDecision: "fail_closed",
            failure: "auth",
          });
        }

        return { ...state, runtime: usableRuntime.data };
      }

      if (action.provider === "google_calendar") {
        const usableRuntime = assertGoogleCalendarRuntimeUsable(runtimeResult.data);
        if (usableRuntime.error || !usableRuntime.data) {
          throw new WorkflowActionExecutionError({
            workflowError: {
              code: "reauth_required",
              message:
                usableRuntime.error ??
                "Google Calendar no esta disponible para este workflow step.",
              retryable: false,
              retryAfterMs: null,
            },
            policyDecision: "fail_closed",
            failure: "auth",
          });
        }

        return { ...state, runtime: usableRuntime.data };
      }

      const usableRuntime = assertGoogleSheetsRuntimeUsable(runtimeResult.data);
      if (usableRuntime.error || !usableRuntime.data) {
        throw new WorkflowActionExecutionError({
          workflowError: {
            code: "reauth_required",
            message:
              usableRuntime.error ??
              "Google Sheets no esta disponible para este workflow step.",
            retryable: false,
            retryAfterMs: null,
          },
          policyDecision: "fail_closed",
          failure: "auth",
        });
      }

      return { ...state, runtime: usableRuntime.data };
    },
  ],
  [
    WORKFLOW_STEP_EXECUTE_ACTION,
    async ({ context, action, resolvedParams, state }) => {
      if (action.provider === "salesforce") {
        const execution = await context.deps.executeSalesforce({
          organizationId: context.organizationId,
          userId: context.userId,
          agentId: context.agentId,
          integrationId: context.integrationId,
          actionInput: resolvedParams as ExecuteSalesforceCrmToolInput,
          workflow: {
            workflowRunId: context.workflowRunId,
            workflowStepId: context.workflowStepId,
          },
        });

        if (execution.error || !execution.data) {
          throw new Error(
            execution.error ?? "No se pudo ejecutar la accion de Salesforce."
          );
        }

        return {
          ...state,
          providerRequestKey: execution.data.requestId,
          outputPayload: toJson(execution.data as SalesforceToolExecutionResult),
        };
      }

      if (!state.runtime) {
        throw new Error("Workflow declarative runtime missing provider runtime.");
      }

      if (action.provider === "gmail") {
        const execution = await context.deps.executeGmail({
          organizationId: context.organizationId,
          userId: context.userId,
          agentId: context.agentId,
          runtime: state.runtime as GoogleGmailAgentRuntime,
          actionInput: resolvedParams as Parameters<
            typeof executeGoogleGmailWriteToolAction
          >[0]["actionInput"],
          workflow: {
            workflowRunId: context.workflowRunId,
            workflowStepId: context.workflowStepId,
          },
        });

        if (execution.error || !execution.data) {
          throw new Error(execution.error ?? "No se pudo ejecutar la accion de Gmail.");
        }

        return {
          ...state,
          providerRequestKey: execution.data.requestId,
          outputPayload: toJson(execution.data),
        };
      }

      if (action.provider === "google_calendar") {
        const execution = await context.deps.executeCalendar({
          organizationId: context.organizationId,
          userId: context.userId,
          agentId: context.agentId,
          runtime: state.runtime as GoogleCalendarAgentRuntime,
          actionInput: resolvedParams as Parameters<
            typeof executeGoogleCalendarWriteToolAction
          >[0]["actionInput"],
          workflow: {
            workflowRunId: context.workflowRunId,
            workflowStepId: context.workflowStepId,
          },
        });

        if (execution.error || !execution.data) {
          throw new Error(
            execution.error ?? "No se pudo ejecutar la accion de Google Calendar."
          );
        }

        return {
          ...state,
          providerRequestKey: execution.data.requestId,
          outputPayload: toJson(execution.data),
        };
      }

      const execution = await context.deps.executeSheets({
        organizationId: context.organizationId,
        userId: context.userId,
        agentId: context.agentId,
        runtime: state.runtime as GoogleSheetsAgentRuntime,
        actionInput: resolvedParams as Parameters<
          typeof executeGoogleSheetsWriteToolAction
        >[0]["actionInput"],
        workflow: {
          workflowRunId: context.workflowRunId,
          workflowStepId: context.workflowStepId,
        },
      });

      if (execution.error || !execution.data) {
        throw new Error(
          execution.error ?? "No se pudo ejecutar la accion de Google Sheets."
        );
      }

      return {
        ...state,
        providerRequestKey: execution.data.requestId,
        outputPayload: toJson(execution.data),
      };
    },
  ],
]);

export type ExecuteWorkflowActionInput = {
  organizationId: string;
  userId: string;
  agentId: string;
  integrationId: string;
  workflowRunId: string;
  workflowStepId: string;
  provider: SupportedProvider;
  action: string;
  rawActionInput: unknown;
};

export type ExecuteWorkflowActionResult = {
  outputPayload: Json | null;
  providerRequestKey: string | null;
  definition: ActionDefinition<Record<string, unknown>, WorkflowActionContext, WorkflowActionState>;
  operationalMetrics: OperationalMetrics;
};

export async function executeWorkflowAction(
  input: ExecuteWorkflowActionInput,
  deps: WorkflowActionRuntimeDeps = defaultDeps
): Promise<ExecuteWorkflowActionResult> {
  const action: PlannedAction = {
    provider: input.provider,
    type: input.action,
    params: {},
  };

  const result = await runAction({
    action,
    context: {
      organizationId: input.organizationId,
      userId: input.userId,
      agentId: input.agentId,
      integrationId: input.integrationId,
      workflowRunId: input.workflowRunId,
      workflowStepId: input.workflowStepId,
      provider: input.provider,
      rawActionInput: input.rawActionInput,
      deps,
    },
    initialState: {
      runtime: null,
      outputPayload: null,
      providerRequestKey: null,
    },
    actions: workflowActionRegistry,
    engineSteps: workflowEngineStepRegistry,
    evaluatePolicy: ({ resolverResult }) =>
      evaluateWorkflowActionPolicy({ resolverResult }),
  });

  if (result.status !== "executed") {
    const failure = result.status === "policy_blocked" ? result.failure : undefined;
    throw new WorkflowActionExecutionError({
      workflowError: mapFailureKindToWorkflowError(
        result.policyDecision,
        failure
      ),
      policyDecision: result.policyDecision,
      failure,
    });
  }

  return {
    outputPayload: result.state.outputPayload,
    providerRequestKey: result.state.providerRequestKey,
    definition: result.definition,
    operationalMetrics: buildWorkflowOperationalMetrics({
      provider: input.provider,
      action: input.action,
    }),
  };
}
