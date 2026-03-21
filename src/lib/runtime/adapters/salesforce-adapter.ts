import "server-only";

import {
  assertSalesforceActionEnabled,
  assertSalesforceRuntimeUsable,
  executeSalesforceToolAction,
  getSalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import type { ExecuteSalesforceCrmToolInput } from "@/lib/integrations/salesforce-tools";
import type {
  AdapterManifestV1,
  ExecutionContextV1,
  ExecutionOutcomeV1,
  IntegrationAdapterV1,
  ProviderPayloadV1,
  RuntimeActionV1,
  SimulationResultV1,
} from "@/lib/runtime/types";

import {
  RuntimeAdapterError,
  asEntity,
  asNumber,
  asReference,
  asString,
  buildRuntimeActionIdempotencyKey,
  normalizeUnknownAdapterError,
} from "./shared";
import type { AdapterPlatformV1 } from "./platform";
import type { RuntimeApprovalRecordV1 } from "./gmail-adapter";

type DbResult<T> = { data: T | null; error: string | null };

type SalesforceAdapterDeps = {
  platform: AdapterPlatformV1;
  getRuntime: typeof getSalesforceAgentToolRuntime;
  executeAction: typeof executeSalesforceToolAction;
  enqueueApproval: (input: {
    ctx: ExecutionContextV1;
    provider: "salesforce";
    action: Extract<
      ExecuteSalesforceCrmToolInput["action"],
      "create_lead" | "update_lead" | "create_task"
    >;
    integrationId: string;
    toolName: string;
    summary: string;
    payload: ProviderPayloadV1;
    idempotencyKey: string;
    runtimeAction: RuntimeActionV1;
  }) => Promise<DbResult<RuntimeApprovalRecordV1>>;
};

const SALESFORCE_ADAPTER_MANIFEST_V1 = {
  id: "runtime.salesforce",
  version: "1.0.0",
  provider: "salesforce",
  capability: "crm",
  supportedActionTypes: [
    "search_records",
    "create_lead",
    "update_lead",
    "create_task",
  ],
  requiredScopes: ["crm.objects.read", "crm.objects.write"],
  operationalLimits: {
    maxActionsPerPlan: 5,
  },
  supportsSimulation: true,
  supportsCompensation: false,
  featureFlagKey: "runtime_adapter_salesforce",
} satisfies AdapterManifestV1;

function resolveRecordId(
  value: RuntimeActionV1["params"][string] | undefined,
  input: { paramKey: string }
): string | null {
  const reference = asReference(value);
  if (reference) {
    return reference.value;
  }

  const entity = asEntity(value);
  if (entity) {
    return entity.identifiers?.recordId ?? entity.value;
  }

  const literal = asString(value);
  if (literal) {
    return literal;
  }

  if (value?.kind === "unknown") {
    return null;
  }

  if (value) {
    throw new RuntimeAdapterError({
      message: `El parametro ${input.paramKey} no tiene un ID resoluble para Salesforce.`,
      code: "validation",
      provider: "salesforce",
    });
  }

  return null;
}

function compileSearchRecordsPayload(
  action: RuntimeActionV1
): ExecuteSalesforceCrmToolInput {
  const objectTypeValue =
    asEntity(action.params.objectType)?.value ?? asString(action.params.objectType);
  const query = asString(action.params.query);
  const limit = asNumber(action.params.maxResults) ?? 5;

  if (!objectTypeValue || !query) {
    throw new RuntimeAdapterError({
      message: "Faltan objectType/query para buscar registros en Salesforce.",
      code: "validation",
      provider: "salesforce",
    });
  }

  const normalizedObjectType = objectTypeValue.trim().toLowerCase();
  if (normalizedObjectType.includes("account")) {
    return { action: "lookup_accounts", query, limit };
  }

  if (normalizedObjectType.includes("opportun")) {
    return { action: "lookup_opportunities", query, limit };
  }

  if (normalizedObjectType.includes("case")) {
    return { action: "lookup_cases", query, limit };
  }

  return { action: "lookup_records", query, limit };
}

function compileCreateLeadPayload(
  action: RuntimeActionV1
): ExecuteSalesforceCrmToolInput {
  const lastName = asString(action.params.lastName);
  const company = asString(action.params.company);

  if (!lastName || !company) {
    throw new RuntimeAdapterError({
      message: "Faltan lastName/company para crear el lead.",
      code: "validation",
      provider: "salesforce",
    });
  }

  return {
    action: "create_lead",
    lastName,
    company,
    ...(asString(action.params.firstName) ? { firstName: asString(action.params.firstName)! } : {}),
    ...(asString(action.params.email) ? { email: asString(action.params.email)! } : {}),
    ...(asString(action.params.phone) ? { phone: asString(action.params.phone)! } : {}),
    ...(asString(action.params.description)
      ? { description: asString(action.params.description)! }
      : {}),
  };
}

function compileUpdateLeadPayload(
  action: RuntimeActionV1
): ExecuteSalesforceCrmToolInput {
  const leadId = resolveRecordId(action.params.recordRef, { paramKey: "recordRef" });

  if (!leadId) {
    throw new RuntimeAdapterError({
      message: "Falta recordRef resuelto para actualizar el lead.",
      code: "validation",
      provider: "salesforce",
    });
  }

  return {
    action: "update_lead",
    leadId,
    ...(asString(action.params.status) ? { status: asString(action.params.status)! } : {}),
    ...(asString(action.params.rating) ? { rating: asString(action.params.rating)! } : {}),
    ...(asString(action.params.description)
      ? { description: asString(action.params.description)! }
      : {}),
  };
}

function compileCreateTaskPayload(
  action: RuntimeActionV1
): ExecuteSalesforceCrmToolInput {
  const subject = asString(action.params.subject);

  if (!subject) {
    throw new RuntimeAdapterError({
      message: "Falta el subject para crear la task.",
      code: "validation",
      provider: "salesforce",
    });
  }

  const whoId = resolveRecordId(action.params.whoRef, { paramKey: "whoRef" });
  const whatId = resolveRecordId(action.params.whatRef, { paramKey: "whatRef" });

  return {
    action: "create_task",
    subject,
    ...(asString(action.params.description)
      ? { description: asString(action.params.description)! }
      : {}),
    ...(whoId ? { whoId } : {}),
    ...(whatId ? { whatId } : {}),
    ...(asString(action.params.status) ? { status: asString(action.params.status)! } : {}),
    ...(asString(action.params.priority)
      ? { priority: asString(action.params.priority)! }
      : {}),
    ...(action.params.dueDate?.kind === "time" ? { dueDate: action.params.dueDate.value } : {}),
  };
}

function compileSalesforcePayload(action: RuntimeActionV1): ProviderPayloadV1 {
  if (action.type === "search_records") {
    return compileSearchRecordsPayload(action);
  }

  if (action.type === "create_lead") {
    return compileCreateLeadPayload(action);
  }

  if (action.type === "update_lead") {
    return compileUpdateLeadPayload(action);
  }

  if (action.type === "create_task") {
    return compileCreateTaskPayload(action);
  }

  throw new RuntimeAdapterError({
    message: `La accion ${action.type} no pertenece al adapter Salesforce.`,
    status: "blocked",
    code: "validation",
    provider: "salesforce",
  });
}

async function resolveUsableRuntime(
  deps: SalesforceAdapterDeps,
  ctx: ExecutionContextV1,
  providerAction: ExecuteSalesforceCrmToolInput["action"]
) {
  const runtimeResult = await deps.getRuntime(ctx.agentId, ctx.organizationId);
  if (runtimeResult.error || !runtimeResult.data) {
    throw new RuntimeAdapterError({
      message: runtimeResult.error ?? "No se pudo cargar el runtime de Salesforce.",
      status: "blocked",
      code: "auth",
      provider: "salesforce",
    });
  }

  const usableRuntime = assertSalesforceRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    throw new RuntimeAdapterError({
      message: usableRuntime.error ?? "La integracion de Salesforce no esta disponible.",
      status: "blocked",
      code: "auth",
      provider: "salesforce",
    });
  }

  const actionEnabled = assertSalesforceActionEnabled(usableRuntime.data, providerAction);
  if (actionEnabled.error || !actionEnabled.data) {
    throw new RuntimeAdapterError({
      message: actionEnabled.error ?? "La accion de Salesforce no esta habilitada.",
      status: "blocked",
      code: "scope",
      provider: "salesforce",
    });
  }

  return actionEnabled.data;
}

function buildPreview(payload: ProviderPayloadV1): SimulationResultV1 {
  return {
    provider: "salesforce",
    payload,
    summary:
      payload.action === "lookup_records" ||
      payload.action === "lookup_accounts" ||
      payload.action === "lookup_opportunities" ||
      payload.action === "lookup_cases"
        ? `Busqueda CRM lista para ${String(payload.action)}.`
        : `Preview listo para approval de ${String(payload.action)} en Salesforce.`,
    preview: {
      ...(payload.action === "create_lead" ||
      payload.action === "update_lead" ||
      payload.action === "create_task"
        ? { channel: "approval_inbox" }
        : { readOnly: true }),
      ...payload,
    },
  };
}

function getApprovalToolName(actionType: RuntimeActionV1["type"]): string {
  if (actionType === "create_lead") {
    return "runtime_salesforce_create_lead";
  }

  if (actionType === "update_lead") {
    return "runtime_salesforce_update_lead";
  }

  return "runtime_salesforce_create_task";
}

export function createSalesforceAdapterV1(
  deps: SalesforceAdapterDeps
): IntegrationAdapterV1 {
  const adapter: IntegrationAdapterV1 = {
    manifest: SALESFORCE_ADAPTER_MANIFEST_V1,
    provider: "salesforce",
    capability: "crm",
    actionTypes: [...SALESFORCE_ADAPTER_MANIFEST_V1.supportedActionTypes],
    supports: ({ action }) =>
      (
        SALESFORCE_ADAPTER_MANIFEST_V1.supportedActionTypes as ReadonlyArray<
          RuntimeActionV1["type"]
        >
      ).includes(action.type),
    compile: ({ action }) => compileSalesforcePayload(action),
    simulate: async ({ action }) => buildPreview(compileSalesforcePayload(action)),
    execute: async ({ ctx, action }): Promise<ExecutionOutcomeV1> => {
      const payload = compileSalesforcePayload(action);
      const runtime = await resolveUsableRuntime(
        deps,
        ctx,
        payload.action as ExecuteSalesforceCrmToolInput["action"]
      );

      if (action.type === "search_records" || action.approvalMode !== "required") {
        deps.platform.assertAvailable({
          adapter,
          integrationId: runtime.integration.id,
        });
        const execution = await (async () => {
          try {
            const result = await deps.executeAction({
              organizationId: ctx.organizationId,
              userId: ctx.userId ?? "",
              agentId: ctx.agentId,
              integrationId: runtime.integration.id,
              actionInput: payload as ExecuteSalesforceCrmToolInput,
              workflow:
                action.type === "search_records" ||
                !(ctx.workflowRunId && ctx.workflowStepId)
                  ? undefined
                  : {
                      workflowRunId: ctx.workflowRunId,
                      workflowStepId: ctx.workflowStepId,
                    },
            });
            deps.platform.recordSuccess({
              adapter,
              integrationId: runtime.integration.id,
            });
            return result;
          } catch (error) {
            deps.platform.recordFailure({
              adapter,
              integrationId: runtime.integration.id,
              error: adapter.normalizeError({ error, ctx, action }),
            });
            throw error;
          }
        })();

        if (execution.error || !execution.data) {
          throw new RuntimeAdapterError({
            message:
              execution.error ?? "No se pudo ejecutar la lectura de Salesforce.",
            code: "provider_fatal",
            provider: "salesforce",
          });
        }

        return {
          provider: "salesforce",
          payload,
          summary: `Busqueda ${String(payload.action)} completada.`,
          providerRequestId: execution.data.requestId ?? undefined,
          output: adapter.normalizeOutput({
            ctx,
            action,
            output: execution.data,
          }),
        };
      }

      const idempotencyKey = buildRuntimeActionIdempotencyKey({
        ctx,
        action,
        payload,
      });
      const summary =
        action.type === "create_lead"
          ? `Crear lead ${String(payload.lastName)} en ${String(payload.company)}.`
          : action.type === "update_lead"
            ? `Actualizar lead ${String(payload.leadId)} en Salesforce.`
            : `Crear task "${String(payload.subject)}" en Salesforce.`;
      const approval = await deps.enqueueApproval({
        ctx,
        provider: "salesforce",
        action: payload.action as Extract<
          ExecuteSalesforceCrmToolInput["action"],
          "create_lead" | "update_lead" | "create_task"
        >,
        integrationId: runtime.integration.id,
        toolName: getApprovalToolName(action.type),
        summary,
        payload,
        idempotencyKey,
        runtimeAction: action,
      });

      if (approval.error || !approval.data) {
        throw new RuntimeAdapterError({
          message: approval.error ?? "No se pudo encolar la aprobacion de Salesforce.",
          code: "provider_fatal",
          provider: "salesforce",
        });
      }

      return {
        provider: "salesforce",
        payload,
        summary,
        approvalItemId: approval.data.approvalItemId,
        workflowRunId: approval.data.workflowRunId,
        workflowStepId: approval.data.workflowStepId,
        idempotencyKey,
        output: {
          approvalItemId: approval.data.approvalItemId,
          workflowRunId: approval.data.workflowRunId,
          workflowStepId: approval.data.workflowStepId,
          expiresAt: approval.data.expiresAt,
          preview: buildPreview(payload).preview,
        },
      };
    },
    normalizeOutput: ({ action, output }) => {
      const execution = output as { data?: unknown; summary?: unknown; action?: unknown };
      if (action.type === "search_records") {
        return {
          evidence: execution.data ?? null,
          summary:
            typeof execution.summary === "string"
              ? execution.summary
              : `Busqueda ${String(execution.action ?? "crm")} completada.`,
        };
      }

      return {
        data: execution.data ?? null,
        summary: typeof execution.summary === "string" ? execution.summary : "",
        action: execution.action ?? null,
      };
    },
    normalizeError: ({ error }) =>
      normalizeUnknownAdapterError({
        error,
        provider: "salesforce",
        fallback: "No se pudo completar la accion de Salesforce.",
      }),
    probeCapabilities: () => deps.platform.probeAdapter(adapter),
    getHealth: ({ integrationId } = {}) =>
      deps.platform.getHealth({
        adapter,
        integrationId,
      }),
    buildIdempotencyMaterial: ({ payload }) => payload,
  };

  return adapter;
}

export function getDefaultSalesforceAdapterDeps(input: {
  enqueueApproval: SalesforceAdapterDeps["enqueueApproval"];
  platform: AdapterPlatformV1;
}): SalesforceAdapterDeps {
  return {
    platform: input.platform,
    getRuntime: getSalesforceAgentToolRuntime,
    executeAction: executeSalesforceToolAction,
    enqueueApproval: input.enqueueApproval,
  };
}
