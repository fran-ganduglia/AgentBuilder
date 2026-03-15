import type { ChatQuickActionProvider } from "@/lib/chat/quick-actions";

export type DynamicFormFieldDefinition = {
  key: string;
  type: "text" | "email" | "tel" | "date" | "datetime-local" | "textarea" | "select";
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
};

export type DynamicFormDefinition = {
  title: string;
  fields: DynamicFormFieldDefinition[];
};

export type ParsedChoiceChips = {
  strippedContent: string;
  choices: string[];
};

export type ParsedDynamicForm = {
  strippedContent: string;
  definition: DynamicFormDefinition;
};

const CHOICE_CHIPS_PATTERN = /(?:\r?\n)?\[CHOICES:([^\]]+)\]\s*$/i;
const DYNAMIC_FORM_PATTERN = /(?:\r?\n)?\[FORM:([^\]]*\|[^\]]*)\]\s*$/i;
const VALID_FIELD_TYPES = new Set([
  "text",
  "email",
  "tel",
  "date",
  "datetime-local",
  "textarea",
  "select",
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
  let labelPart = parts[2]?.trim() ?? "";
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

  return field;
}

export function parseDynamicFormMarker(
  content: string
): ParsedDynamicForm | null {
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
  };
}

export function buildDynamicFormSubmissionMessage(
  definition: DynamicFormDefinition,
  values: Record<string, string>
): string {
  const lines: string[] = [];

  for (const field of definition.fields) {
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
    "",
    "DYNAMIC FORMS — usa [FORM:Titulo|key:type:Label*|key:type:Label:opt1,opt2] al final de tu respuesta cuando necesites varios datos del usuario.",
    "- Titulo es el nombre del formulario.",
    "- Cada campo se define como key:type:Label donde type es text, email, tel, date, datetime-local, textarea o select.",
    "- Agrega * al final del Label para campos obligatorios.",
    "- Para select, agrega opciones separadas por coma despues del Label: key:select:Label:opt1,opt2,opt3.",
    "- Ejemplo: Necesito los datos del contacto.\n[FORM:Nuevo contacto|firstName:text:Nombre|lastName:text:Apellido*|email:email:Email*|phone:tel:Telefono]",
    "",
    "REGLAS:",
    "- Nunca emitas ambos markers en la misma respuesta.",
    "- Nunca mezcles un marker con listas numeradas de follow-up.",
    "- Emite como maximo un solo marker por respuesta y siempre al final del mensaje.",
    "- Cuando el usuario envia datos de formulario, llegan como key: value en lineas separadas. Interpretalos como datos estructurados, no como texto libre.",
    "- Para escrituras CRM, despues de recibir form data, emite [CONFIRM:salesforce] para confirmar antes de ejecutar.",
    "</interactive_markers>",
  ];

  return lines.join("\n");
}
