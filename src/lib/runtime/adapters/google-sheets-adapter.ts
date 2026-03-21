import "server-only";

import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type {
  ExecuteGoogleSheetsReadToolInput,
  ExecuteGoogleSheetsWriteToolInput,
} from "@/lib/integrations/google-agent-tools";
import {
  assertGoogleSheetsRuntimeUsable,
  executeGoogleSheetsReadTool,
  executeGoogleSheetsWriteToolAction,
  type GoogleSheetsAgentRuntime,
  type GoogleSheetsReadToolExecutionResult,
  type GoogleSheetsWriteToolExecutionResult,
} from "@/lib/integrations/google-sheets-agent-runtime";
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
  asReference,
  asString,
  buildRuntimeActionIdempotencyKey,
  normalizeProviderPayloadMatrix,
  normalizeUnknownAdapterError,
} from "./shared";
import type { AdapterPlatformV1 } from "./platform";
import type { RuntimeApprovalRecordV1 } from "./gmail-adapter";

type DbResult<T> = { data: T | null; error: string | null };

type GoogleSheetsAdapterDeps = {
  platform: AdapterPlatformV1;
  getGoogleRuntime: typeof getGoogleAgentToolRuntimeWithServiceRole;
  executeReadTool: typeof executeGoogleSheetsReadTool;
  executeWriteTool: typeof executeGoogleSheetsWriteToolAction;
  enqueueApproval: (input: {
    ctx: ExecutionContextV1;
    provider: "google_sheets";
    action: ExecuteGoogleSheetsWriteToolInput["action"];
    integrationId: string;
    toolName: string;
    summary: string;
    payload: ProviderPayloadV1;
    idempotencyKey: string;
    runtimeAction: RuntimeActionV1;
  }) => Promise<DbResult<RuntimeApprovalRecordV1>>;
};

const GOOGLE_SHEETS_ADAPTER_MANIFEST_V1 = {
  id: "runtime.google_sheets",
  version: "1.0.0",
  provider: "google_sheets",
  capability: "sheets",
  supportedActionTypes: [
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
  ],
  requiredScopes: ["spreadsheets.readonly", "spreadsheets"],
  operationalLimits: {
    maxActionsPerPlan: 5,
  },
  supportsSimulation: true,
  supportsCompensation: false,
  featureFlagKey: "runtime_adapter_google_sheets",
} satisfies AdapterManifestV1;

function resolveSheetTarget(action: RuntimeActionV1): {
  spreadsheetId: string;
  sheetName: string;
} {
  const sheetRef = asReference(action.params.sheetRef);

  if (!sheetRef) {
    throw new RuntimeAdapterError({
      message: "Falta sheetRef resuelto para ejecutar la accion de Sheets.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  if (!sheetRef.label) {
    throw new RuntimeAdapterError({
      message: "Falta el nombre de hoja resuelto para ejecutar la accion de Sheets.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  return {
    spreadsheetId: sheetRef.value,
    sheetName: sheetRef.label,
  };
}

function resolveRange(action: RuntimeActionV1): string {
  const rangeRef = asReference(action.params.rangeRef);
  if (!rangeRef) {
    throw new RuntimeAdapterError({
      message: "Falta rangeRef resuelto para ejecutar la accion de Sheets.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  return rangeRef.value;
}

function resolveRows(action: RuntimeActionV1): Array<Array<string>> {
  const rows = action.params.rows;
  if (!rows || rows.kind !== "computed") {
    throw new RuntimeAdapterError({
      message: "Falta rows estructurado para ejecutar la accion de Sheets.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  return normalizeProviderPayloadMatrix(rows.value).map((row) =>
    row.map((cell) => (cell === null ? "" : String(cell)))
  );
}

function compileReadRangePayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsReadToolInput {
  const target = resolveSheetTarget(action);
  const rangeA1 = resolveRange(action);

  return {
    action: "read_range",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    rangeA1,
  };
}

function compileAppendRowsPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsWriteToolInput {
  const target = resolveSheetTarget(action);
  const rangeRef = asReference(action.params.rangeRef);

  return {
    action: "append_rows",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    rangeA1: rangeRef?.value ?? "A1",
    values: resolveRows(action),
  };
}

function compileUpdateRangePayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsWriteToolInput {
  const target = resolveSheetTarget(action);

  return {
    action: "update_range",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    rangeA1: resolveRange(action),
    values: resolveRows(action),
  };
}

function compileListSheetsPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsReadToolInput {
  const spreadsheetRef = asReference(action.params.spreadsheetRef);

  if (!spreadsheetRef) {
    throw new RuntimeAdapterError({
      message: "Falta spreadsheetRef para listar las hojas.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  return {
    action: "list_sheets",
    spreadsheetId: spreadsheetRef.value,
  };
}

function compileFindRowsPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsReadToolInput {
  const target = resolveSheetTarget(action);
  const query = asString(action.params.query) ?? "";

  const colonIdx = query.indexOf(":");
  const column = colonIdx > 0 ? query.slice(0, colonIdx).trim() : "name";
  const value = colonIdx > 0 ? query.slice(colonIdx + 1).trim() : query;

  return {
    action: "find_rows",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    match: { column, value, operator: "equals" },
  };
}

function compileGetHeadersPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsReadToolInput {
  const target = resolveSheetTarget(action);

  return {
    action: "get_headers",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
  };
}

function compilePreviewSheetPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsReadToolInput {
  const target = resolveSheetTarget(action);

  return {
    action: "preview_sheet",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
  };
}

function compileAppendRecordsPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsWriteToolInput {
  const target = resolveSheetTarget(action);
  const records = action.params.records;

  if (!records || records.kind !== "computed" || !Array.isArray(records.value)) {
    throw new RuntimeAdapterError({
      message: "Falta records estructurado para append_records.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  const normalizedRecords = (records.value as Array<unknown>).map((row) => {
    if (typeof row !== "object" || row === null) {
      return {};
    }

    const result: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (
        v === null ||
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        result[k] = v as string | number | boolean | null;
      } else {
        result[k] = String(v);
      }
    }

    return result;
  });

  return {
    action: "append_records",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    records: normalizedRecords as Array<Record<string, string | number | boolean | null>>,
  };
}

function compileClearRangePayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsWriteToolInput {
  const target = resolveSheetTarget(action);
  const rangeA1 = resolveRange(action);

  return {
    action: "clear_range",
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    rangeA1,
  };
}

function compileCreateSpreadsheetPayload(
  action: RuntimeActionV1
): ExecuteGoogleSheetsWriteToolInput {
  const title = asString(action.params.title);

  if (!title) {
    throw new RuntimeAdapterError({
      message: "Falta el titulo del nuevo spreadsheet.",
      code: "validation",
      provider: "google_sheets",
    });
  }

  return {
    action: "create_spreadsheet",
    title,
  };
}

function compileGoogleSheetsPayload(action: RuntimeActionV1): ProviderPayloadV1 {
  if (action.type === "read_sheet_range") {
    return compileReadRangePayload(action);
  }

  if (action.type === "append_sheet_rows") {
    return compileAppendRowsPayload(action);
  }

  if (action.type === "update_sheet_range") {
    return compileUpdateRangePayload(action);
  }

  if (action.type === "list_sheets") {
    return compileListSheetsPayload(action);
  }

  if (action.type === "find_rows") {
    return compileFindRowsPayload(action);
  }

  if (action.type === "get_headers") {
    return compileGetHeadersPayload(action);
  }

  if (action.type === "preview_sheet") {
    return compilePreviewSheetPayload(action);
  }

  if (action.type === "append_records") {
    return compileAppendRecordsPayload(action);
  }

  if (action.type === "clear_range") {
    return compileClearRangePayload(action);
  }

  if (action.type === "create_spreadsheet") {
    return compileCreateSpreadsheetPayload(action);
  }

  throw new RuntimeAdapterError({
    message: `La accion ${action.type} no pertenece al adapter Google Sheets.`,
    status: "blocked",
    code: "validation",
    provider: "google_sheets",
  });
}

async function resolveUsableRuntime(
  deps: GoogleSheetsAdapterDeps,
  ctx: ExecutionContextV1
): Promise<GoogleSheetsAgentRuntime> {
  const runtimeResult = await deps.getGoogleRuntime(
    ctx.agentId,
    ctx.organizationId,
    "google_sheets"
  );

  if (runtimeResult.error || !runtimeResult.data) {
    throw new RuntimeAdapterError({
      message: runtimeResult.error ?? "No se pudo cargar el runtime de Google Sheets.",
      status: "blocked",
      code: "auth",
      provider: "google_sheets",
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
      provider: "google_sheets",
    });
  }

  const usableRuntime = assertGoogleSheetsRuntimeUsable(runtimeResult.data);
  if (usableRuntime.error || !usableRuntime.data) {
    throw new RuntimeAdapterError({
      message:
        usableRuntime.error ?? "La integracion de Google Sheets no esta disponible.",
      status: "blocked",
      code: "auth",
      provider: "google_sheets",
    });
  }

  return usableRuntime.data;
}

const SHEETS_READ_ACTIONS = new Set([
  "read_range",
  "list_sheets",
  "find_rows",
  "get_headers",
  "preview_sheet",
]);

function buildPreview(payload: ProviderPayloadV1): SimulationResultV1 {
  const isReadOnly = SHEETS_READ_ACTIONS.has(String(payload.action));

  return {
    provider: "google_sheets",
    payload,
    summary: isReadOnly
      ? `Lectura lista para ${String(payload.action)}.`
      : `Preview listo para approval de ${String(payload.action)}.`,
    preview: {
      ...(isReadOnly ? { readOnly: true } : { channel: "approval_inbox" }),
      ...payload,
    },
  };
}

function getApprovalToolName(actionType: RuntimeActionV1["type"]): string {
  if (actionType === "append_sheet_rows") return "runtime_google_sheets_append_rows";
  if (actionType === "append_records") return "runtime_google_sheets_append_records";
  if (actionType === "clear_range") return "runtime_google_sheets_clear_range";
  if (actionType === "create_spreadsheet") return "runtime_google_sheets_create_spreadsheet";
  return "runtime_google_sheets_update_range";
}

function normalizeWriteExecutionOutput(
  result: GoogleSheetsWriteToolExecutionResult
): Record<string, unknown> {
  return {
    data: result.data,
    summary: result.summary,
    action: result.action,
  };
}

export function createGoogleSheetsAdapterV1(
  deps: GoogleSheetsAdapterDeps
): IntegrationAdapterV1 {
  const adapter: IntegrationAdapterV1 = {
    manifest: GOOGLE_SHEETS_ADAPTER_MANIFEST_V1,
    provider: "google_sheets",
    capability: "sheets",
    actionTypes: [...GOOGLE_SHEETS_ADAPTER_MANIFEST_V1.supportedActionTypes],
    supports: ({ action }) =>
      (
        GOOGLE_SHEETS_ADAPTER_MANIFEST_V1.supportedActionTypes as ReadonlyArray<
          RuntimeActionV1["type"]
        >
      ).includes(action.type),
    compile: ({ action }) => compileGoogleSheetsPayload(action),
    simulate: async ({ action }) => buildPreview(compileGoogleSheetsPayload(action)),
    execute: async ({ ctx, action }): Promise<ExecutionOutcomeV1> => {
      const payload = compileGoogleSheetsPayload(action);
      const runtime = await resolveUsableRuntime(deps, ctx);

      const READ_ONLY_ACTIONS = new Set([
        "read_sheet_range",
        "list_sheets",
        "find_rows",
        "get_headers",
        "preview_sheet",
      ]);

      if (READ_ONLY_ACTIONS.has(action.type)) {
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
              actionInput: payload as ExecuteGoogleSheetsReadToolInput,
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
            message: result.error ?? "No se pudo completar la lectura de Google Sheets.",
            code: "provider_fatal",
            provider: "google_sheets",
          });
        }

        return {
          provider: "google_sheets",
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
              actionInput: payload as ExecuteGoogleSheetsWriteToolInput,
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
              "No se pudo ejecutar la mutacion aprobada de Google Sheets.",
            code: "provider_fatal",
            provider: "google_sheets",
          });
        }

        return {
          provider: "google_sheets",
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
        action.type === "append_sheet_rows"
          ? `Agregar ${Array.isArray(payload.values) ? payload.values.length : 0} filas en ${String(payload.sheetName)}.`
          : action.type === "append_records"
            ? `Agregar ${Array.isArray(payload.records) ? payload.records.length : 0} registros en ${String(payload.sheetName)}.`
            : action.type === "clear_range"
              ? `Limpiar ${String(payload.sheetName)}!${String(payload.rangeA1)}.`
              : action.type === "create_spreadsheet"
                ? `Crear spreadsheet "${String(payload.title)}".`
                : `Actualizar ${String(payload.sheetName)}!${String(payload.rangeA1)}.`;
      const approval = await deps.enqueueApproval({
        ctx,
        provider: "google_sheets",
        action: payload.action as ExecuteGoogleSheetsWriteToolInput["action"],
        integrationId: runtime.integration.id,
        toolName: getApprovalToolName(action.type),
        summary,
        payload,
        idempotencyKey,
        runtimeAction: action,
      });

      if (approval.error || !approval.data) {
        throw new RuntimeAdapterError({
          message:
            approval.error ?? "No se pudo encolar la aprobacion de Google Sheets.",
          code: "provider_fatal",
          provider: "google_sheets",
        });
      }

      return {
        provider: "google_sheets",
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
      const readActions = new Set([
        "read_sheet_range",
        "list_sheets",
        "find_rows",
        "get_headers",
        "preview_sheet",
      ]);

      if (readActions.has(action.type)) {
        const result = output as GoogleSheetsReadToolExecutionResult;
        return { evidence: result.data, summary: result.summary };
      }

      return normalizeWriteExecutionOutput(output as GoogleSheetsWriteToolExecutionResult);
    },
    normalizeError: ({ error }) =>
      normalizeUnknownAdapterError({
        error,
        provider: "google_sheets",
        fallback: "No se pudo completar la accion de Google Sheets.",
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

export function getDefaultGoogleSheetsAdapterDeps(input: {
  enqueueApproval: GoogleSheetsAdapterDeps["enqueueApproval"];
  platform: AdapterPlatformV1;
}): GoogleSheetsAdapterDeps {
  return {
    platform: input.platform,
    getGoogleRuntime: getGoogleAgentToolRuntimeWithServiceRole,
    executeReadTool: executeGoogleSheetsReadTool,
    executeWriteTool: executeGoogleSheetsWriteToolAction,
    enqueueApproval: input.enqueueApproval,
  };
}
