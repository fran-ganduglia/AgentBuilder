import "server-only";

import { insertAuditLog } from "@/lib/db/audit";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type {
  ExecuteGoogleCalendarReadToolInput,
  ExecuteGoogleCalendarWriteToolInput,
} from "@/lib/integrations/google-agent-tools";
import {
  assertGoogleCalendarRuntimeUsable,
  executeGoogleCalendarReadTool,
  executeGoogleCalendarWriteToolAction,
  type GoogleCalendarAgentRuntime,
  type GoogleCalendarReadToolExecutionResult,
  type GoogleCalendarWriteToolExecutionResult,
} from "@/lib/integrations/google-calendar-agent-runtime";
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
  asNumber,
  asReference,
  asString,
  asStringArray,
  asTime,
  buildRuntimeActionIdempotencyKey,
  normalizeUnknownAdapterError,
} from "./shared";
import type { AdapterPlatformV1 } from "./platform";
import type { RuntimeApprovalRecordV1 } from "./gmail-adapter";

type DbResult<T> = { data: T | null; error: string | null };

type GoogleCalendarAdapterDeps = {
  platform: AdapterPlatformV1;
  getGoogleRuntime: typeof getGoogleAgentToolRuntimeWithServiceRole;
  executeReadTool: typeof executeGoogleCalendarReadTool;
  executeWriteTool: typeof executeGoogleCalendarWriteToolAction;
  enqueueApproval: (input: {
    ctx: ExecutionContextV1;
    provider: "google_calendar";
    action: ExecuteGoogleCalendarWriteToolInput["action"];
    integrationId: string;
    toolName: string;
    summary: string;
    payload: ProviderPayloadV1;
    idempotencyKey: string;
    runtimeAction: RuntimeActionV1;
  }) => Promise<DbResult<RuntimeApprovalRecordV1>>;
  insertAuditLog: typeof insertAuditLog;
};

const GOOGLE_CALENDAR_ADAPTER_MANIFEST_V1 = {
  id: "runtime.google_calendar",
  version: "1.0.0",
  provider: "google_calendar",
  capability: "calendar",
  supportedActionTypes: [
    "create_event",
    "reschedule_event",
    "cancel_event",
    "list_events",
    "check_availability",
  ],
  requiredScopes: ["calendar.readonly", "calendar.events"],
  operationalLimits: {
    maxActionsPerPlan: 5,
  },
  supportsSimulation: true,
  supportsCompensation: true,
  featureFlagKey: "runtime_adapter_google_calendar",
} satisfies AdapterManifestV1;

function compileCreateEventPayload(
  action: RuntimeActionV1
): ExecuteGoogleCalendarWriteToolInput {
  const title = asString(action.params.title);
  const start = asTime(action.params.start);
  const end = asTime(action.params.end);
  const timezone =
    asString(action.params.timezone) ?? start?.timezone ?? end?.timezone ?? "UTC";
  const description = asString(action.params.description);
  const location = asString(action.params.location);
  const attendeeEmails = asStringArray(action.params.attendees);

  if (!title) {
    throw new RuntimeAdapterError({
      message: "Falta el titulo del evento.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  if (!start || !end) {
    throw new RuntimeAdapterError({
      message: "Faltan start/end resueltos para crear el evento.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  return {
    action: "create_event",
    title,
    startIso: start.value,
    endIso: end.value,
    timezone,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(attendeeEmails.length > 0 ? { attendeeEmails } : {}),
  };
}

function compileEventReference(action: RuntimeActionV1) {
  const eventRef = asReference(action.params.eventRef);
  if (!eventRef) {
    throw new RuntimeAdapterError({
      message: "Falta eventRef resuelto para ejecutar la accion de Calendar.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  return eventRef;
}

function compileReschedulePayload(
  action: RuntimeActionV1
): ExecuteGoogleCalendarWriteToolInput {
  const eventRef = compileEventReference(action);
  const start = asTime(action.params.start);
  const end = asTime(action.params.end);
  const timezone =
    asString(action.params.timezone) ?? start?.timezone ?? end?.timezone ?? "UTC";
  const title = asString(action.params.title);
  const description = asString(action.params.description);
  const location = asString(action.params.location);
  const attendeeEmails = asStringArray(action.params.attendees);

  if (!start || !end) {
    throw new RuntimeAdapterError({
      message: "Faltan start/end resueltos para reprogramar el evento.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  return {
    action: "reschedule_event",
    eventId: eventRef.value,
    startIso: start.value,
    endIso: end.value,
    timezone,
    ...(title ? { title, eventTitle: eventRef.label ?? title } : {}),
    ...(eventRef.label ? { eventTitle: eventRef.label } : {}),
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(attendeeEmails.length > 0 ? { attendeeEmails } : {}),
  };
}

function compileCancelPayload(
  action: RuntimeActionV1
): ExecuteGoogleCalendarWriteToolInput {
  const eventRef = compileEventReference(action);
  const description = asString(action.params.reason);

  return {
    action: "cancel_event",
    eventId: eventRef.value,
    ...(eventRef.label ? { eventTitle: eventRef.label } : {}),
    ...(description ? { description } : {}),
  };
}

function compileListEventsPayload(
  action: RuntimeActionV1
): ExecuteGoogleCalendarReadToolInput {
  const windowStart = asTime(action.params.windowStart);
  const windowEnd = asTime(action.params.windowEnd);
  const timezone =
    asString(action.params.timezone) ??
    windowStart?.timezone ??
    windowEnd?.timezone ??
    "UTC";
  const maxResults = asNumber(action.params.maxResults) ?? 10;

  if (!windowStart || !windowEnd) {
    throw new RuntimeAdapterError({
      message: "Faltan windowStart/windowEnd para listar eventos.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  return {
    action: "list_events",
    startIso: windowStart.value,
    endIso: windowEnd.value,
    timezone,
    maxResults,
  };
}

function compileCheckAvailabilityPayload(
  action: RuntimeActionV1
): ExecuteGoogleCalendarReadToolInput {
  const windowStart = asTime(action.params.windowStart);
  const windowEnd = asTime(action.params.windowEnd);
  const timezone =
    asString(action.params.timezone) ??
    windowStart?.timezone ??
    windowEnd?.timezone ??
    "UTC";

  if (!windowStart || !windowEnd) {
    throw new RuntimeAdapterError({
      message: "Faltan windowStart/windowEnd para verificar disponibilidad.",
      code: "validation",
      provider: "google_calendar",
    });
  }

  return {
    action: "check_availability",
    startIso: windowStart.value,
    endIso: windowEnd.value,
    timezone,
  };
}

function compileGoogleCalendarPayload(action: RuntimeActionV1): ProviderPayloadV1 {
  if (action.type === "create_event") {
    return compileCreateEventPayload(action);
  }

  if (action.type === "reschedule_event") {
    return compileReschedulePayload(action);
  }

  if (action.type === "cancel_event") {
    return compileCancelPayload(action);
  }

  if (action.type === "list_events") {
    return compileListEventsPayload(action);
  }

  if (action.type === "check_availability") {
    return compileCheckAvailabilityPayload(action);
  }

  throw new RuntimeAdapterError({
    message: `La accion ${action.type} no pertenece al adapter Google Calendar.`,
    status: "blocked",
    code: "validation",
    provider: "google_calendar",
  });
}

function buildWritePreview(payload: ProviderPayloadV1): SimulationResultV1 {
  return {
    provider: "google_calendar",
    payload,
    summary: `Preview listo para approval de ${String(payload.action)}.`,
    preview: {
      channel: "approval_inbox",
      ...payload,
    },
  };
}

async function resolveUsableRuntime(
  deps: GoogleCalendarAdapterDeps,
  ctx: ExecutionContextV1
): Promise<GoogleCalendarAgentRuntime> {
  const runtimeResult = await deps.getGoogleRuntime(
    ctx.agentId,
    ctx.organizationId,
    "google_calendar"
  );

  if (runtimeResult.error || !runtimeResult.data) {
    throw new RuntimeAdapterError({
      message:
        runtimeResult.error ?? "No se pudo cargar el runtime de Google Calendar.",
      status: "blocked",
      code: "auth",
      provider: "google_calendar",
    });
  }

  if (!runtimeResult.data.ok) {
    throw new RuntimeAdapterError({
      message: runtimeResult.data.message,
      status: "blocked",
      code:
        runtimeResult.data.code === "scope_missing"
          ? "scope"
          : runtimeResult.data.code === "integration_unavailable"
            ? "auth"
            : "provider_fatal",
      provider: "google_calendar",
    });
  }

  const usableRuntime = assertGoogleCalendarRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    throw new RuntimeAdapterError({
      message:
        usableRuntime.error ?? "La integracion de Google Calendar no esta disponible.",
      status: "blocked",
      code: "auth",
      provider: "google_calendar",
    });
  }

  return usableRuntime.data;
}

function getApprovalToolName(actionType: RuntimeActionV1["type"]): string {
  if (actionType === "create_event") {
    return "runtime_google_calendar_create_event";
  }

  if (actionType === "reschedule_event") {
    return "runtime_google_calendar_reschedule_event";
  }

  return "runtime_google_calendar_cancel_event";
}

function normalizeWriteExecutionOutput(
  result: GoogleCalendarWriteToolExecutionResult
): Record<string, unknown> {
  return {
    data: result.data,
    summary: result.summary,
    action: result.action,
  };
}

export function createGoogleCalendarAdapterV1(
  deps: GoogleCalendarAdapterDeps
): IntegrationAdapterV1 {
  const adapter: IntegrationAdapterV1 = {
    manifest: GOOGLE_CALENDAR_ADAPTER_MANIFEST_V1,
    provider: "google_calendar",
    capability: "calendar",
    actionTypes: [...GOOGLE_CALENDAR_ADAPTER_MANIFEST_V1.supportedActionTypes],
    supports: ({ action }) =>
      (
        GOOGLE_CALENDAR_ADAPTER_MANIFEST_V1.supportedActionTypes as ReadonlyArray<
          RuntimeActionV1["type"]
        >
      ).includes(action.type),
    compile: ({ action }) => compileGoogleCalendarPayload(action),
    simulate: async ({ action }) => {
      const payload = compileGoogleCalendarPayload(action);

      if (action.type === "list_events" || action.type === "check_availability") {
        return {
          provider: "google_calendar",
          payload,
          summary: `${action.type === "check_availability" ? "Disponibilidad" : "Lectura de eventos"} lista para ejecucion read-only.`,
          preview: {
            readOnly: true,
            ...payload,
          },
        };
      }

      return buildWritePreview(payload);
    },
    execute: async ({ ctx, action }): Promise<ExecutionOutcomeV1> => {
      const payload = compileGoogleCalendarPayload(action);
      const runtime = await resolveUsableRuntime(deps, ctx);

      if (action.type === "list_events" || action.type === "check_availability") {
        deps.platform.assertAvailable({
          adapter,
          integrationId: runtime.integration.id,
        });
        const result = await (async () => {
          try {
            const execution = await deps.executeReadTool({
              organizationId: ctx.organizationId,
              userId: ctx.userId ?? "",
              agentId: ctx.agentId,
              runtime,
              actionInput: payload as ExecuteGoogleCalendarReadToolInput,
            });
            deps.platform.recordSuccess({
              adapter,
              integrationId: runtime.integration.id,
            });
            return execution;
          } catch (error) {
            deps.platform.recordFailure({
              adapter,
              integrationId: runtime.integration.id,
              error: adapter.normalizeError({ error, ctx, action }),
            });
            throw error;
          }
        })();

        if (result.error || !result.data) {
          throw new RuntimeAdapterError({
            message: result.error ?? "No se pudieron listar los eventos.",
            code: "provider_fatal",
            provider: "google_calendar",
          });
        }

        return {
          provider: "google_calendar",
          payload,
          summary: result.data.summary,
          providerRequestId: result.data.requestId ?? undefined,
          output: adapter.normalizeOutput({
            ctx,
            action,
            output: result.data,
          }),
        };
      }

      if (action.approvalMode !== "required") {
        deps.platform.assertAvailable({
          adapter,
          integrationId: runtime.integration.id,
        });
        const execution = await (async () => {
          try {
            const result = await deps.executeWriteTool({
              organizationId: ctx.organizationId,
              userId: ctx.userId ?? "",
              agentId: ctx.agentId,
              runtime,
              actionInput: payload as ExecuteGoogleCalendarWriteToolInput,
              workflow:
                ctx.workflowRunId && ctx.workflowStepId
                  ? {
                      workflowRunId: ctx.workflowRunId,
                      workflowStepId: ctx.workflowStepId,
                    }
                  : undefined,
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
              execution.error ??
              "No se pudo ejecutar la mutacion aprobada de Google Calendar.",
            code: "provider_fatal",
            provider: "google_calendar",
          });
        }

        return {
          provider: "google_calendar",
          payload,
          summary: execution.data.summary,
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
        action.type === "create_event"
          ? `Crear evento "${String(payload.title)}" entre ${String(payload.startIso)} y ${String(payload.endIso)} (${String(payload.timezone)}).`
          : action.type === "reschedule_event"
            ? `Reprogramar evento ${String(payload.eventId)} hacia ${String(payload.startIso)} - ${String(payload.endIso)} (${String(payload.timezone)}).`
            : `Cancelar evento ${String(payload.eventId)}.`;
      const approval = await deps.enqueueApproval({
        ctx,
        provider: "google_calendar",
        action: payload.action as ExecuteGoogleCalendarWriteToolInput["action"],
        integrationId: runtime.integration.id,
        toolName: getApprovalToolName(action.type),
        summary,
        payload,
        idempotencyKey,
        runtimeAction: action,
      });

      if (approval.error || !approval.data) {
        throw new RuntimeAdapterError({
          message: approval.error ?? "No se pudo encolar la aprobacion del evento.",
          code: "provider_fatal",
          provider: "google_calendar",
        });
      }

      await deps.insertAuditLog({
        organizationId: ctx.organizationId,
        userId: ctx.userId ?? null,
        action: `runtime.${action.type}.approval_enqueued`,
        resourceType: "workflow_run",
        resourceId: approval.data.workflowRunId,
        newValue: {
          approval_item_id: approval.data.approvalItemId,
          workflow_step_id: approval.data.workflowStepId,
          idempotency_key: idempotencyKey,
        },
      });

      return {
        provider: "google_calendar",
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
          preview: buildWritePreview(payload).preview,
        },
      };
    },
    normalizeOutput: ({ action, output }) => {
      if (action.type === "list_events" || action.type === "check_availability") {
        const result = output as GoogleCalendarReadToolExecutionResult;
        return {
          evidence: result.data,
          summary: result.summary,
        };
      }

      return normalizeWriteExecutionOutput(
        output as GoogleCalendarWriteToolExecutionResult
      );
    },
    normalizeError: ({ error }) =>
      normalizeUnknownAdapterError({
        error,
        provider: "google_calendar",
        fallback: "No se pudo completar la accion de Google Calendar.",
      }),
    probeCapabilities: () => deps.platform.probeAdapter(adapter),
    getHealth: ({ integrationId } = {}) =>
      deps.platform.getHealth({
        adapter,
        integrationId,
      }),
    compensate: async ({ ctx, action, output }) => {
      if (action.type !== "create_event") {
        throw new RuntimeAdapterError({
          message: `La accion ${action.type} no soporta compensacion en Google Calendar.`,
          status: "blocked",
          code: "validation",
          provider: "google_calendar",
        });
      }

      const eventId =
        typeof output === "object" &&
        output &&
        "data" in output &&
        typeof (output as { data?: { eventId?: unknown } }).data?.eventId === "string"
          ? ((output as { data: { eventId: string } }).data.eventId)
          : null;

      if (!eventId) {
        throw new RuntimeAdapterError({
          message: "Falta eventId para compensar la creacion del evento.",
          status: "blocked",
          code: "validation",
          provider: "google_calendar",
        });
      }

      const runtime = await resolveUsableRuntime(deps, ctx);
      deps.platform.assertAvailable({
        adapter,
        integrationId: runtime.integration.id,
      });
      const compensation = await deps.executeWriteTool({
        organizationId: ctx.organizationId,
        userId: ctx.userId ?? "",
        agentId: ctx.agentId,
        runtime,
        actionInput: {
          action: "cancel_event",
          eventId,
          eventTitle:
            typeof (output as { data?: { title?: unknown } }).data?.title === "string"
              ? ((output as { data: { title: string } }).data.title)
              : undefined,
        },
      });

      if (compensation.error || !compensation.data) {
        throw new RuntimeAdapterError({
          message:
            compensation.error ??
            "No se pudo ejecutar la compensacion de Google Calendar.",
          code: "provider_fatal",
          provider: "google_calendar",
        });
      }

      return {
        provider: "google_calendar",
        payload: {
          action: "cancel_event",
          eventId,
        },
        summary: compensation.data.summary,
        providerRequestId: compensation.data.requestId ?? undefined,
        output: normalizeWriteExecutionOutput(compensation.data),
      };
    },
    buildIdempotencyMaterial: ({ payload }) => payload,
  };

  return adapter;
}

export function getDefaultGoogleCalendarAdapterDeps(input: {
  enqueueApproval: GoogleCalendarAdapterDeps["enqueueApproval"];
  platform: AdapterPlatformV1;
}): GoogleCalendarAdapterDeps {
  return {
    platform: input.platform,
    getGoogleRuntime: getGoogleAgentToolRuntimeWithServiceRole,
    executeReadTool: executeGoogleCalendarReadTool,
    executeWriteTool: executeGoogleCalendarWriteToolAction,
    enqueueApproval: input.enqueueApproval,
    insertAuditLog,
  };
}
