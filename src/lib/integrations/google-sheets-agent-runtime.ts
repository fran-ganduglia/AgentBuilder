import "server-only";

import {
  getGoogleIntegrationConfig,
  getGoogleRefreshState,
  rotateGoogleTokens,
} from "@/lib/db/google-integration-config";
import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import {
  requestGoogleDrive,
  requestGoogleSheets,
  refreshGoogleAccessToken,
} from "@/lib/integrations/google";
import { assertUsableIntegration } from "@/lib/integrations/access";
import {
  executeGoogleSheetsReadToolSchema,
  executeGoogleSheetsWriteToolSchema,
  isGoogleSheetsActionAllowed,
  normalizeGoogleSpreadsheetId,
  type ExecuteGoogleSheetsReadToolInput,
  type ExecuteGoogleSheetsWriteToolInput,
  type GoogleSheetsAction,
  type GoogleSheetsAgentToolConfig,
  type GoogleSheetsToolAction,
} from "@/lib/integrations/google-agent-tools";
import { getSafeProviderErrorMessage } from "@/lib/integrations/provider-gateway";
import {
  isProviderRequestError,
  type ProviderRequestError,
} from "@/lib/integrations/provider-errors";
import { coordinateIntegrationRefresh } from "@/lib/integrations/refresh-coordination";
import type {
  GoogleAgentRuntimeSafeError,
  GoogleAgentRuntimeSuccess,
} from "@/lib/integrations/google-agent-runtime";

type DbResult<T> = { data: T | null; error: string | null };

const GOOGLE_SHEETS_READ_METHOD_KEY = "google_workspace.sheets.read_requests";
const GOOGLE_SHEETS_WRITE_METHOD_KEY = "google_workspace.sheets.write_requests";
const GOOGLE_DRIVE_METHOD_KEY = "google_workspace.drive.requests";
const GOOGLE_SHEETS_MAX_READ_ROWS = 200;
const GOOGLE_SHEETS_PREVIEW_ROWS = 20;
const GOOGLE_SHEETS_PREVIEW_COLUMNS = 10;

type GoogleSheetsSpreadsheetResponse = {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
      index?: number;
      gridProperties?: {
        rowCount?: number;
        columnCount?: number;
        frozenRowCount?: number;
        frozenColumnCount?: number;
      };
    };
  }>;
  namedRanges?: Array<{
    namedRangeId?: string;
    name?: string;
  }>;
};

type GoogleDriveFileResponse = {
  id?: string;
  name?: string;
  webViewLink?: string;
  capabilities?: {
    canEdit?: boolean;
    canCopy?: boolean;
    canShare?: boolean;
  };
};

type GoogleSheetsValuesResponse = {
  range?: string;
  majorDimension?: string;
  values?: Array<Array<string | number | boolean | null>>;
};

type GoogleSheetsClearResponse = {
  spreadsheetId?: string;
  clearedRange?: string;
};

type GoogleSheetsBatchUpdateResponse = {
  spreadsheetId?: string;
  replies?: Array<Record<string, unknown>>;
};

type GoogleSheetsValuesBatchUpdateResponse = {
  spreadsheetId?: string;
  totalUpdatedRows?: number;
  totalUpdatedColumns?: number;
  totalUpdatedCells?: number;
  totalUpdatedSheets?: number;
  responses?: Array<{
    updatedRange?: string;
    updatedRows?: number;
    updatedColumns?: number;
  }>;
};

type SheetSummary = {
  sheetId: number | null;
  title: string | null;
  index: number | null;
  rowCount: number | null;
  columnCount: number | null;
  frozenRowCount: number | null;
  frozenColumnCount: number | null;
};

type GridIndices = {
  startRowIndex: number;
  endRowIndex?: number;
  startColumnIndex: number;
  endColumnIndex?: number;
};

type TableContext = {
  spreadsheetId: string;
  spreadsheetTitle: string | null;
  sheetName: string;
  sheetId: number;
  tableRangeA1: string | null;
  headerRowIndex: number;
  headerAbsoluteRowNumber: number;
  headers: string[];
  rows: Array<Array<string | number | boolean | null>>;
  recordRows: Array<{
    absoluteRowNumber: number;
    values: Array<string | number | boolean | null>;
    record: Record<string, string | number | boolean | null>;
  }>;
};

export type GoogleSheetsReadToolExecutionResult = {
  action: ExecuteGoogleSheetsReadToolInput["action"];
  requestId: string | null;
  data: Record<string, unknown>;
  summary: string;
};

export type GoogleSheetsWriteToolExecutionResult = {
  action: ExecuteGoogleSheetsWriteToolInput["action"];
  requestId: string | null;
  providerObjectId: string | null;
  providerObjectType: "spreadsheet" | "sheet" | "range";
  data: Record<string, unknown>;
  summary: string;
};

export type GoogleSheetsAgentRuntime = GoogleAgentRuntimeSuccess & {
  surface: "google_sheets";
  config: GoogleSheetsAgentToolConfig;
};

function isAuthFailure(error: unknown): error is ProviderRequestError {
  if (!isProviderRequestError(error)) {
    return false;
  }

  if (error.statusCode === 401) {
    return true;
  }

  if (error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid credentials") ||
    message.includes("token expired") ||
    message.includes("token has been expired") ||
    message.includes("token has been revoked") ||
    message.includes("expired or revoked") ||
    message.includes("invalid_grant") ||
    message.includes("unauthorized")
  );
}

function isPermissionFailure(error: unknown): boolean {
  if (!isProviderRequestError(error) || error.statusCode !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("insufficient authentication scopes") ||
    message.includes("insufficient permissions") ||
    message.includes("permission denied") ||
    message.includes("forbidden") ||
    message.includes("accessnotconfigured") ||
    message.includes("api has not been used in project") ||
    message.includes("it is disabled") ||
    message.includes("enable it by visiting")
  );
}

function getGoogleSheetsProviderErrorMessage(error: unknown, fallback: string): string {
  if (
    isProviderRequestError(error) &&
    error.statusCode === 403 &&
    (() => {
      const message = error.message.toLowerCase();
      return (
        message.includes("accessnotconfigured") ||
        message.includes("api has not been used in project") ||
        message.includes("it is disabled") ||
        message.includes("enable it by visiting")
      );
    })()
  ) {
    return "Google Sheets no puede operar porque la API necesaria no esta habilitada en el proyecto OAuth configurado. Habilitala en Google Cloud Console para ese proyecto y vuelve a intentar.";
  }

  if (isPermissionFailure(error)) {
    return "Google Sheets rechazo la consulta por permisos insuficientes para esta superficie. Reconecta Google Sheets y acepta los scopes solicitados antes de volver a intentar.";
  }

  return getSafeProviderErrorMessage(error, fallback);
}

function assertSpreadsheetId(input: {
  spreadsheetId?: string | null;
  spreadsheetUrl?: string | null;
}): DbResult<string> {
  const spreadsheetId = normalizeGoogleSpreadsheetId(input);
  if (!spreadsheetId) {
    return {
      data: null,
      error: "Debes indicar un spreadsheetId o una URL valida de Google Sheets.",
    };
  }

  return { data: spreadsheetId, error: null };
}

function assertSourceSpreadsheetId(input: {
  sourceSpreadsheetId?: string | null;
  sourceSpreadsheetUrl?: string | null;
}): DbResult<string> {
  const spreadsheetId = normalizeGoogleSpreadsheetId({
    spreadsheetId: input.sourceSpreadsheetId,
    spreadsheetUrl: input.sourceSpreadsheetUrl,
  });

  if (!spreadsheetId) {
    return {
      data: null,
      error:
        "Debes indicar un sourceSpreadsheetId o una URL valida para copiar el spreadsheet.",
    };
  }

  return { data: spreadsheetId, error: null };
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function buildSheetRange(sheetName: string, rangeA1: string): string {
  return `${quoteSheetName(sheetName)}!${rangeA1}`;
}

function buildSheetOnlyRange(sheetName: string): string {
  return quoteSheetName(sheetName);
}

function toSheetSummary(
  value: NonNullable<GoogleSheetsSpreadsheetResponse["sheets"]>[number]
): SheetSummary {
  return {
    sheetId: typeof value.properties?.sheetId === "number" ? value.properties.sheetId : null,
    title: value.properties?.title?.trim() || null,
    index: typeof value.properties?.index === "number" ? value.properties.index : null,
    rowCount:
      typeof value.properties?.gridProperties?.rowCount === "number"
        ? value.properties.gridProperties.rowCount
        : null,
    columnCount:
      typeof value.properties?.gridProperties?.columnCount === "number"
        ? value.properties.gridProperties.columnCount
        : null,
    frozenRowCount:
      typeof value.properties?.gridProperties?.frozenRowCount === "number"
        ? value.properties.gridProperties.frozenRowCount
        : null,
    frozenColumnCount:
      typeof value.properties?.gridProperties?.frozenColumnCount === "number"
        ? value.properties.gridProperties.frozenColumnCount
        : null,
  };
}

function summarizeSheets(sheets: SheetSummary[]): string {
  if (sheets.length === 0) {
    return "Sin hojas visibles.";
  }

  return sheets
    .map((sheet) => `${sheet.title ?? "Sin titulo"} (${sheet.rowCount ?? 0}x${sheet.columnCount ?? 0})`)
    .join(" | ");
}

function summarizeMatrix(values: Array<Array<string | number | boolean | null>>): string {
  if (values.length === 0) {
    return "Sin filas.";
  }

  return values
    .slice(0, 3)
    .map((row) => row.map((cell) => serializeCell(cell)).join(" | "))
    .join(" || ");
}

function serializeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function assertReadRowLimit<T>(values: T[]): DbResult<T[]> {
  if (values.length > GOOGLE_SHEETS_MAX_READ_ROWS) {
    return {
      data: null,
      error:
        "Google Sheets devolvio mas de 200 filas para esta lectura. Reduce el rango antes de volver a intentar.",
    };
  }

  return { data: values, error: null };
}

function buildReadFallback(action: GoogleSheetsToolAction): string {
  switch (action) {
    case "list_sheets":
      return "No se pudo listar las hojas de Google Sheets.";
    case "read_range":
      return "No se pudo leer el rango pedido en Google Sheets.";
    case "get_spreadsheet":
      return "No se pudo obtener la metadata del spreadsheet.";
    case "preview_sheet":
      return "No se pudo previsualizar la hoja.";
    case "read_table":
      return "No se pudo leer la tabla en Google Sheets.";
    case "get_headers":
      return "No se pudieron leer los encabezados de la tabla.";
    case "find_rows":
      return "No se pudieron buscar filas en Google Sheets.";
    default:
      return "No se pudo ejecutar la lectura en Google Sheets.";
  }
}

function buildWriteFallback(action: GoogleSheetsToolAction): string {
  const fallbacks: Record<GoogleSheetsToolAction, string> = {
    list_sheets: "No se pudo listar las hojas de Google Sheets.",
    read_range: "No se pudo leer el rango pedido en Google Sheets.",
    get_spreadsheet: "No se pudo obtener la metadata del spreadsheet.",
    preview_sheet: "No se pudo previsualizar la hoja.",
    read_table: "No se pudo leer la tabla en Google Sheets.",
    get_headers: "No se pudieron leer los encabezados de la tabla.",
    find_rows: "No se pudieron buscar filas en Google Sheets.",
    append_rows: "No se pudo agregar filas en Google Sheets.",
    update_range: "No se pudo actualizar el rango en Google Sheets.",
    clear_range: "No se pudo limpiar el rango en Google Sheets.",
    append_records: "No se pudieron agregar los registros en Google Sheets.",
    update_rows_by_match: "No se pudieron actualizar las filas indicadas.",
    insert_rows: "No se pudieron insertar filas en la hoja.",
    insert_columns: "No se pudieron insertar columnas en la hoja.",
    create_sheet: "No se pudo crear la hoja.",
    rename_sheet: "No se pudo renombrar la hoja.",
    duplicate_sheet: "No se pudo duplicar la hoja.",
    format_range: "No se pudo aplicar formato al rango.",
    auto_resize_columns: "No se pudieron autoajustar las columnas.",
    freeze_rows: "No se pudieron congelar las filas.",
    freeze_columns: "No se pudieron congelar las columnas.",
    set_number_format: "No se pudo definir el formato numerico.",
    sort_range: "No se pudo ordenar el rango.",
    set_basic_filter: "No se pudo crear el filtro basico.",
    clear_basic_filter: "No se pudo limpiar el filtro basico.",
    set_data_validation: "No se pudo definir la validacion de datos.",
    create_named_range: "No se pudo crear el rango nombrado.",
    protect_range: "No se pudo proteger el rango.",
    create_spreadsheet: "No se pudo crear el spreadsheet.",
    copy_spreadsheet: "No se pudo copiar el spreadsheet.",
    delete_rows: "No se pudieron eliminar las filas.",
    delete_columns: "No se pudieron eliminar las columnas.",
    delete_sheet: "No se pudo eliminar la hoja.",
  };

  return fallbacks[action];
}

function normalizeHeader(header: string | number | boolean | null | undefined, index: number): string {
  const raw = serializeCell(header).trim();
  return raw.length > 0 ? raw : `column_${index + 1}`;
}

function columnLabelToIndex(label: string): number {
  return label
    .toUpperCase()
    .split("")
    .reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

function parseA1Range(rangeA1?: string | null): GridIndices {
  if (!rangeA1) {
    return {
      startRowIndex: 0,
      startColumnIndex: 0,
    };
  }

  const sanitized = rangeA1.includes("!") ? rangeA1.split("!").pop() ?? rangeA1 : rangeA1;
  const [startPart, endPart] = sanitized.split(":");
  const partPattern = /^([A-Za-z]+)?(\d+)?$/;
  const startMatch = startPart?.match(partPattern);
  const endMatch = endPart?.match(partPattern);

  const startColumnIndex = startMatch?.[1] ? columnLabelToIndex(startMatch[1]) : 0;
  const startRowIndex = startMatch?.[2] ? Number.parseInt(startMatch[2], 10) - 1 : 0;
  const endColumnIndex = endMatch?.[1]
    ? columnLabelToIndex(endMatch[1]) + 1
    : undefined;
  const endRowIndex = endMatch?.[2]
    ? Number.parseInt(endMatch[2], 10)
    : undefined;

  return {
    startRowIndex,
    endRowIndex,
    startColumnIndex,
    endColumnIndex,
  };
}

function buildGridRange(sheetId: number, rangeA1?: string | null): Record<string, number> {
  const parsed = parseA1Range(rangeA1);
  return {
    sheetId,
    startRowIndex: parsed.startRowIndex,
    ...(typeof parsed.endRowIndex === "number" ? { endRowIndex: parsed.endRowIndex } : {}),
    startColumnIndex: parsed.startColumnIndex,
    ...(typeof parsed.endColumnIndex === "number"
      ? { endColumnIndex: parsed.endColumnIndex }
      : {}),
  };
}

function buildValueRange(
  sheetName: string,
  tableRangeA1?: string | null
): string {
  return tableRangeA1 ? buildSheetRange(sheetName, tableRangeA1) : buildSheetOnlyRange(sheetName);
}

async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string,
  organizationId: string,
  integrationId: string
): Promise<{
  requestId: string | null;
  metadata: GoogleSheetsSpreadsheetResponse;
}> {
  const response = await requestGoogleSheets<GoogleSheetsSpreadsheetResponse>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.sheetId,sheets.properties.title,sheets.properties.index,sheets.properties.gridProperties.rowCount,sheets.properties.gridProperties.columnCount,sheets.properties.gridProperties.frozenRowCount,sheets.properties.gridProperties.frozenColumnCount,namedRanges.namedRangeId,namedRanges.name`,
    { method: "GET" },
    {
      organizationId,
      integrationId,
      methodKey: GOOGLE_SHEETS_READ_METHOD_KEY,
    }
  );

  return { requestId: response.requestId, metadata: response.data };
}

async function fetchDriveFileMetadata(
  accessToken: string,
  spreadsheetId: string,
  organizationId: string,
  integrationId: string
): Promise<{
  requestId: string | null;
  metadata: GoogleDriveFileResponse;
}> {
  const response = await requestGoogleDrive<GoogleDriveFileResponse>(
    accessToken,
    `/files/${encodeURIComponent(spreadsheetId)}?fields=id,name,webViewLink,capabilities(canEdit,canCopy,canShare)`,
    { method: "GET" },
    {
      organizationId,
      integrationId,
      methodKey: GOOGLE_DRIVE_METHOD_KEY,
    }
  );

  return { requestId: response.requestId, metadata: response.data };
}

async function fetchSheetInfo(input: {
  accessToken: string;
  spreadsheetId: string;
  organizationId: string;
  integrationId: string;
  sheetName: string;
}): Promise<{ spreadsheetTitle: string | null; sheet: SheetSummary }> {
  const metadata = await fetchSpreadsheetMetadata(
    input.accessToken,
    input.spreadsheetId,
    input.organizationId,
    input.integrationId
  );
  const sheets = (metadata.metadata.sheets ?? []).map(toSheetSummary);
  const sheet = sheets.find((candidate) => candidate.title === input.sheetName);

  if (!sheet?.title || sheet.sheetId === null) {
    throw new Error(`La hoja "${input.sheetName}" no existe en el spreadsheet indicado.`);
  }

  return {
    spreadsheetTitle: metadata.metadata.properties?.title?.trim() || null,
    sheet,
  };
}

async function readSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  organizationId: string;
  integrationId: string;
}): Promise<{
  requestId: string | null;
  data: GoogleSheetsValuesResponse;
}> {
  const response = await requestGoogleSheets<GoogleSheetsValuesResponse>(
    input.accessToken,
    `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(
      input.range
    )}`,
    { method: "GET" },
    {
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      methodKey: GOOGLE_SHEETS_READ_METHOD_KEY,
    }
  );

  return { requestId: response.requestId, data: response.data };
}

async function batchUpdateSpreadsheet(input: {
  accessToken: string;
  spreadsheetId: string;
  organizationId: string;
  integrationId: string;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
  requests: Record<string, unknown>[];
}): Promise<{
  requestId: string | null;
  data: GoogleSheetsBatchUpdateResponse;
}> {
  const response = await requestGoogleSheets<GoogleSheetsBatchUpdateResponse>(
    input.accessToken,
    `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: input.requests,
      }),
    },
    {
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
      workflowRunId: input.workflow?.workflowRunId,
      workflowStepId: input.workflow?.workflowStepId,
    }
  );

  return { requestId: response.requestId, data: response.data };
}

async function batchUpdateValues(input: {
  accessToken: string;
  spreadsheetId: string;
  organizationId: string;
  integrationId: string;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
  data: Array<{
    range: string;
    majorDimension: "ROWS";
    values: Array<Array<string | number | boolean | null>>;
  }>;
}): Promise<{
  requestId: string | null;
  data: GoogleSheetsValuesBatchUpdateResponse;
}> {
  const response = await requestGoogleSheets<GoogleSheetsValuesBatchUpdateResponse>(
    input.accessToken,
    `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: input.data,
      }),
    },
    {
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
      workflowRunId: input.workflow?.workflowRunId,
      workflowStepId: input.workflow?.workflowStepId,
    }
  );

  return { requestId: response.requestId, data: response.data };
}

async function loadTableContext(input: {
  accessToken: string;
  spreadsheetId: string;
  organizationId: string;
  integrationId: string;
  sheetName: string;
  tableRangeA1?: string | null;
  headerRowIndex?: number;
}): Promise<TableContext> {
  const [sheetInfo, valuesResponse] = await Promise.all([
    fetchSheetInfo(input),
    readSheetValues({
      accessToken: input.accessToken,
      spreadsheetId: input.spreadsheetId,
      range: buildValueRange(input.sheetName, input.tableRangeA1),
      organizationId: input.organizationId,
      integrationId: input.integrationId,
    }),
  ]);

  const rows = valuesResponse.data.values ?? [];
  const rowLimit = assertReadRowLimit(rows);
  if (rowLimit.error || !rowLimit.data) {
    throw new Error(rowLimit.error ?? "sheets_read_limit_exceeded");
  }

  const safeHeaderRowIndex = input.headerRowIndex ?? 1;
  const headerZeroIndex = safeHeaderRowIndex - 1;
  const headerRow = rowLimit.data[headerZeroIndex];

  if (!headerRow) {
    throw new Error("No se encontro la fila de encabezados indicada en la tabla.");
  }

  const headers = headerRow.map((cell, index) => normalizeHeader(cell, index));
  const rangeIndices = parseA1Range(input.tableRangeA1);
  const headerAbsoluteRowNumber = rangeIndices.startRowIndex + safeHeaderRowIndex;

  const recordRows = rowLimit.data
    .slice(headerZeroIndex + 1)
    .map((row, index) => {
      const absoluteRowNumber = headerAbsoluteRowNumber + index + 1;
      const record = headers.reduce<Record<string, string | number | boolean | null>>(
        (accumulator, header, columnIndex) => {
          accumulator[header] =
            (row[columnIndex] as string | number | boolean | null | undefined) ?? null;
          return accumulator;
        },
        {}
      );

      return {
        absoluteRowNumber,
        values: row,
        record,
      };
    });

  return {
    spreadsheetId: input.spreadsheetId,
    spreadsheetTitle: sheetInfo.spreadsheetTitle,
    sheetName: input.sheetName,
    sheetId: sheetInfo.sheet.sheetId as number,
    tableRangeA1: input.tableRangeA1 ?? null,
    headerRowIndex: safeHeaderRowIndex,
    headerAbsoluteRowNumber,
    headers,
    rows: rowLimit.data,
    recordRows,
  };
}

function findMatchingRecordRows(
  table: TableContext,
  match: { column: string; value: string; operator: "equals" }
): Array<{
  absoluteRowNumber: number;
  values: Array<string | number | boolean | null>;
  record: Record<string, string | number | boolean | null>;
}> {
  if (!table.headers.includes(match.column)) {
    throw new Error(`La columna "${match.column}" no existe en la tabla indicada.`);
  }

  return table.recordRows.filter(
    (row) => serializeCell(row.record[match.column]).trim() === match.value.trim()
  );
}

function assertRecordColumns(headers: string[], records: Record<string, unknown>[]): void {
  const unknownColumns = records
    .flatMap((record) => Object.keys(record))
    .filter(
      (column, index, values) =>
        !headers.includes(column) && values.indexOf(column) === index
    );

  if (unknownColumns.length > 0) {
    throw new Error(
      `Las columnas ${unknownColumns.join(", ")} no existen en los encabezados de la tabla.`
    );
  }
}

function buildRowFromRecord(
  headers: string[],
  record: Record<string, string | number | boolean | null>,
  baseRow?: Array<string | number | boolean | null>
): Array<string | number | boolean | null> {
  const seed = [...(baseRow ?? [])];
  const width = Math.max(headers.length, seed.length);

  while (seed.length < width) {
    seed.push(null);
  }

  return headers.map((header, index) =>
    Object.prototype.hasOwnProperty.call(record, header) ? record[header] : seed[index] ?? null
  );
}

function buildFormatFields(format: Record<string, unknown>): string {
  const fields: string[] = [];

  if (format.fill) fields.push("userEnteredFormat.backgroundColor");
  if (format.textColor) fields.push("userEnteredFormat.textFormat.foregroundColor");
  if (typeof format.bold === "boolean") fields.push("userEnteredFormat.textFormat.bold");
  if (typeof format.italic === "boolean") fields.push("userEnteredFormat.textFormat.italic");
  if (typeof format.underline === "boolean") fields.push("userEnteredFormat.textFormat.underline");

  const alignment = format.alignment as Record<string, unknown> | undefined;
  if (alignment?.horizontal) fields.push("userEnteredFormat.horizontalAlignment");
  if (alignment?.vertical) fields.push("userEnteredFormat.verticalAlignment");
  if (format.wrap) fields.push("userEnteredFormat.wrapStrategy");

  const borders = format.borders as Record<string, unknown> | undefined;
  for (const side of ["top", "bottom", "left", "right"]) {
    if (borders?.[side]) {
      fields.push(`userEnteredFormat.borders.${side}`);
    }
  }

  return fields.join(",");
}

function buildSheetsFormat(format: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  if (format.fill) {
    next.backgroundColor = format.fill;
  }

  if (
    format.textColor ||
    typeof format.bold === "boolean" ||
    typeof format.italic === "boolean" ||
    typeof format.underline === "boolean"
  ) {
    next.textFormat = {
      ...(format.textColor ? { foregroundColor: format.textColor } : {}),
      ...(typeof format.bold === "boolean" ? { bold: format.bold } : {}),
      ...(typeof format.italic === "boolean" ? { italic: format.italic } : {}),
      ...(typeof format.underline === "boolean" ? { underline: format.underline } : {}),
    };
  }

  const alignment = format.alignment as Record<string, unknown> | undefined;
  if (alignment?.horizontal) {
    next.horizontalAlignment = alignment.horizontal;
  }
  if (alignment?.vertical) {
    next.verticalAlignment = alignment.vertical;
  }
  if (format.wrap) {
    next.wrapStrategy = format.wrap;
  }

  const borders = format.borders as Record<string, unknown> | undefined;
  if (borders) {
    next.borders = Object.fromEntries(
      Object.entries(borders)
        .filter(([, value]) => value)
        .map(([side, value]) => [side, value])
    );
  }

  return next;
}

function buildConditionFromValidationRule(
  rule: Record<string, unknown>
): Record<string, unknown> {
  if (rule.type === "one_of_list") {
    return {
      type: "ONE_OF_LIST",
      values: (rule.values as string[]).map((value) => ({ userEnteredValue: value })),
    };
  }

  if (rule.type === "checkbox") {
    return {
      type: "BOOLEAN",
      ...(rule.checkedValue
        ? { values: [{ userEnteredValue: String(rule.checkedValue) }] }
        : {}),
    };
  }

  return {
    type: "NUMBER_GREATER",
    values: [{ userEnteredValue: String(rule.value) }],
  };
}

function summarizeMatchedRows(rows: TableContext["recordRows"]): string {
  if (rows.length === 0) {
    return "Sin filas coincidentes.";
  }

  return rows
    .slice(0, 3)
    .map((row) => `fila ${row.absoluteRowNumber}`)
    .join(" | ");
}

export async function runGoogleSheetsReadAction(
  input: ExecuteGoogleSheetsReadToolInput & Record<string, unknown>,
  accessToken: string,
  organizationId: string,
  integrationId: string
): Promise<GoogleSheetsReadToolExecutionResult> {
  const spreadsheetIdResult = assertSpreadsheetId({
    spreadsheetId: "spreadsheetId" in input ? input.spreadsheetId : undefined,
    spreadsheetUrl: "spreadsheetUrl" in input ? input.spreadsheetUrl : undefined,
  });
  if (spreadsheetIdResult.error || !spreadsheetIdResult.data) {
    throw new Error(spreadsheetIdResult.error ?? "spreadsheet_id_missing");
  }

  const spreadsheetId = spreadsheetIdResult.data;

  if (input.action === "list_sheets") {
    const metadata = await fetchSpreadsheetMetadata(
      accessToken,
      spreadsheetId,
      organizationId,
      integrationId
    );
    const sheets = (metadata.metadata.sheets ?? []).map(toSheetSummary);

    return {
      action: "list_sheets",
      requestId: metadata.requestId,
      data: {
        spreadsheetId,
        spreadsheetTitle: metadata.metadata.properties?.title?.trim() || null,
        sheets,
      },
      summary: `Hojas listadas en Google Sheets. Total: ${sheets.length}. Detalle: ${summarizeSheets(sheets)}`,
    };
  }

  if (input.action === "get_spreadsheet") {
    const [metadata, driveFile] = await Promise.all([
      fetchSpreadsheetMetadata(accessToken, spreadsheetId, organizationId, integrationId),
      fetchDriveFileMetadata(accessToken, spreadsheetId, organizationId, integrationId),
    ]);
    const sheets = (metadata.metadata.sheets ?? []).map(toSheetSummary);

    return {
      action: "get_spreadsheet",
      requestId: metadata.requestId ?? driveFile.requestId,
      data: {
        spreadsheetId,
        spreadsheetTitle:
          metadata.metadata.properties?.title?.trim() || driveFile.metadata.name || null,
        webViewLink: driveFile.metadata.webViewLink ?? null,
        capabilities: {
          canEdit: Boolean(driveFile.metadata.capabilities?.canEdit),
          canCopy: Boolean(driveFile.metadata.capabilities?.canCopy),
          canShare: Boolean(driveFile.metadata.capabilities?.canShare),
        },
        namedRanges:
          metadata.metadata.namedRanges?.map((range) => ({
            namedRangeId: range.namedRangeId ?? null,
            name: range.name ?? null,
          })) ?? [],
        sheets,
      },
      summary: `Metadata del spreadsheet obtenida. Titulo: ${
        metadata.metadata.properties?.title?.trim() || driveFile.metadata.name || "Sin titulo"
      }. Hojas: ${sheets.length}.`,
    };
  }

  if (input.action === "read_range") {
    const response = await readSheetValues({
      accessToken,
      spreadsheetId,
      range: buildSheetRange(input.sheetName, input.rangeA1),
      organizationId,
      integrationId,
    });
    const rowLimit = assertReadRowLimit(response.data.values ?? []);
    if (rowLimit.error || !rowLimit.data) {
      throw new Error(rowLimit.error ?? "sheets_read_limit_exceeded");
    }

    return {
      action: "read_range",
      requestId: response.requestId,
      data: {
        spreadsheetId,
        sheetName: input.sheetName,
        rangeA1: input.rangeA1,
        normalizedRange: response.data.range ?? null,
        rowCount: rowLimit.data.length,
        values: rowLimit.data,
      },
      summary: `Rango leido en Google Sheets (${input.sheetName}!${input.rangeA1}). Filas: ${rowLimit.data.length}. Muestra: ${summarizeMatrix(rowLimit.data)}`,
    };
  }

  if (input.action === "preview_sheet") {
    const response = await readSheetValues({
      accessToken,
      spreadsheetId,
      range: buildSheetRange(input.sheetName, `1:${GOOGLE_SHEETS_PREVIEW_ROWS}`),
      organizationId,
      integrationId,
    });
    const values = (response.data.values ?? [])
      .slice(0, GOOGLE_SHEETS_PREVIEW_ROWS)
      .map((row) => row.slice(0, GOOGLE_SHEETS_PREVIEW_COLUMNS));

    return {
      action: "preview_sheet",
      requestId: response.requestId,
      data: {
        spreadsheetId,
        sheetName: input.sheetName,
        rowCount: values.length,
        values,
      },
      summary: `Vista previa generada para la hoja ${input.sheetName}. Filas: ${values.length}. Muestra: ${summarizeMatrix(values)}`,
    };
  }

  const table = await loadTableContext({
    accessToken,
    spreadsheetId,
    organizationId,
    integrationId,
    sheetName: input.sheetName,
    tableRangeA1: input.tableRangeA1,
    headerRowIndex: input.headerRowIndex,
  });

  if (input.action === "get_headers") {
    return {
      action: "get_headers",
      requestId: null,
      data: {
        spreadsheetId,
        sheetName: table.sheetName,
        headerRowIndex: table.headerRowIndex,
        tableRangeA1: table.tableRangeA1,
        headers: table.headers,
      },
      summary: `Encabezados detectados en ${table.sheetName}: ${table.headers.join(" | ")}`,
    };
  }

  if (input.action === "read_table") {
    return {
      action: "read_table",
      requestId: null,
      data: {
        spreadsheetId,
        sheetName: table.sheetName,
        headerRowIndex: table.headerRowIndex,
        tableRangeA1: table.tableRangeA1,
        headers: table.headers,
        rowCount: table.recordRows.length,
        records: table.recordRows.map((row) => ({
          rowIndex: row.absoluteRowNumber,
          ...row.record,
        })),
      },
      summary: `Tabla leida en Google Sheets (${table.sheetName}). Filas: ${table.recordRows.length}. Encabezados: ${table.headers.join(" | ")}`,
    };
  }

  const matches = findMatchingRecordRows(table, input.match);

  return {
    action: "find_rows",
    requestId: null,
    data: {
      spreadsheetId,
      sheetName: table.sheetName,
      match: input.match,
      matchCount: matches.length,
      headers: table.headers,
      rows: matches.map((row) => ({
        rowIndex: row.absoluteRowNumber,
        ...row.record,
      })),
    },
    summary: `Busqueda completada en Google Sheets. Coincidencias: ${matches.length}. ${summarizeMatchedRows(matches)}`,
  };
}

export async function runGoogleSheetsWriteAction(
  input: ExecuteGoogleSheetsWriteToolInput & Record<string, unknown>,
  accessToken: string,
  organizationId: string,
  integrationId: string,
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  }
): Promise<GoogleSheetsWriteToolExecutionResult> {
  if (input.action === "create_spreadsheet") {
    const response = await requestGoogleSheets<{
      spreadsheetId?: string;
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string } }>;
    }>(
      accessToken,
      "/spreadsheets",
      {
        method: "POST",
        body: JSON.stringify({
          properties: { title: input.title },
          ...(input.initialSheetTitle
            ? { sheets: [{ properties: { title: input.initialSheetTitle } }] }
            : {}),
        }),
      },
      {
        organizationId,
        integrationId,
        methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
        workflowRunId: workflow?.workflowRunId,
        workflowStepId: workflow?.workflowStepId,
      }
    );

    return {
      action: "create_spreadsheet",
      requestId: response.requestId,
      providerObjectId: response.data.spreadsheetId ?? null,
      providerObjectType: "spreadsheet",
      data: {
        spreadsheetId: response.data.spreadsheetId ?? null,
        title: response.data.properties?.title?.trim() || input.title,
        initialSheetTitle:
          response.data.sheets?.[0]?.properties?.title ?? input.initialSheetTitle ?? null,
      },
      summary: `Spreadsheet creado en Google Sheets con titulo "${input.title}".`,
    };
  }

  if (input.action === "copy_spreadsheet") {
    const sourceSpreadsheetIdResult = assertSourceSpreadsheetId({
      sourceSpreadsheetId: input.sourceSpreadsheetId,
      sourceSpreadsheetUrl: input.sourceSpreadsheetUrl,
    });
    if (sourceSpreadsheetIdResult.error || !sourceSpreadsheetIdResult.data) {
      throw new Error(sourceSpreadsheetIdResult.error ?? "source_spreadsheet_id_missing");
    }

    const response = await requestGoogleDrive<GoogleDriveFileResponse>(
      accessToken,
      `/files/${encodeURIComponent(sourceSpreadsheetIdResult.data)}/copy?fields=id,name,webViewLink`,
      {
        method: "POST",
        body: JSON.stringify({ name: input.title }),
      },
      {
        organizationId,
        integrationId,
        methodKey: GOOGLE_DRIVE_METHOD_KEY,
        workflowRunId: workflow?.workflowRunId,
        workflowStepId: workflow?.workflowStepId,
      }
    );

    return {
      action: "copy_spreadsheet",
      requestId: response.requestId,
      providerObjectId: response.data.id ?? null,
      providerObjectType: "spreadsheet",
      data: {
        spreadsheetId: response.data.id ?? null,
        title: response.data.name ?? input.title,
        webViewLink: response.data.webViewLink ?? null,
        sourceSpreadsheetId: sourceSpreadsheetIdResult.data,
      },
      summary: `Spreadsheet copiado correctamente con titulo "${input.title}".`,
    };
  }

  const spreadsheetIdResult = assertSpreadsheetId({
    spreadsheetId: "spreadsheetId" in input ? input.spreadsheetId : undefined,
    spreadsheetUrl: "spreadsheetUrl" in input ? input.spreadsheetUrl : undefined,
  });
  if (spreadsheetIdResult.error || !spreadsheetIdResult.data) {
    throw new Error(spreadsheetIdResult.error ?? "spreadsheet_id_missing");
  }

  const spreadsheetId = spreadsheetIdResult.data;

  if (input.action === "clear_range") {
    const response = await requestGoogleSheets<GoogleSheetsClearResponse>(
      accessToken,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
        buildSheetRange(input.sheetName, input.rangeA1)
      )}:clear`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      {
        organizationId,
        integrationId,
        methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
        workflowRunId: workflow?.workflowRunId,
        workflowStepId: workflow?.workflowStepId,
      }
    );

    return {
      action: "clear_range",
      requestId: response.requestId,
      providerObjectId: spreadsheetId,
      providerObjectType: "range",
      data: {
        spreadsheetId,
        sheetName: input.sheetName,
        rangeA1: input.rangeA1,
        clearedRange: response.data.clearedRange ?? null,
      },
      summary: `Rango limpiado en Google Sheets (${input.sheetName}!${input.rangeA1}).`,
    };
  }

  if (input.action === "append_rows" || input.action === "update_range") {
    const endpoint =
      input.action === "append_rows"
        ? `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
            buildSheetRange(input.sheetName, input.rangeA1)
          )}:append?valueInputOption=USER_ENTERED`
        : `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
            buildSheetRange(input.sheetName, input.rangeA1)
          )}?valueInputOption=USER_ENTERED`;
    const method = input.action === "append_rows" ? "POST" : "PUT";

    const response = await requestGoogleSheets<{
      updates?: {
        updatedRange?: string;
        updatedRows?: number;
        updatedColumns?: number;
      };
    }>(
      accessToken,
      endpoint,
      {
        method,
        body: JSON.stringify({
          majorDimension: "ROWS",
          values: input.values,
        }),
      },
      {
        organizationId,
        integrationId,
        methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
        workflowRunId: workflow?.workflowRunId,
        workflowStepId: workflow?.workflowStepId,
      }
    );

    return {
      action: input.action,
      requestId: response.requestId,
      providerObjectId: spreadsheetId,
      providerObjectType: "range",
      data: {
        spreadsheetId,
        sheetName: input.sheetName,
        rangeA1: input.rangeA1,
        updatedRange: response.data.updates?.updatedRange ?? null,
        updatedRows: response.data.updates?.updatedRows ?? input.values.length,
        updatedColumns:
          response.data.updates?.updatedColumns ??
          Math.max(...input.values.map((row: string[]) => row.length), 0),
      },
      summary:
        input.action === "append_rows"
          ? `Filas agregadas en Google Sheets (${input.sheetName}!${input.rangeA1}).`
          : `Rango actualizado en Google Sheets (${input.sheetName}!${input.rangeA1}).`,
    };
  }

  if (
    input.action === "append_records" ||
    input.action === "update_rows_by_match" ||
    input.action === "delete_rows"
  ) {
    const table = await loadTableContext({
      accessToken,
      spreadsheetId,
      organizationId,
      integrationId,
      sheetName: input.sheetName,
      tableRangeA1: input.tableRangeA1,
      headerRowIndex: input.headerRowIndex,
    });

    if (input.action === "append_records") {
      assertRecordColumns(table.headers, input.records);
      const rows = input.records.map((record: Record<string, string | number | boolean | null>) =>
        buildRowFromRecord(
          table.headers,
          record
        )
      );
      const response = await requestGoogleSheets<{
        updates?: {
          updatedRange?: string;
          updatedRows?: number;
          updatedColumns?: number;
        };
      }>(
        accessToken,
        `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
          buildValueRange(table.sheetName, table.tableRangeA1)
        )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({
            majorDimension: "ROWS",
            values: rows,
          }),
        },
        {
          organizationId,
          integrationId,
          methodKey: GOOGLE_SHEETS_WRITE_METHOD_KEY,
          workflowRunId: workflow?.workflowRunId,
          workflowStepId: workflow?.workflowStepId,
        }
      );

      return {
        action: "append_records",
        requestId: response.requestId,
        providerObjectId: spreadsheetId,
        providerObjectType: "range",
        data: {
          spreadsheetId,
          sheetName: table.sheetName,
          recordCount: input.records.length,
          headers: table.headers,
          updatedRange: response.data.updates?.updatedRange ?? null,
        },
        summary: `Registros agregados en Google Sheets. Total: ${input.records.length}.`,
      };
    }

    const matches = findMatchingRecordRows(table, input.match);
    if (matches.length === 0) {
      throw new Error("No se encontraron filas que coincidan con el criterio indicado.");
    }

    if (input.action === "delete_rows") {
      const response = await batchUpdateSpreadsheet({
        accessToken,
        spreadsheetId,
        organizationId,
        integrationId,
        workflow,
        requests: [...matches]
          .sort((left, right) => right.absoluteRowNumber - left.absoluteRowNumber)
          .map((row) => ({
            deleteDimension: {
              range: {
                sheetId: table.sheetId,
                dimension: "ROWS",
                startIndex: row.absoluteRowNumber - 1,
                endIndex: row.absoluteRowNumber,
              },
            },
          })),
      });

      return {
        action: "delete_rows",
        requestId: response.requestId,
        providerObjectId: spreadsheetId,
        providerObjectType: "range",
        data: {
          spreadsheetId,
          sheetName: table.sheetName,
          deletedRowIndexes: matches.map((row) => row.absoluteRowNumber),
          deletedCount: matches.length,
        },
        summary: `Filas eliminadas en Google Sheets. Total: ${matches.length}.`,
      };
    }

    assertRecordColumns(table.headers, input.records);

    if (input.records.length !== 1 && input.records.length !== matches.length) {
      throw new Error(
        "update_rows_by_match requiere un solo registro para aplicar a todas las coincidencias o un registro por fila encontrada."
      );
    }

    const data = matches.map((row, index) => {
      const record =
        (input.records[input.records.length === 1 ? 0 : index] ??
          {}) as Record<string, string | number | boolean | null>;
      const nextRow = buildRowFromRecord(table.headers, record, row.values);

      return {
        range: buildSheetRange(
          table.sheetName,
          `${row.absoluteRowNumber}:${row.absoluteRowNumber}`
        ),
        majorDimension: "ROWS" as const,
        values: [nextRow],
      };
    });

    const response = await batchUpdateValues({
      accessToken,
      spreadsheetId,
      organizationId,
      integrationId,
      workflow,
      data,
    });

    return {
      action: "update_rows_by_match",
      requestId: response.requestId,
      providerObjectId: spreadsheetId,
      providerObjectType: "range",
      data: {
        spreadsheetId,
        sheetName: table.sheetName,
        updatedRowIndexes: matches.map((row) => row.absoluteRowNumber),
        updatedCount: matches.length,
      },
      summary: `Filas actualizadas por criterio en Google Sheets. Coincidencias: ${matches.length}.`,
    };
  }

  if (
    input.action === "create_sheet" ||
    input.action === "rename_sheet" ||
    input.action === "duplicate_sheet" ||
    input.action === "delete_sheet" ||
    input.action === "insert_rows" ||
    input.action === "insert_columns" ||
    input.action === "format_range" ||
    input.action === "auto_resize_columns" ||
    input.action === "freeze_rows" ||
    input.action === "freeze_columns" ||
    input.action === "set_number_format" ||
    input.action === "sort_range" ||
    input.action === "set_basic_filter" ||
    input.action === "clear_basic_filter" ||
    input.action === "set_data_validation" ||
    input.action === "create_named_range" ||
    input.action === "protect_range" ||
    input.action === "delete_columns"
  ) {
    const sheetName =
      "sheetName" in input && typeof input.sheetName === "string" ? input.sheetName : null;
    const sheetInfo =
      sheetName && input.action !== "create_sheet"
        ? await fetchSheetInfo({
            accessToken,
            spreadsheetId,
            organizationId,
            integrationId,
            sheetName,
          })
        : null;

    const sheetId = sheetInfo?.sheet.sheetId ?? null;
    const requests: Record<string, unknown>[] = [];
    let providerObjectType: GoogleSheetsWriteToolExecutionResult["providerObjectType"] =
      "spreadsheet";
    let summary = "Operacion completada en Google Sheets.";
    let data: Record<string, unknown> = { spreadsheetId };

    switch (input.action) {
      case "create_sheet":
        requests.push({
          addSheet: {
            properties: {
              title: input.title,
              ...(input.rowCount || input.columnCount
                ? {
                    gridProperties: {
                      ...(input.rowCount ? { rowCount: input.rowCount } : {}),
                      ...(input.columnCount ? { columnCount: input.columnCount } : {}),
                    },
                  }
                : {}),
            },
          },
        });
        summary = `Hoja creada en Google Sheets con nombre "${input.title}".`;
        data = { spreadsheetId, title: input.title };
        providerObjectType = "sheet";
        break;
      case "rename_sheet":
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              title: input.newSheetName,
            },
            fields: "title",
          },
        });
        summary = `Hoja "${input.sheetName}" renombrada a "${input.newSheetName}".`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          newSheetName: input.newSheetName,
        };
        providerObjectType = "sheet";
        break;
      case "duplicate_sheet":
        requests.push({
          duplicateSheet: {
            sourceSheetId: sheetId,
            ...(input.newSheetName ? { newSheetName: input.newSheetName } : {}),
          },
        });
        summary = `Hoja "${input.sheetName}" duplicada correctamente.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          newSheetName: input.newSheetName ?? null,
        };
        providerObjectType = "sheet";
        break;
      case "delete_sheet":
        requests.push({
          deleteSheet: {
            sheetId,
          },
        });
        summary = `Hoja "${input.sheetName}" eliminada correctamente.`;
        data = { spreadsheetId, sheetName: input.sheetName };
        providerObjectType = "sheet";
        break;
      case "insert_rows":
        requests.push({
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: input.startRowIndex,
              endIndex: input.startRowIndex + input.rowCount,
            },
            inheritFromBefore: input.startRowIndex > 0,
          },
        });
        summary = `Filas insertadas en la hoja ${input.sheetName}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          startRowIndex: input.startRowIndex,
          rowCount: input.rowCount,
        };
        providerObjectType = "range";
        break;
      case "insert_columns":
        requests.push({
          insertDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: input.startColumnIndex,
              endIndex: input.startColumnIndex + input.columnCount,
            },
            inheritFromBefore: input.startColumnIndex > 0,
          },
        });
        summary = `Columnas insertadas en la hoja ${input.sheetName}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          startColumnIndex: input.startColumnIndex,
          columnCount: input.columnCount,
        };
        providerObjectType = "range";
        break;
      case "delete_columns":
        requests.push({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: input.startColumnIndex,
              endIndex: input.startColumnIndex + input.columnCount,
            },
          },
        });
        summary = `Columnas eliminadas en la hoja ${input.sheetName}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          startColumnIndex: input.startColumnIndex,
          columnCount: input.columnCount,
        };
        providerObjectType = "range";
        break;
      case "format_range":
        requests.push({
          repeatCell: {
            range: buildGridRange(sheetId as number, input.rangeA1),
            cell: {
              userEnteredFormat: buildSheetsFormat(input.format),
            },
            fields: buildFormatFields(input.format),
          },
        });
        summary = `Formato aplicado al rango ${input.sheetName}!${input.rangeA1}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          rangeA1: input.rangeA1,
        };
        providerObjectType = "range";
        break;
      case "auto_resize_columns":
        requests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: input.startColumnIndex,
              endIndex: input.startColumnIndex + input.columnCount,
            },
          },
        });
        summary = `Columnas autoajustadas en la hoja ${input.sheetName}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          startColumnIndex: input.startColumnIndex,
          columnCount: input.columnCount,
        };
        providerObjectType = "range";
        break;
      case "freeze_rows":
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: input.count,
              },
            },
            fields: "gridProperties.frozenRowCount",
          },
        });
        summary = `Filas congeladas actualizadas en ${input.sheetName}.`;
        data = { spreadsheetId, sheetName: input.sheetName, count: input.count };
        providerObjectType = "sheet";
        break;
      case "freeze_columns":
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenColumnCount: input.count,
              },
            },
            fields: "gridProperties.frozenColumnCount",
          },
        });
        summary = `Columnas congeladas actualizadas en ${input.sheetName}.`;
        data = { spreadsheetId, sheetName: input.sheetName, count: input.count };
        providerObjectType = "sheet";
        break;
      case "set_number_format":
        requests.push({
          repeatCell: {
            range: buildGridRange(sheetId as number, input.rangeA1),
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: input.type,
                  pattern: input.pattern,
                },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        });
        summary = `Formato numerico aplicado al rango ${input.sheetName}!${input.rangeA1}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          rangeA1: input.rangeA1,
          type: input.type,
          pattern: input.pattern,
        };
        providerObjectType = "range";
        break;
      case "sort_range":
        requests.push({
          sortRange: {
            range: buildGridRange(sheetId as number, input.rangeA1),
            sortSpecs: input.sortSpecs,
          },
        });
        summary = `Rango ordenado en ${input.sheetName}!${input.rangeA1}.`;
        data = { spreadsheetId, sheetName: input.sheetName, rangeA1: input.rangeA1 };
        providerObjectType = "range";
        break;
      case "set_basic_filter":
        requests.push({
          setBasicFilter: {
            filter: {
              range: buildGridRange(sheetId as number, input.rangeA1 ?? null),
            },
          },
        });
        summary = `Filtro basico aplicado en la hoja ${input.sheetName}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          rangeA1: input.rangeA1 ?? null,
        };
        providerObjectType = "range";
        break;
      case "clear_basic_filter":
        requests.push({
          clearBasicFilter: {
            sheetId,
          },
        });
        summary = `Filtro basico limpiado en la hoja ${input.sheetName}.`;
        data = { spreadsheetId, sheetName: input.sheetName };
        providerObjectType = "sheet";
        break;
      case "set_data_validation":
        requests.push({
          setDataValidation: {
            range: buildGridRange(sheetId as number, input.rangeA1),
            rule: {
              condition: buildConditionFromValidationRule(input.rule),
              strict: input.rule.allowInvalid !== true,
              showCustomUi: true,
              inputMessage:
                typeof input.rule.inputMessage === "string"
                  ? input.rule.inputMessage
                  : undefined,
            },
          },
        });
        summary = `Validacion de datos aplicada al rango ${input.sheetName}!${input.rangeA1}.`;
        data = { spreadsheetId, sheetName: input.sheetName, rangeA1: input.rangeA1 };
        providerObjectType = "range";
        break;
      case "create_named_range":
        requests.push({
          addNamedRange: {
            namedRange: {
              name: input.name,
              range: buildGridRange(sheetId as number, input.rangeA1),
            },
          },
        });
        summary = `Named range "${input.name}" creado correctamente.`;
        data = {
          spreadsheetId,
          name: input.name,
          sheetName: input.sheetName,
          rangeA1: input.rangeA1,
        };
        providerObjectType = "range";
        break;
      case "protect_range":
        requests.push({
          addProtectedRange: {
            protectedRange: {
              range: buildGridRange(sheetId as number, input.rangeA1),
              warningOnly: input.warningOnly === true,
            },
          },
        });
        summary = `Proteccion aplicada al rango ${input.sheetName}!${input.rangeA1}.`;
        data = {
          spreadsheetId,
          sheetName: input.sheetName,
          rangeA1: input.rangeA1,
          warningOnly: input.warningOnly === true,
        };
        providerObjectType = "range";
        break;
    }

    const response = await batchUpdateSpreadsheet({
      accessToken,
      spreadsheetId,
      organizationId,
      integrationId,
      workflow,
      requests,
    });

    return {
      action: input.action,
      requestId: response.requestId,
      providerObjectId: spreadsheetId,
      providerObjectType,
      data,
      summary,
    };
  }

  throw new Error("Accion de Google Sheets no soportada.");
}

async function refreshGoogleCredentials(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  refreshToken: string;
}): Promise<DbResult<{ accessToken: string }>> {
  try {
    const currentConfigResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );

    if (currentConfigResult.error || !currentConfigResult.data) {
      return {
        data: null,
        error:
          currentConfigResult.error ?? "No se pudo leer la configuracion de Google Sheets",
      };
    }

    const currentConfig = currentConfigResult.data;
    const coordination = await coordinateIntegrationRefresh({
      provider: "google",
      integrationId: input.integrationId,
      loadState: async () => {
        const stateResult = await getGoogleRefreshState(
          input.integrationId,
          input.organizationId
        );
        return stateResult.data ?? { tokenGeneration: 0, authStatus: null };
      },
      refresh: async () => {
        const refreshResult = await refreshGoogleAccessToken(input.refreshToken);
        const rotatedResult = await rotateGoogleTokens({
          integrationId: input.integrationId,
          organizationId: input.organizationId,
          userId: input.userId,
          accessToken: refreshResult.accessToken,
          ...(refreshResult.refreshToken !== null
            ? { refreshToken: refreshResult.refreshToken }
            : {}),
          grantedScopes: refreshResult.grantedScopes,
          accessTokenExpiresAt: refreshResult.accessTokenExpiresAt,
          connectedEmail: refreshResult.connectedEmail,
          workspaceCustomerId: refreshResult.workspaceCustomerId,
          tokenType: refreshResult.tokenType,
          googleCalendarPrimaryTimezone: currentConfig.googleCalendarPrimaryTimezone,
          googleCalendarUserTimezone: currentConfig.googleCalendarUserTimezone,
        });

        if (rotatedResult.error) {
          throw new Error(rotatedResult.error);
        }
      },
    });

    if (coordination.kind === "timeout") {
      return {
        data: null,
        error:
          "Google Sheets esta refrescando credenciales en otro request. Reintenta en unos segundos.",
      };
    }

    const configResult = await getGoogleIntegrationConfig(
      input.integrationId,
      input.organizationId
    );

    if (configResult.error || !configResult.data) {
      return {
        data: null,
        error: configResult.error ?? "No se pudo recargar Google Sheets",
      };
    }

    if (
      coordination.kind === "follower" &&
      configResult.data.authStatus === "reauth_required"
    ) {
      return {
        data: null,
        error: "La integracion necesita reautenticacion antes de volver a operar.",
      };
    }

    return { data: { accessToken: configResult.data.accessToken }, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo refrescar la sesion de Google Sheets",
    };
  }
}

export function assertGoogleSheetsRuntimeUsable(
  runtime: GoogleAgentRuntimeSuccess
): DbResult<GoogleSheetsAgentRuntime> {
  if (runtime.surface !== "google_sheets") {
    return { data: null, error: "La surface Google Sheets no esta disponible." };
  }

  const access = assertUsableIntegration(runtime.integration);
  return access.ok
    ? { data: runtime as GoogleSheetsAgentRuntime, error: null }
    : { data: null, error: access.message };
}

export function assertGoogleSheetsActionEnabled(
  runtime: GoogleSheetsAgentRuntime,
  action: GoogleSheetsToolAction
): DbResult<GoogleSheetsAgentRuntime> {
  if (!isGoogleSheetsActionAllowed(runtime.config, action)) {
    return {
      data: null,
      error: "La accion pedida no esta habilitada para este agente.",
    };
  }

  return { data: runtime, error: null };
}

export function formatGoogleSheetsReadResultForPrompt(
  result: GoogleSheetsReadToolExecutionResult
): string {
  const lines = [
    "CONTENIDO EXTERNO NO CONFIABLE: GOOGLE_SHEETS",
    "<google_sheets_external_content>",
    "provider=google_sheets",
    `action=${result.action}`,
  ];

  for (const [key, value] of Object.entries(result.data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}_count=${value.length}`);
      value.slice(0, 10).forEach((entry, index) => {
        lines.push(`${key}_${index + 1}=${JSON.stringify(entry)}`);
      });
      continue;
    }

    lines.push(`${key}=${JSON.stringify(value)}`);
  }

  lines.push("</google_sheets_external_content>");
  return lines.join("\n");
}

export const executeGoogleSheetsReadTool = async (input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleSheetsAgentRuntime;
  actionInput: ExecuteGoogleSheetsReadToolInput;
}): Promise<DbResult<GoogleSheetsReadToolExecutionResult>> => {
  const parsedInput = executeGoogleSheetsReadToolSchema.safeParse(input.actionInput);
  if (!parsedInput.success) {
    return { data: null, error: "La consulta de Google Sheets no es valida." };
  }

  const actionEnabled = assertGoogleSheetsActionEnabled(
    input.runtime,
    parsedInput.data.action as GoogleSheetsToolAction
  );
  if (actionEnabled.error || !actionEnabled.data) {
    return { data: null, error: actionEnabled.error };
  }

  const configResult = await getGoogleIntegrationConfig(
    actionEnabled.data.integration.id,
    input.organizationId
  );
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        configResult.error
      );
    }

    return {
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    };
  }

  let accessToken = configResult.data.accessToken;

  try {
    const result = await runGoogleSheetsReadAction(
      parsedInput.data,
      accessToken,
      input.organizationId,
      actionEnabled.data.integration.id
    );
    return { data: result, error: null };
  } catch (error) {
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshGoogleCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: actionEnabled.data.integration.id,
        refreshToken: configResult.data.refreshToken,
      });

      if (!refreshResult.error && refreshResult.data) {
        accessToken = refreshResult.data.accessToken;

        try {
          const retried = await runGoogleSheetsReadAction(
            parsedInput.data,
            accessToken,
            input.organizationId,
            actionEnabled.data.integration.id
          );
          return { data: retried, error: null };
        } catch (retryError) {
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(
              actionEnabled.data.integration.id,
              input.organizationId,
              retryError.message
            );
          }

          return {
            data: null,
            error: getGoogleSheetsProviderErrorMessage(
              retryError,
              buildReadFallback(parsedInput.data.action as GoogleSheetsToolAction)
            ),
          };
        }
      }

      if (
        refreshResult.error?.includes("reautenticacion") ||
        refreshResult.error?.includes("refresh")
      ) {
        await markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          refreshResult.error
        );
      }

      return {
        data: null,
        error:
          refreshResult.error ??
          buildReadFallback(parsedInput.data.action as GoogleSheetsToolAction),
      };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        error.message
      );
    }

    return {
      data: null,
      error: getGoogleSheetsProviderErrorMessage(
        error,
        buildReadFallback(parsedInput.data.action as GoogleSheetsToolAction)
      ),
    };
  }
};

export async function executeGoogleSheetsWriteToolAction(input: {
  organizationId: string;
  userId: string;
  agentId: string;
  runtime: GoogleSheetsAgentRuntime;
  actionInput: ExecuteGoogleSheetsWriteToolInput;
  workflow?: {
    workflowRunId: string;
    workflowStepId: string;
  };
}): Promise<DbResult<GoogleSheetsWriteToolExecutionResult>> {
  const parsedInput = executeGoogleSheetsWriteToolSchema.safeParse(input.actionInput);
  if (!parsedInput.success) {
    return { data: null, error: "La accion de Google Sheets no es valida." };
  }

  const actionEnabled = assertGoogleSheetsActionEnabled(
    input.runtime,
    parsedInput.data.action as GoogleSheetsToolAction
  );
  if (actionEnabled.error || !actionEnabled.data) {
    return { data: null, error: actionEnabled.error };
  }

  const configResult = await getGoogleIntegrationConfig(
    actionEnabled.data.integration.id,
    input.organizationId
  );
  if (configResult.error || !configResult.data) {
    if (configResult.error) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        configResult.error
      );
    }

    return {
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    };
  }

  let accessToken = configResult.data.accessToken;

  try {
    const result = await runGoogleSheetsWriteAction(
      parsedInput.data,
      accessToken,
      input.organizationId,
      actionEnabled.data.integration.id,
      input.workflow
    );
    return { data: result, error: null };
  } catch (error) {
    if (isAuthFailure(error) && configResult.data.refreshToken) {
      const refreshResult = await refreshGoogleCredentials({
        organizationId: input.organizationId,
        userId: input.userId,
        integrationId: actionEnabled.data.integration.id,
        refreshToken: configResult.data.refreshToken,
      });

      if (!refreshResult.error && refreshResult.data) {
        accessToken = refreshResult.data.accessToken;

        try {
          const retried = await runGoogleSheetsWriteAction(
            parsedInput.data,
            accessToken,
            input.organizationId,
            actionEnabled.data.integration.id,
            input.workflow
          );
          return { data: retried, error: null };
        } catch (retryError) {
          if (isAuthFailure(retryError)) {
            await markIntegrationReauthRequired(
              actionEnabled.data.integration.id,
              input.organizationId,
              retryError.message
            );
          }

          return {
            data: null,
            error: getGoogleSheetsProviderErrorMessage(
              retryError,
              buildWriteFallback(parsedInput.data.action as GoogleSheetsToolAction)
            ),
          };
        }
      }

      if (
        refreshResult.error?.includes("reautenticacion") ||
        refreshResult.error?.includes("refresh")
      ) {
        await markIntegrationReauthRequired(
          actionEnabled.data.integration.id,
          input.organizationId,
          refreshResult.error
        );
      }

      return {
        data: null,
        error:
          refreshResult.error ??
          buildWriteFallback(parsedInput.data.action as GoogleSheetsToolAction),
      };
    }

    if (isAuthFailure(error)) {
      await markIntegrationReauthRequired(
        actionEnabled.data.integration.id,
        input.organizationId,
        error.message
      );
    }

    return {
      data: null,
      error: getGoogleSheetsProviderErrorMessage(
        error,
        buildWriteFallback(parsedInput.data.action as GoogleSheetsToolAction)
      ),
    };
  }
}

export function toGoogleSheetsRuntimeSafeError(
  error: string,
  action?: GoogleSheetsAction
): GoogleAgentRuntimeSafeError {
  if (error.includes("reautenticacion")) {
    return {
      ok: false,
      surface: "google_sheets",
      action,
      code: "integration_unavailable",
      message: "La integracion necesita reautenticacion antes de volver a operar.",
      retryable: false,
    };
  }

  if (error.includes("scope") || error.includes("permisos insuficientes")) {
    return {
      ok: false,
      surface: "google_sheets",
      action,
      code: "integration_unavailable",
      message: error,
      retryable: false,
    };
  }

  if (
    error.includes("no es valida") ||
    error.includes("spreadsheetId") ||
    error.includes("URL valida") ||
    error.includes("200 filas") ||
    error.includes("no existe") ||
    error.includes("No se encontraron filas") ||
    error.includes("columnas")
  ) {
    return {
      ok: false,
      surface: "google_sheets",
      action,
      code: "validation_error",
      message: error,
      retryable: false,
    };
  }

  return {
    ok: false,
    surface: "google_sheets",
    action,
    code: "provider_error",
    message: error,
    retryable: true,
  };
}
