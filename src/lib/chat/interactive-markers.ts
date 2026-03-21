import type { ChatQuickActionProvider } from "@/lib/chat/quick-actions";
import { formatFileSize } from "@/lib/utils/format";

export type DynamicFormFieldDefinition = {
  key: string;
  type: "text" | "email" | "tel" | "date" | "datetime-local" | "textarea" | "select" | "url" | "file" | "number";
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
  helperText?: string;
  placeholder?: string;
  /** For file fields: comma-separated MIME types (e.g. "image/*,.pdf") */
  accept?: string;
  /** For file fields: max file size in bytes (default 5MB) */
  maxFileSize?: number;
  /** For file fields: max number of files (default 3) */
  maxFiles?: number;
};

export type DynamicFormDefinition = {
  title: string;
  fields: DynamicFormFieldDefinition[];
};

export type DynamicFormFieldUi = {
  hidden?: boolean;
  readOnly?: boolean;
};

export type DynamicFormPayload = {
  definition: DynamicFormDefinition;
  initialValues?: Record<string, string>;
  fieldUi?: Record<string, DynamicFormFieldUi>;
};

export type ParsedChoiceChips = {
  strippedContent: string;
  choices: string[];
};

export type ParsedDynamicForm = {
  strippedContent: string;
  definition: DynamicFormDefinition;
  initialValues: Record<string, string>;
  fieldUi: Record<string, DynamicFormFieldUi>;
};

const CHOICE_CHIPS_PATTERN = /(?:\r?\n)?\[CHOICES:([^\]]+)\]\s*$/i;
const DYNAMIC_FORM_PATTERN = /(?:\r?\n)?\[FORM:([^\]]*\|[^\]]*)\]\s*$/i;
const STRUCTURED_DYNAMIC_FORM_PATTERN = /(?:\r?\n)?\[FORM_DATA:([A-Za-z0-9_-]+)\]\s*$/i;
const VALID_FIELD_TYPES = new Set([
  "text",
  "email",
  "tel",
  "date",
  "datetime-local",
  "textarea",
  "select",
  "url",
  "file",
  "number",
]);

export function parseChoiceChipsMarker(
  content: string
): ParsedChoiceChips | null {
  const match = content.match(CHOICE_CHIPS_PATTERN);
  if (!match?.[0] || !match[1]) {
    return null;
  }

  const choices = match[1]
    .split("|")
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);

  if (choices.length < 2 || choices.length > 5) {
    return null;
  }

  const strippedContent = content
    .slice(0, content.length - match[0].length)
    .trimEnd();

  return { strippedContent, choices };
}

function parseFieldSpec(
  spec: string
): DynamicFormFieldDefinition | null {
  const parts = spec.split(":");
  if (parts.length < 3) {
    return null;
  }

  const key = parts[0]?.trim();
  const rawType = parts[1]?.trim();

  if (!key || !rawType || !VALID_FIELD_TYPES.has(rawType)) {
    return null;
  }

  const type = rawType as DynamicFormFieldDefinition["type"];
  const labelPart = parts[2]?.trim() ?? "";
  let optionsPart: string | undefined;

  if (type === "select" && parts.length >= 4) {
    optionsPart = parts.slice(3).join(":").trim();
  }

  const required = labelPart.endsWith("*");
  const label = required ? labelPart.slice(0, -1).trim() : labelPart;

  if (!label) {
    return null;
  }

  const field: DynamicFormFieldDefinition = {
    key,
    type,
    label,
    required,
  };

  if (type === "select" && optionsPart) {
    field.options = optionsPart
      .split(",")
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0)
      .map((opt) => ({ value: opt, label: opt }));
  }

  if (type === "file" && optionsPart) {
    field.accept = optionsPart;
  }

  return field;
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }

    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(padded)));
    }

    return null;
  } catch {
    return null;
  }
}

function encodeBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  throw new Error("Base64 encoding not available");
}

function isDynamicFormFieldUi(value: unknown): value is DynamicFormFieldUi {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.hidden === undefined || typeof candidate.hidden === "boolean") &&
    (candidate.readOnly === undefined || typeof candidate.readOnly === "boolean")
  );
}

function parseStructuredDynamicFormMarker(
  content: string
): ParsedDynamicForm | null {
  const match = content.match(STRUCTURED_DYNAMIC_FORM_PATTERN);
  if (!match?.[0] || !match[1]) {
    return null;
  }

  const decoded = decodeBase64Url(match[1]);
  if (!decoded) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const definition = candidate.definition;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return null;
  }

  const title = (definition as Record<string, unknown>).title;
  const fields = (definition as Record<string, unknown>).fields;
  if (typeof title !== "string" || !Array.isArray(fields)) {
    return null;
  }

  const parsedFields = fields
    .map((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        return null;
      }

      const candidateField = field as Record<string, unknown>;
      const key = typeof candidateField.key === "string" ? candidateField.key : null;
      const type =
        typeof candidateField.type === "string" &&
        VALID_FIELD_TYPES.has(candidateField.type)
          ? (candidateField.type as DynamicFormFieldDefinition["type"])
          : null;
      const label = typeof candidateField.label === "string" ? candidateField.label : null;
      const required =
        typeof candidateField.required === "boolean" ? candidateField.required : null;

      if (!key || !type || !label || required === null) {
        return null;
      }

      const nextField: DynamicFormFieldDefinition = {
        key,
        type,
        label,
        required,
      };

      if (Array.isArray(candidateField.options)) {
        nextField.options = candidateField.options
          .filter(
            (option): option is { value: string; label: string } =>
              Boolean(option) &&
              typeof option === "object" &&
              typeof (option as { value?: unknown }).value === "string" &&
              typeof (option as { label?: unknown }).label === "string"
          )
          .map((option) => ({ value: option.value, label: option.label }));
      }

      if (typeof candidateField.accept === "string") {
        nextField.accept = candidateField.accept;
      }

      if (typeof candidateField.helperText === "string") {
        nextField.helperText = candidateField.helperText;
      }

      if (typeof candidateField.placeholder === "string") {
        nextField.placeholder = candidateField.placeholder;
      }

      if (typeof candidateField.maxFileSize === "number") {
        nextField.maxFileSize = candidateField.maxFileSize;
      }

      if (typeof candidateField.maxFiles === "number") {
        nextField.maxFiles = candidateField.maxFiles;
      }

      return nextField;
    })
    .filter((field): field is DynamicFormFieldDefinition => Boolean(field));

  if (parsedFields.length === 0) {
    return null;
  }

  const initialValuesCandidate = candidate.initialValues;
  const initialValues =
    initialValuesCandidate && typeof initialValuesCandidate === "object" && !Array.isArray(initialValuesCandidate)
      ? Object.fromEntries(
          Object.entries(initialValuesCandidate).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};

  const fieldUiCandidate = candidate.fieldUi;
  const fieldUi =
    fieldUiCandidate && typeof fieldUiCandidate === "object" && !Array.isArray(fieldUiCandidate)
      ? Object.fromEntries(
          Object.entries(fieldUiCandidate).filter((entry) =>
            isDynamicFormFieldUi(entry[1])
          )
        )
      : {};

  const strippedContent = content
    .slice(0, content.length - match[0].length)
    .trimEnd();

  return {
    strippedContent,
    definition: { title, fields: parsedFields },
    initialValues,
    fieldUi,
  };
}

export function parseDynamicFormMarker(
  content: string
): ParsedDynamicForm | null {
  const structured = parseStructuredDynamicFormMarker(content);
  if (structured) {
    return structured;
  }

  const match = content.match(DYNAMIC_FORM_PATTERN);
  if (!match?.[0] || !match[1]) {
    return null;
  }

  const segments = match[1].split("|");
  const title = segments[0]?.trim();

  if (!title || segments.length < 2) {
    return null;
  }

  const fields: DynamicFormFieldDefinition[] = [];
  for (let i = 1; i < segments.length; i++) {
    const field = parseFieldSpec(segments[i] ?? "");
    if (!field) {
      return null;
    }
    fields.push(field);
  }

  if (fields.length === 0) {
    return null;
  }

  const strippedContent = content
    .slice(0, content.length - match[0].length)
    .trimEnd();

  return {
    strippedContent,
    definition: { title, fields },
    initialValues: {},
    fieldUi: {},
  };
}

export function buildDynamicFormMarker(payload: DynamicFormPayload): string {
  return `[FORM_DATA:${encodeBase64Url(JSON.stringify(payload))}]`;
}

export type FileAttachmentValue = {
  name: string;
  type: string;
  size: number;
  base64: string;
};

export function buildDynamicFormSubmissionMessage(
  definition: DynamicFormDefinition,
  values: Record<string, string>,
  fileAttachments?: Record<string, FileAttachmentValue[]>,
  uploadedFileValues?: Record<string, string[]>
): string {
  const lines: string[] = [];

  for (const field of definition.fields) {
    if (field.type === "file") {
      const uploadedValues = uploadedFileValues?.[field.key];
      if (uploadedValues && uploadedValues.length > 0) {
        lines.push(`${field.key}: ${uploadedValues.join(",")}`);
        continue;
      }

      const files = fileAttachments?.[field.key];
      if (files && files.length > 0) {
        const fileMeta = files.map((f) => `${f.name} (${f.type}, ${formatFileSize(f.size)})`);
        lines.push(`${field.key}: ${fileMeta.join(", ")}`);
      }
      continue;
    }

    const value = values[field.key]?.trim();
    if (value && value.length > 0) {
      lines.push(`${field.key}: ${value.replace(/\r?\n/g, "\\n")}`);
    }
  }

  return lines.join("\n");
}

export function buildInteractiveMarkersGuidance(
  providers: readonly ChatQuickActionProvider[]
): string | null {
  if (providers.length === 0) {
    return null;
  }

  const providerList = providers.join(", ");

  const lines = [
    "INTERACTIVE_MARKERS",
    "<interactive_markers>",
    `Proveedores activos: ${providerList}.`,
    "",
    "CHOICE CHIPS — usa [CHOICES:opt1|opt2|opt3] al final de tu respuesta cuando el usuario debe elegir entre opciones concretas.",
    "- Minimo 2, maximo 5 opciones separadas por |.",
    "- Ejemplo: Quieres que lo programe para manana o pasado?\n[CHOICES:Manana|Pasado manana]",
    "- IMPORTANTE: cuando ofreces opciones con CHOICES, usa opciones reales y especificas basadas en la conversacion o en datos recuperados de la integracion. Si no tenes datos reales para las opciones, usa un FORM con campo de texto en su lugar.",
    "",
    "DYNAMIC FORMS — usa [FORM:Titulo|key:type:Label*|key:type:Label:opt1,opt2] al final de tu respuesta cuando necesites varios datos del usuario.",
    "- Titulo es el nombre del formulario.",
    "- Cada campo se define como key:type:Label donde type es text, email, tel, date, datetime-local, textarea, select, url o file.",
    "- Agrega * al final del Label para campos obligatorios.",
    "- Para select, agrega opciones separadas por coma despues del Label: key:select:Label:opt1,opt2,opt3.",
    "- Ejemplo: Necesito los datos del contacto.\n[FORM:Nuevo contacto|firstName:text:Nombre|lastName:text:Apellido*|email:email:Email*|phone:tel:Telefono]",
    "- El runtime tambien soporta formularios estructurados `FORM_DATA` con valores prellenados cuando el servidor ya conoce parte de la accion.",
    "",
    "REGLAS:",
    "- Nunca emitas ambos markers en la misma respuesta.",
    "- Nunca mezcles un marker con listas numeradas de follow-up.",
    "- Emite como maximo un solo marker por respuesta y siempre al final del mensaje.",
    "- Si ya identificaste una accion concreta pero faltan datos operativos, usa un formulario al final en vez de pedirlos en texto libre.",
    "- Cuando el usuario envia datos de formulario, llegan como key: value en lineas separadas. Interpretalos como datos estructurados, no como texto libre.",
    "- Para escrituras CRM, despues de recibir form data, emite [CONFIRM:salesforce] para confirmar antes de ejecutar.",
    "</interactive_markers>",
  ];

  return lines.join("\n");
}
