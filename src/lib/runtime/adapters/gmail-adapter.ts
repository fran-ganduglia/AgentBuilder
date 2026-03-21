import "server-only";

import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type {
  ExecuteGoogleGmailReadToolInput,
  ExecuteGoogleGmailWriteToolInput,
} from "@/lib/integrations/google-agent-tools";
import {
  assertGoogleGmailRuntimeUsable,
  executeGoogleGmailReadTool,
  executeGoogleGmailWriteToolAction,
  type GoogleGmailReadToolExecutionResult,
  type GoogleGmailWriteToolExecutionResult,
} from "@/lib/integrations/google-gmail-agent-runtime";
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
  buildRuntimeActionIdempotencyKey,
  normalizeUnknownAdapterError,
} from "./shared";
import type { AdapterPlatformV1 } from "./platform";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeApprovalRecordV1 = {
  approvalItemId: string;
  workflowRunId: string;
  workflowStepId: string;
  idempotencyKey: string;
  expiresAt: string;
};

type GmailAdapterDeps = {
  platform: AdapterPlatformV1;
  getGoogleRuntime: typeof getGoogleAgentToolRuntimeWithServiceRole;
  executeReadTool: typeof executeGoogleGmailReadTool;
  executeWriteTool: typeof executeGoogleGmailWriteToolAction;
  enqueueApproval: (input: {
    ctx: ExecutionContextV1;
    provider: "gmail";
    action: ExecuteGoogleGmailWriteToolInput["action"];
    integrationId: string;
    toolName: string;
    summary: string;
    payload: ProviderPayloadV1;
    idempotencyKey: string;
    runtimeAction: RuntimeActionV1;
  }) => Promise<DbResult<RuntimeApprovalRecordV1>>;
  insertProviderAudit: typeof insertProviderActionAudit;
};

const GMAIL_ADAPTER_MANIFEST_V1 = {
  id: "runtime.gmail",
  version: "1.0.0",
  provider: "gmail",
  capability: "email",
  supportedActionTypes: [
    "search_email",
    "summarize_thread",
    "send_email",
    "create_draft_email",
    "create_draft_reply",
    "send_reply",
    "archive_thread",
    "apply_label",
  ],
  requiredScopes: ["gmail.readonly", "gmail.modify", "gmail.send"],
  operationalLimits: {
    maxActionsPerPlan: 5,
  },
  supportsSimulation: true,
  supportsCompensation: false,
  featureFlagKey: "runtime_adapter_gmail",
} satisfies AdapterManifestV1;

function getStringArrayPreview(values: string[]): string {
  return values.join(", ");
}

function getGmailThreadSummary(result: GoogleGmailReadToolExecutionResult): string {
  if (result.action === "search_threads") {
    return result.summary;
  }

  return `Hilo ${result.data.threadId} con ${result.data.messageCount} mensajes listo para postproceso.`;
}

function compileSearchEmailPayload(action: RuntimeActionV1): ExecuteGoogleGmailReadToolInput {
  const query = asString(action.params.query) ?? "";
  const maxResults = asNumber(action.params.maxResults) ?? undefined;

  return {
    action: "search_threads",
    query,
    ...(maxResults !== undefined ? { maxResults } : {}),
  };
}

function compileThreadReferencePayload(
  action: RuntimeActionV1
): {
  threadId: string;
  messageId: string;
  subject?: string;
} {
  const threadRef = asReference(action.params.threadRef);
  if (!threadRef) {
    throw new RuntimeAdapterError({
      message: "Falta threadRef resuelto para ejecutar la accion de Gmail.",
      code: "validation",
    });
  }

  return {
    threadId: threadRef.value,
    // El runtime abstracto hoy persiste `threadRef`; usamos el mismo identificador como placeholder
    // estable para el contrato write legado hasta que el runtime nuevo congele referencias mas ricas.
    messageId: threadRef.value,
    ...(threadRef.label ? { subject: threadRef.label } : {}),
  };
}

function compileSummarizeThreadPayload(
  action: RuntimeActionV1
): ExecuteGoogleGmailReadToolInput {
  const threadReference = compileThreadReferencePayload(action);
  return {
    action: "read_thread",
    threadId: threadReference.threadId,
  };
}

function compileSendEmailPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  const to = asStringArray(action.params.to);
  const cc = asStringArray(action.params.cc);
  const bcc = asStringArray(action.params.bcc);
  const subject = asString(action.params.subject) ?? "";
  const body = asString(action.params.body);

  if (to.length === 0) {
    throw new RuntimeAdapterError({
      message: "Falta al menos un destinatario email literal.",
      code: "validation",
    });
  }

  if (!body) {
    throw new RuntimeAdapterError({
      message: "Falta el cuerpo del email.",
      code: "validation",
    });
  }

  return {
    action: "send_email",
    to,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
    subject,
    body,
  };
}

function compileArchiveThreadPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  return {
    action: "archive_thread",
    ...compileThreadReferencePayload(action),
  };
}

function compileApplyLabelPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  const threadReference = compileThreadReferencePayload(action);
  const label = asString(action.params.label);

  if (!label) {
    throw new RuntimeAdapterError({
      message: "Falta el label a aplicar.",
      code: "validation",
    });
  }

  return {
    action: "apply_label",
    ...threadReference,
    labelName: label,
  };
}

function compileCreateDraftReplyPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  const threadReference = compileThreadReferencePayload(action);
  const body = asString(action.params.body);

  if (!body) {
    throw new RuntimeAdapterError({
      message: "Falta el cuerpo del borrador de respuesta.",
      code: "validation",
    });
  }

  const cc = asStringArray(action.params.cc);
  const bcc = asStringArray(action.params.bcc);

  return {
    action: "create_draft_reply",
    ...threadReference,
    body,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
  };
}

function compileCreateDraftEmailPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  const to = asStringArray(action.params.to);
  const subject = asString(action.params.subject) ?? "";
  const body = asString(action.params.body);

  if (to.length === 0) {
    throw new RuntimeAdapterError({
      message: "Falta al menos un destinatario para el borrador.",
      code: "validation",
    });
  }

  if (!body) {
    throw new RuntimeAdapterError({
      message: "Falta el cuerpo del borrador.",
      code: "validation",
    });
  }

  const cc = asStringArray(action.params.cc);
  const bcc = asStringArray(action.params.bcc);

  return {
    action: "create_draft_email",
    to,
    subject,
    body,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
  };
}

function compileSendReplyPayload(action: RuntimeActionV1): ExecuteGoogleGmailWriteToolInput {
  const threadReference = compileThreadReferencePayload(action);
  const body = asString(action.params.body);

  if (!body) {
    throw new RuntimeAdapterError({
      message: "Falta el cuerpo de la respuesta.",
      code: "validation",
    });
  }

  const cc = asStringArray(action.params.cc);
  const bcc = asStringArray(action.params.bcc);

  return {
    action: "send_reply",
    ...threadReference,
    body,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
  };
}

function compileGmailPayload(action: RuntimeActionV1): ProviderPayloadV1 {
  if (action.type === "search_email") {
    return compileSearchEmailPayload(action);
  }

  if (action.type === "summarize_thread") {
    return compileSummarizeThreadPayload(action);
  }

  if (action.type === "send_email") {
    return compileSendEmailPayload(action);
  }

  if (action.type === "create_draft_reply") {
    return compileCreateDraftReplyPayload(action);
  }

  if (action.type === "create_draft_email") {
    return compileCreateDraftEmailPayload(action);
  }

  if (action.type === "send_reply") {
    return compileSendReplyPayload(action);
  }

  if (action.type === "archive_thread") {
    return compileArchiveThreadPayload(action);
  }

  if (action.type === "apply_label") {
    return compileApplyLabelPayload(action);
  }

  throw new RuntimeAdapterError({
    message: `La accion ${action.type} no pertenece al adapter Gmail.`,
    status: "blocked",
    code: "validation",
    provider: "gmail",
  });
}

function buildGmailWritePreview(
  action: RuntimeActionV1,
  payload: ProviderPayloadV1
): SimulationResultV1 {
  if (action.type === "send_email") {
    const to = Array.isArray(payload.to) ? (payload.to as string[]) : [];
    const cc = Array.isArray(payload.cc) ? (payload.cc as string[]) : [];
    const bcc = Array.isArray(payload.bcc) ? (payload.bcc as string[]) : [];
    const subject = typeof payload.subject === "string" ? payload.subject : "";
    const body = typeof payload.body === "string" ? payload.body : "";

    return {
      provider: "gmail",
      payload,
      summary: `Preview listo para approval de email a ${getStringArrayPreview(to)}.`,
      preview: {
        channel: "approval_inbox",
        to,
        cc,
        bcc,
        subject,
        body,
        bodyPreview: body.slice(0, 280),
      },
    };
  }

  if (action.type === "create_draft_email") {
    const to = Array.isArray(payload.to) ? (payload.to as string[]) : [];
    const body = typeof payload.body === "string" ? payload.body : "";

    return {
      provider: "gmail",
      payload,
      summary: `Preview de borrador de email a ${getStringArrayPreview(to)}.`,
      preview: {
        channel: "approval_inbox",
        to,
        subject: payload.subject ?? "",
        body,
        bodyPreview: body.slice(0, 280),
        operation: "create_draft_email",
      },
    };
  }

  if (action.type === "create_draft_reply") {
    const body = typeof payload.body === "string" ? payload.body : "";

    return {
      provider: "gmail",
      payload,
      summary: `Preview de borrador de respuesta al hilo ${String(payload.threadId)}.`,
      preview: {
        channel: "approval_inbox",
        threadId: payload.threadId,
        subject: payload.subject ?? null,
        body,
        bodyPreview: body.slice(0, 280),
        operation: "create_draft_reply",
      },
    };
  }

  if (action.type === "send_reply") {
    const body = typeof payload.body === "string" ? payload.body : "";

    return {
      provider: "gmail",
      payload,
      summary: `Preview de respuesta al hilo ${String(payload.threadId)}.`,
      preview: {
        channel: "approval_inbox",
        threadId: payload.threadId,
        subject: payload.subject ?? null,
        body,
        bodyPreview: body.slice(0, 280),
        operation: "send_reply",
      },
    };
  }

  if (action.type === "archive_thread") {
    return {
      provider: "gmail",
      payload,
      summary: `Preview listo para approval de archivado del hilo ${String(payload.threadId)}.`,
      preview: {
        channel: "approval_inbox",
        threadId: payload.threadId,
        subject: payload.subject ?? null,
        operation: "archive_thread",
      },
    };
  }

  return {
    provider: "gmail",
    payload,
    summary: `Preview listo para approval del label "${String(payload.labelName)}".`,
    preview: {
      channel: "approval_inbox",
      threadId: payload.threadId,
      subject: payload.subject ?? null,
      labelName: payload.labelName ?? null,
      operation: "apply_label",
    },
  };
}

async function resolveUsableRuntime(
  deps: GmailAdapterDeps,
  ctx: ExecutionContextV1
) {
  const runtimeResult = await deps.getGoogleRuntime(
    ctx.agentId,
    ctx.organizationId,
    "gmail"
  );

  if (runtimeResult.error || !runtimeResult.data) {
    throw new RuntimeAdapterError({
      message: runtimeResult.error ?? "No se pudo cargar el runtime de Gmail.",
      status: "blocked",
      code: "auth",
      provider: "gmail",
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
      provider: "gmail",
    });
  }

  const usableRuntime = assertGoogleGmailRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    throw new RuntimeAdapterError({
      message: usableRuntime.error ?? "La integracion de Gmail no esta disponible.",
      status: "blocked",
      code: "auth",
      provider: "gmail",
    });
  }

  return usableRuntime.data;
}

function buildGmailWriteSummary(action: RuntimeActionV1, payload: ProviderPayloadV1): string {
  if (action.type === "send_email") {
    return `Enviar email a ${getStringArrayPreview(payload.to as string[])} con asunto "${typeof payload.subject === "string" ? payload.subject : ""}".`;
  }

  if (action.type === "create_draft_email") {
    return `Crear borrador de email a ${getStringArrayPreview(payload.to as string[])} con asunto "${typeof payload.subject === "string" ? payload.subject : ""}".`;
  }

  if (action.type === "create_draft_reply") {
    return `Crear borrador de respuesta al hilo ${String(payload.threadId)}${payload.subject ? ` (${String(payload.subject)})` : ""}.`;
  }

  if (action.type === "send_reply") {
    return `Responder al hilo ${String(payload.threadId)}${payload.subject ? ` (${String(payload.subject)})` : ""}.`;
  }

  if (action.type === "archive_thread") {
    return `Archivar el hilo ${String(payload.threadId)}${payload.subject ? ` (${String(payload.subject)})` : ""}.`;
  }

  return `Aplicar el label "${String(payload.labelName)}" sobre el hilo ${String(payload.threadId)}${payload.subject ? ` (${String(payload.subject)})` : ""}.`;
}

function getApprovalToolName(actionType: RuntimeActionV1["type"]): string {
  if (actionType === "send_email") return "runtime_gmail_send_email";
  if (actionType === "create_draft_email") return "runtime_gmail_create_draft_email";
  if (actionType === "create_draft_reply") return "runtime_gmail_create_draft_reply";
  if (actionType === "send_reply") return "runtime_gmail_send_reply";
  if (actionType === "archive_thread") return "runtime_gmail_archive_thread";
  return "runtime_gmail_apply_label";
}

function getProviderWriteAction(
  actionType: RuntimeActionV1["type"]
): ExecuteGoogleGmailWriteToolInput["action"] {
  if (actionType === "send_email") return "send_email";
  if (actionType === "create_draft_email") return "create_draft_email";
  if (actionType === "create_draft_reply") return "create_draft_reply";
  if (actionType === "send_reply") return "send_reply";
  if (actionType === "archive_thread") return "archive_thread";
  return "apply_label";
}

function normalizeWriteExecutionOutput(
  result: GoogleGmailWriteToolExecutionResult
): Record<string, unknown> {
  return {
    data: result.data,
    summary: result.summary,
    action: result.action,
  };
}

export function createGmailAdapterV1(
  deps: GmailAdapterDeps
): IntegrationAdapterV1 {
  const adapter: IntegrationAdapterV1 = {
    manifest: GMAIL_ADAPTER_MANIFEST_V1,
    provider: "gmail",
    capability: "email",
    actionTypes: [...GMAIL_ADAPTER_MANIFEST_V1.supportedActionTypes],
    supports: ({ action }) =>
      (
        GMAIL_ADAPTER_MANIFEST_V1.supportedActionTypes as ReadonlyArray<
          RuntimeActionV1["type"]
        >
      ).includes(action.type),
    compile: ({ action }) => compileGmailPayload(action),
    simulate: async ({ action }) => {
      const payload = compileGmailPayload(action);

      if (action.type === "search_email" || action.type === "summarize_thread") {
        return {
          provider: "gmail",
          payload,
          summary: `Accion ${action.type} lista para ejecucion read-only en Gmail.`,
          preview: {
            readOnly: true,
            actionType: action.type,
          },
        };
      }

      return buildGmailWritePreview(action, payload);
    },
    execute: async ({ ctx, action }): Promise<ExecutionOutcomeV1> => {
      const payload = compileGmailPayload(action);

      if (action.type === "search_email" || action.type === "summarize_thread") {
        const runtime = await resolveUsableRuntime(deps, ctx);
        deps.platform.assertAvailable({ adapter, integrationId: runtime.integration.id });
        const readResult = await (async () => {
          try {
            const result = await deps.executeReadTool({
              organizationId: ctx.organizationId,
              userId: ctx.userId ?? "",
              agentId: ctx.agentId,
              runtime,
              actionInput: payload as ExecuteGoogleGmailReadToolInput,
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

        if (readResult.error || !readResult.data) {
          throw new RuntimeAdapterError({
            message: readResult.error ?? "No se pudo ejecutar la lectura de Gmail.",
            code: "provider_fatal",
            provider: "gmail",
          });
        }

        await deps.insertProviderAudit({
          organizationId: ctx.organizationId,
          userId: ctx.userId ?? null,
          integrationId: runtime.integration.id,
          agentId: ctx.agentId,
          provider: "gmail",
          providerObjectType:
            readResult.data.action === "search_threads" ? "thread_list" : "thread",
          providerObjectId:
            readResult.data.action === "read_thread"
              ? readResult.data.data.threadId
              : null,
          action: `runtime.${action.type}`,
          requestId: readResult.data.requestId,
          status: "success",
        });

        return {
          provider: "gmail",
          payload,
          summary: getGmailThreadSummary(readResult.data),
          providerRequestId: readResult.data.requestId ?? undefined,
          output: adapter.normalizeOutput({
            ctx,
            action,
            output: readResult.data,
          }),
        };
      }

      const runtime = await resolveUsableRuntime(deps, ctx);
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
              actionInput: payload as ExecuteGoogleGmailWriteToolInput,
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
            message: execution.error ?? "No se pudo ejecutar la write aprobada de Gmail.",
            code: "provider_fatal",
            provider: "gmail",
          });
        }

        return {
          provider: "gmail",
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
        payload: {
          providerAction: getProviderWriteAction(action.type),
          ...payload,
        },
      });
      const summary = buildGmailWriteSummary(action, payload);
      const approval = await deps.enqueueApproval({
        ctx,
        provider: "gmail",
        action: getProviderWriteAction(action.type),
        integrationId: runtime.integration.id,
        toolName: getApprovalToolName(action.type),
        summary,
        payload,
        idempotencyKey,
        runtimeAction: action,
      });

      if (approval.error || !approval.data) {
        throw new RuntimeAdapterError({
          message: approval.error ?? "No se pudo encolar la aprobacion de Gmail.",
          code: "provider_fatal",
          provider: "gmail",
        });
      }

      return {
        provider: "gmail",
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
          preview: buildGmailWritePreview(action, payload).preview,
        },
      };
    },
    normalizeOutput: ({ action, output }) => {
      if (action.type === "search_email" || action.type === "summarize_thread") {
        const result = output as GoogleGmailReadToolExecutionResult;
        return result.action === "search_threads"
          ? { threads: result.data.threads, summary: result.summary }
          : { evidence: result.data, summary: result.summary };
      }

      return normalizeWriteExecutionOutput(output as GoogleGmailWriteToolExecutionResult);
    },
    normalizeError: ({ error }) =>
      normalizeUnknownAdapterError({
        error,
        provider: "gmail",
        fallback: "No se pudo completar la accion de Gmail.",
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

export function getDefaultGmailAdapterDeps(input: {
  enqueueApproval: GmailAdapterDeps["enqueueApproval"];
  platform: AdapterPlatformV1;
}): GmailAdapterDeps {
  return {
    platform: input.platform,
    getGoogleRuntime: getGoogleAgentToolRuntimeWithServiceRole,
    executeReadTool: executeGoogleGmailReadTool,
    executeWriteTool: executeGoogleGmailWriteToolAction,
    enqueueApproval: input.enqueueApproval,
    insertProviderAudit: insertProviderActionAudit,
  };
}
