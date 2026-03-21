import {
  getGoogleCalendarActionLabel,
  getGoogleSheetsActionLabel,
  getGmailActionLabel,
} from "@/lib/integrations/google-agent-tools";
import {
  getSalesforceActionLabel,
  type SalesforceCrmAction,
} from "@/lib/integrations/salesforce-tools";
import type { DynamicFormDefinition, DynamicFormFieldDefinition, DynamicFormFieldUi } from "@/lib/chat/interactive-markers";
import { buildDynamicFormMarker } from "@/lib/chat/interactive-markers";
import type { PendingChatFormState } from "@/lib/chat/chat-form-state";
import { SALESFORCE_ACTION_PARAM_HINTS } from "@/lib/tools/tool-definitions";
import type { ParsedToolName } from "@/lib/tools/tool-name-registry";

type FormContract = {
  title: string;
  message: string;
  fields: DynamicFormFieldDefinition[];
};

const INTERNAL_REFERENCE_KEYS = new Set([
  "action",
  "threadId",
  "messageId",
  "rfcMessageId",
  "eventId",
  "eventTitle",
  "eventStartIso",
  "eventEndIso",
  "eventTimezone",
  "leadId",
  "caseId",
  "opportunityId",
  "contactId",
  "accountId",
  "accountName",
  "ownerId",
  "whoId",
  "whatId",
  "spreadsheetId",
]);

const LIST_TEXT_KEYS = new Set([
  "to",
  "cc",
  "bcc",
  "links",
  "attendeeEmails",
  "attachmentPaths",
]);

function buildTextField(
  key: string,
  label: string,
  required: boolean,
  type: DynamicFormFieldDefinition["type"] = "text"
): DynamicFormFieldDefinition {
  return { key, type, label, required };
}

function buildTextareaField(
  key: string,
  label: string,
  required: boolean
): DynamicFormFieldDefinition {
  return { key, type: "textarea", label, required };
}

function toStringValue(value: unknown, key: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (key === "attachmentPaths") {
    return null;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (key === "values") {
      const rows = value
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) =>
          row
            .map((cell) =>
              typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean"
                ? String(cell)
                : ""
            )
            .join(" | ")
        )
        .filter((row) => row.trim().length > 0);
      return rows.length > 0 ? rows.join("\n") : null;
    }

    const items = value
      .map((entry) =>
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
          ? String(entry).trim()
          : ""
      )
      .filter((entry) => entry.length > 0);

    return items.length > 0 ? items.join("\n") : null;
  }

  return null;
}

function buildInitialValues(
  definition: DynamicFormDefinition,
  rawArgs: Record<string, unknown>
): Record<string, string> {
  const initialValues: Record<string, string> = {};

  for (const field of definition.fields) {
    const serialized = toStringValue(rawArgs[field.key], field.key);
    if (serialized) {
      initialValues[field.key] = serialized;
    }
  }

  return initialValues;
}

function buildFieldUi(
  definition: DynamicFormDefinition,
  initialValues: Record<string, string>
): Record<string, DynamicFormFieldUi> {
  const fieldUi: Record<string, DynamicFormFieldUi> = {};

  for (const field of definition.fields) {
    if (field.key === "action") {
      fieldUi[field.key] = { hidden: true, readOnly: true };
      continue;
    }

    if (INTERNAL_REFERENCE_KEYS.has(field.key) && initialValues[field.key]) {
      fieldUi[field.key] = { hidden: true, readOnly: true };
    }
  }

  return fieldUi;
}

function humanizeKey(key: string): string {
  const base = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function buildGmailContract(action: string): FormContract | null {
  switch (action) {
    case "create_draft_reply":
      return {
        title: getGmailActionLabel("create_draft_reply"),
        message: "Completa los datos faltantes para preparar el borrador de respuesta.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("threadId", "Thread ID", true),
          buildTextField("messageId", "Message ID", true),
          buildTextField("rfcMessageId", "RFC Message ID", false),
          buildTextareaField("body", "Mensaje", true),
          buildTextareaField("cc", "CC (uno por linea o separados por coma)", false),
          buildTextareaField("bcc", "BCC (uno por linea o separados por coma)", false),
          buildTextareaField("links", "Links (uno por linea o separados por coma)", false),
          {
            key: "attachmentPaths",
            type: "file",
            label: "Adjuntos",
            required: false,
            accept: "application/pdf,image/*,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation",
            maxFiles: 3,
          },
        ],
      };
    case "send_reply":
      return {
        title: getGmailActionLabel("send_reply"),
        message: "Completa los datos faltantes para enviar la respuesta.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("threadId", "Thread ID", true),
          buildTextField("messageId", "Message ID", true),
          buildTextField("rfcMessageId", "RFC Message ID", false),
          buildTextareaField("body", "Mensaje", true),
          buildTextareaField("cc", "CC (uno por linea o separados por coma)", false),
          buildTextareaField("bcc", "BCC (uno por linea o separados por coma)", false),
          buildTextareaField("links", "Links (uno por linea o separados por coma)", false),
          {
            key: "attachmentPaths",
            type: "file",
            label: "Adjuntos",
            required: false,
            accept: "application/pdf,image/*,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation",
            maxFiles: 3,
          },
        ],
      };
    case "create_draft_email":
    case "send_email":
      return {
        title: getGmailActionLabel(action === "send_email" ? "send_email" : "create_draft_email"),
        message:
          action === "send_email"
            ? "Completa los datos faltantes para enviar el email."
            : "Completa los datos faltantes para preparar el borrador.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextareaField("to", "Para (uno por linea o separados por coma)", true),
          buildTextareaField("cc", "CC (uno por linea o separados por coma)", false),
          buildTextareaField("bcc", "BCC (uno por linea o separados por coma)", false),
          buildTextField("subject", "Asunto", false),
          buildTextareaField("body", "Mensaje", true),
          buildTextareaField("links", "Links (uno por linea o separados por coma)", false),
          {
            key: "attachmentPaths",
            type: "file",
            label: "Adjuntos",
            required: false,
            accept: "application/pdf,image/*,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation",
            maxFiles: 3,
          },
        ],
      };
    case "archive_thread":
      return {
        title: getGmailActionLabel("archive_thread"),
        message: "Completa o confirma los datos faltantes para archivar el thread.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("threadId", "Thread ID", true),
          buildTextField("messageId", "Message ID", true),
          buildTextField("rfcMessageId", "RFC Message ID", false),
          buildTextField("subject", "Asunto", false),
        ],
      };
    case "apply_label":
      return {
        title: getGmailActionLabel("apply_label"),
        message: "Completa los datos faltantes para aplicar el label.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("threadId", "Thread ID", true),
          buildTextField("messageId", "Message ID", true),
          buildTextField("rfcMessageId", "RFC Message ID", false),
          buildTextField("subject", "Asunto", false),
          buildTextField("labelName", "Label", true),
        ],
      };
    default:
      return null;
  }
}

function buildGoogleCalendarContract(action: string): FormContract | null {
  switch (action) {
    case "check_availability":
    case "list_events":
      return {
        title: getGoogleCalendarActionLabel(
          action === "check_availability" ? "check_availability" : "list_events"
        ),
        message: "Completa la ventana de tiempo para continuar con Google Calendar.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("timezone", "Timezone (ej. America/Argentina/Buenos_Aires)", true),
          buildTextField("startIso", "Inicio (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          buildTextField("endIso", "Fin (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          ...(action === "check_availability"
            ? [buildTextField("slotMinutes", "Duracion por bloque (min)", false)]
            : [buildTextField("maxResults", "Maximo de resultados", false)]),
        ],
      };
    case "create_event":
      return {
        title: getGoogleCalendarActionLabel("create_event"),
        message: "Completa los datos faltantes para crear el evento.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("title", "Titulo", true),
          buildTextField("timezone", "Timezone (ej. America/Argentina/Buenos_Aires)", true),
          buildTextField("startIso", "Inicio (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          buildTextField("endIso", "Fin (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          buildTextareaField("description", "Descripcion", false),
          buildTextField("location", "Ubicacion", false),
          buildTextareaField("attendeeEmails", "Invitados (uno por linea o separados por coma)", false),
        ],
      };
    case "reschedule_event":
      return {
        title: getGoogleCalendarActionLabel("reschedule_event"),
        message: "Completa los datos faltantes para reprogramar el evento.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("eventId", "Event ID", true),
          buildTextField("eventTitle", "Titulo actual", false),
          buildTextField("timezone", "Timezone (ej. America/Argentina/Buenos_Aires)", true),
          buildTextField("startIso", "Nuevo inicio (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          buildTextField("endIso", "Nuevo fin (AAAA-MM-DDTHH:mm)", true, "datetime-local"),
          buildTextField("title", "Nuevo titulo", false),
          buildTextareaField("description", "Descripcion", false),
          buildTextField("location", "Ubicacion", false),
          buildTextareaField("attendeeEmails", "Invitados (uno por linea o separados por coma)", false),
        ],
      };
    case "cancel_event":
      return {
        title: getGoogleCalendarActionLabel("cancel_event"),
        message: "Completa los datos faltantes para cancelar el evento.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("eventId", "Event ID", true),
          buildTextField("eventTitle", "Titulo del evento", false),
        ],
      };
    default:
      return null;
  }
}

function buildGoogleSheetsContract(action: string): FormContract | null {
  switch (action) {
    case "list_sheets":
    case "get_spreadsheet":
      return {
        title: getGoogleSheetsActionLabel(
          action === "get_spreadsheet" ? "get_spreadsheet" : "list_sheets"
        ),
        message: "Completa el spreadsheet a consultar.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
        ],
      };
    case "read_range":
    case "preview_sheet":
      return {
        title: getGoogleSheetsActionLabel(
          action === "preview_sheet" ? "preview_sheet" : "read_range"
        ),
        message:
          action === "preview_sheet"
            ? "Completa los datos faltantes para previsualizar la hoja."
            : "Completa los datos faltantes para leer el rango.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
          buildTextField("sheetName", "Pestana", true),
          ...(action === "preview_sheet"
            ? []
            : [buildTextField("rangeA1", "Rango A1", true)]),
        ],
      };
    case "read_table":
    case "get_headers":
    case "find_rows":
    case "append_records":
    case "update_rows_by_match":
    case "delete_rows":
      return {
        title: getGoogleSheetsActionLabel(action as never),
        message:
          action === "find_rows"
            ? "Completa los datos faltantes para buscar filas."
            : action === "get_headers"
              ? "Completa los datos faltantes para leer encabezados."
              : action === "read_table"
                ? "Completa los datos faltantes para leer la tabla."
                : action === "delete_rows"
                  ? "Completa los datos faltantes para eliminar filas."
                  : "Completa los datos faltantes para operar sobre la tabla.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
          buildTextField("sheetName", "Pestana", true),
          buildTextField("headerRowIndex", "Fila de encabezados", false),
          buildTextField("tableRangeA1", "Rango de tabla (opcional)", false),
          ...(["find_rows", "update_rows_by_match", "delete_rows"].includes(action)
            ? [
                buildTextField("match.column", "Columna a comparar", true),
                buildTextField("match.value", "Valor a comparar", true),
              ]
            : []),
          ...(["append_records", "update_rows_by_match"].includes(action)
            ? [
                buildTextareaField(
                  "records",
                  "Registros JSON (array de objetos)",
                  true
                ),
              ]
            : []),
        ],
      };
    case "append_rows":
    case "update_range":
    case "clear_range":
    case "format_range":
    case "set_number_format":
    case "sort_range":
    case "set_data_validation":
    case "create_named_range":
    case "protect_range":
      return {
        title: getGoogleSheetsActionLabel(
          action === "append_rows"
            ? "append_rows"
            : action === "update_range"
              ? "update_range"
              : action === "clear_range"
                ? "clear_range"
                : action === "format_range"
                  ? "format_range"
                  : action === "set_number_format"
                    ? "set_number_format"
                    : action === "sort_range"
                      ? "sort_range"
                      : action === "set_data_validation"
                        ? "set_data_validation"
                        : action === "create_named_range"
                          ? "create_named_range"
                          : "protect_range"
        ),
        message:
          action === "clear_range"
            ? "Completa los datos faltantes para limpiar el rango."
            : action === "format_range"
              ? "Completa los datos faltantes para formatear el rango."
              : action === "set_number_format"
                ? "Completa los datos faltantes para definir el formato numerico."
                : action === "sort_range"
                  ? "Completa los datos faltantes para ordenar el rango."
                  : action === "set_data_validation"
                    ? "Completa los datos faltantes para definir la validacion."
                    : action === "create_named_range"
                      ? "Completa los datos faltantes para crear el rango nombrado."
                      : action === "protect_range"
                        ? "Completa los datos faltantes para proteger el rango."
            : "Completa los datos faltantes para editar la planilla.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
          buildTextField("sheetName", "Pestana", true),
          buildTextField("rangeA1", "Rango A1", true),
          ...(action === "clear_range"
            ? []
            : action === "append_rows" || action === "update_range"
              ? [
                buildTextareaField(
                  "values",
                  "Filas (una fila por linea, columnas separadas por |)",
                  true
                ),
                ]
              : action === "format_range"
                ? [buildTextareaField("format", "Formato JSON", true)]
                : action === "set_number_format"
                  ? [
                      buildTextField("type", "Tipo", true),
                      buildTextField("pattern", "Pattern", true),
                    ]
                  : action === "sort_range"
                    ? [buildTextareaField("sortSpecs", "Criterios JSON", true)]
                    : action === "set_data_validation"
                      ? [buildTextareaField("rule", "Regla JSON", true)]
                      : action === "create_named_range"
                        ? [buildTextField("name", "Nombre", true)]
                        : [buildTextField("warningOnly", "Solo advertencia", false)]),
        ],
      };
    case "insert_rows":
    case "insert_columns":
    case "auto_resize_columns":
    case "freeze_rows":
    case "freeze_columns":
    case "set_basic_filter":
    case "clear_basic_filter":
    case "delete_columns":
      return {
        title: getGoogleSheetsActionLabel(action as never),
        message: "Completa los datos faltantes para editar la estructura de la hoja.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
          buildTextField("sheetName", "Pestana", true),
          ...(["set_basic_filter", "clear_basic_filter"].includes(action)
            ? [buildTextField("rangeA1", "Rango A1", false)]
            : []),
          ...(action === "insert_rows"
            ? [
                buildTextField("startRowIndex", "Indice inicial de fila", true),
                buildTextField("rowCount", "Cantidad de filas", true),
              ]
            : []),
          ...(action === "insert_columns" ||
          action === "auto_resize_columns" ||
          action === "delete_columns"
            ? [
                buildTextField("startColumnIndex", "Indice inicial de columna", true),
                buildTextField("columnCount", "Cantidad de columnas", true),
              ]
            : []),
          ...(action === "freeze_rows" || action === "freeze_columns"
            ? [buildTextField("count", "Cantidad", true)]
            : []),
        ],
      };
    case "create_sheet":
    case "rename_sheet":
    case "duplicate_sheet":
    case "delete_sheet":
      return {
        title: getGoogleSheetsActionLabel(action as never),
        message: "Completa los datos faltantes para operar sobre la hoja.",
        fields: [
          buildTextField("action", "Accion", true),
          buildTextField("spreadsheetUrl", "URL del spreadsheet", false, "url"),
          buildTextField("spreadsheetId", "Spreadsheet ID", false),
          ...(["rename_sheet", "duplicate_sheet", "delete_sheet"].includes(action)
            ? [buildTextField("sheetName", "Pestana", true)]
            : []),
          ...(action === "create_sheet"
            ? [
                buildTextField("title", "Nombre de la nueva hoja", true),
                buildTextField("rowCount", "Cantidad inicial de filas", false),
                buildTextField("columnCount", "Cantidad inicial de columnas", false),
              ]
            : []),
          ...(action === "rename_sheet"
            ? [buildTextField("newSheetName", "Nuevo nombre", true)]
            : []),
          ...(action === "duplicate_sheet"
            ? [buildTextField("newSheetName", "Nombre de la copia", false)]
            : []),
        ],
      };
    case "create_spreadsheet":
    case "copy_spreadsheet":
      return {
        title: getGoogleSheetsActionLabel(action as never),
        message:
          action === "copy_spreadsheet"
            ? "Completa los datos faltantes para copiar el spreadsheet."
            : "Completa los datos faltantes para crear el spreadsheet.",
        fields: [
          buildTextField("action", "Accion", true),
          ...(action === "copy_spreadsheet"
            ? [
                buildTextField("sourceSpreadsheetUrl", "URL origen", false, "url"),
                buildTextField("sourceSpreadsheetId", "Spreadsheet ID origen", false),
              ]
            : []),
          buildTextField("title", "Titulo", true),
          ...(action === "create_spreadsheet"
            ? [buildTextField("initialSheetTitle", "Titulo de hoja inicial", false)]
            : []),
        ],
      };
    default:
      return null;
  }
}

function resolveSalesforceFieldType(
  key: string,
  property: Record<string, unknown>
): DynamicFormFieldDefinition["type"] {
  if (key.toLowerCase().includes("email")) {
    return "email";
  }

  if (key.toLowerCase().includes("phone")) {
    return "tel";
  }

  if (key === "description" || key === "query" || key === "nextStep") {
    return "textarea";
  }

  if (typeof property.description === "string" && property.description.includes("YYYY-MM-DD")) {
    return "date";
  }

  return "text";
}

function buildSalesforceContract(action: string): FormContract | null {
  const hints = SALESFORCE_ACTION_PARAM_HINTS[action as SalesforceCrmAction];
  if (!hints) {
    return null;
  }

  const properties =
    hints.properties && typeof hints.properties === "object"
      ? (hints.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = new Set(
    Array.isArray(hints.required) ? hints.required.filter((value): value is string => typeof value === "string") : []
  );
  const fields: DynamicFormFieldDefinition[] = [
    buildTextField("action", "Accion", true),
  ];

  for (const [key, property] of Object.entries(properties)) {
    const type = resolveSalesforceFieldType(key, property);
    const label =
      key === "limit"
        ? "Limite"
        : key === "createdAfter"
          ? "Desde"
          : humanizeKey(key);
    fields.push(
      type === "textarea"
        ? buildTextareaField(key, label, required.has(key))
        : buildTextField(key, label, required.has(key), type)
    );
  }

  if (fields.length <= 1) {
    return null;
  }

  return {
    title: getSalesforceActionLabel(action as SalesforceCrmAction),
    message: "Completa los datos faltantes para continuar con Salesforce.",
    fields,
  };
}

function buildContract(parsed: ParsedToolName): FormContract | null {
  if (parsed.provider === "google" && parsed.surface === "gmail") {
    return buildGmailContract(parsed.action);
  }

  if (parsed.provider === "google" && parsed.surface === "google_calendar") {
    return buildGoogleCalendarContract(parsed.action);
  }

  if (parsed.provider === "google" && parsed.surface === "google_sheets") {
    return buildGoogleSheetsContract(parsed.action);
  }

  if (parsed.provider === "salesforce" && parsed.surface === "salesforce") {
    return buildSalesforceContract(parsed.action);
  }

  return null;
}

export function buildPendingChatFormForTool(input: {
  toolName: string;
  parsed: ParsedToolName;
  args: Record<string, unknown>;
}): PendingChatFormState | null {
  const contract = buildContract(input.parsed);
  if (!contract) {
    return null;
  }

  const definition: DynamicFormDefinition = {
    title: contract.title,
    fields: contract.fields,
  };
  const initialValues = buildInitialValues(definition, input.args);
  const fieldUi = buildFieldUi(definition, initialValues);
  const formId = `${input.parsed.surface}:${input.parsed.action}`;

  return {
    kind: "dynamic_form",
    formId,
    provider: input.parsed.provider,
    surface: input.parsed.surface,
    action: input.parsed.action,
    toolName: input.toolName,
    message: contract.message,
    definition,
    initialValues,
    fieldUi,
    sourceMessageId: null,
    createdAt: new Date().toISOString(),
  };
}

export function buildAssistantContentForPendingChatForm(
  pendingChatForm: PendingChatFormState
): string {
  return `${pendingChatForm.message}\n${buildDynamicFormMarker({
    definition: pendingChatForm.definition,
    initialValues: pendingChatForm.initialValues,
    fieldUi: pendingChatForm.fieldUi,
  })}`;
}

export function isStructuredListField(key: string): boolean {
  return LIST_TEXT_KEYS.has(key);
}
