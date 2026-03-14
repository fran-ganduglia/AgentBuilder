import type { ChatQuickActionProvider } from "@/lib/chat/quick-actions";
import type {
  ExecuteHubSpotCrmToolInput,
  HubSpotCrmAction,
} from "@/lib/integrations/hubspot-tools";
import type {
  ExecuteSalesforceCrmToolInput,
  SalesforceCrmAction,
} from "@/lib/integrations/salesforce-tools";

export const CHAT_FORM_IDS = [
  "hubspot_create_contact",
  "hubspot_create_company",
  "hubspot_create_task",
  "salesforce_create_lead",
  "salesforce_create_contact",
  "salesforce_create_task",
] as const;

export const CHAT_CONFIRMATION_PROVIDERS = [
  "hubspot",
  "salesforce",
] as const satisfies readonly ChatQuickActionProvider[];

export type ChatFormId = (typeof CHAT_FORM_IDS)[number];
export type ChatConfirmationProvider =
  (typeof CHAT_CONFIRMATION_PROVIDERS)[number];
export type ChatFormAction = HubSpotCrmAction | SalesforceCrmAction;
export type ChatFormActionInput =
  | ExecuteHubSpotCrmToolInput
  | ExecuteSalesforceCrmToolInput;
export type ChatFormFieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "datetime-local"
  | "textarea"
  | "select";
export type ChatFormValues = Record<string, string>;

export type ChatFormFieldOption = {
  label: string;
  value: string;
};

export type ChatFormFieldDefinition = {
  key: string;
  label: string;
  type: ChatFormFieldType;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  options?: readonly ChatFormFieldOption[];
};

export type ChatFormDefinition = {
  id: ChatFormId;
  provider: ChatQuickActionProvider;
  action: ChatFormAction;
  title: string;
  description: string;
  submitLabel: string;
  fields: readonly ChatFormFieldDefinition[];
  buildActionInput: (values: ChatFormValues) => ChatFormActionInput;
};

export type ParsedChatFormMarker = {
  formId: ChatFormId;
  content: string;
  marker: string;
};

export type ParsedChatConfirmationMarker = {
  provider: ChatConfirmationProvider;
  content: string;
  marker: string;
};

export type ParsedChatFormSubmission = {
  formId: ChatFormId;
  values: ChatFormValues;
};

type MinimalChatMessage = {
  id: string;
  role: string;
};

const HUBSPOT_TASK_STATUS_OPTIONS = [
  { label: "Not started", value: "NOT_STARTED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Waiting", value: "WAITING" },
  { label: "Deferred", value: "DEFERRED" },
] as const satisfies readonly ChatFormFieldOption[];

const SALESFORCE_TASK_STATUS_OPTIONS = [
  { label: "Not Started", value: "Not Started" },
  { label: "In Progress", value: "In Progress" },
  { label: "Completed", value: "Completed" },
  { label: "Waiting on someone else", value: "Waiting on someone else" },
  { label: "Deferred", value: "Deferred" },
] as const satisfies readonly ChatFormFieldOption[];

const SALESFORCE_TASK_PRIORITY_OPTIONS = [
  { label: "High", value: "High" },
  { label: "Normal", value: "Normal" },
  { label: "Low", value: "Low" },
] as const satisfies readonly ChatFormFieldOption[];

function pickFormValue(values: ChatFormValues, key: string): string | undefined {
  const value = values[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickDefinedValues(
  values: ChatFormValues,
  keys: readonly string[]
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const key of keys) {
    const value = pickFormValue(values, key);
    if (value) {
      next[key] = value;
    }
  }

  return next;
}

const CHAT_FORM_DEFINITIONS = [
  {
    id: "hubspot_create_contact",
    provider: "hubspot",
    action: "create_contact",
    title: "Crear contacto en HubSpot",
    description: "Completa los datos del contacto para enviarlos al CRM.",
    submitLabel: "Enviar al chat",
    fields: [
      { key: "firstname", label: "Nombre", type: "text" },
      { key: "lastname", label: "Apellido", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Telefono", type: "tel" },
      { key: "jobtitle", label: "Cargo", type: "text" },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteHubSpotCrmToolInput => ({
      action: "create_contact",
      properties: pickDefinedValues(values, [
        "firstname",
        "lastname",
        "email",
        "phone",
        "jobtitle",
      ]),
    }),
  },
  {
    id: "hubspot_create_company",
    provider: "hubspot",
    action: "create_company",
    title: "Crear empresa en HubSpot",
    description: "Completa los datos de la empresa para enviarlos al CRM.",
    submitLabel: "Enviar al chat",
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true },
      { key: "domain", label: "Dominio", type: "text" },
      { key: "phone", label: "Telefono", type: "tel" },
      { key: "industry", label: "Industria", type: "text" },
      { key: "website", label: "Sitio web", type: "text" },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteHubSpotCrmToolInput => ({
      action: "create_company",
      properties: pickDefinedValues(values, [
        "name",
        "domain",
        "phone",
        "industry",
        "website",
      ]),
    }),
  },
  {
    id: "hubspot_create_task",
    provider: "hubspot",
    action: "create_task",
    title: "Crear task en HubSpot",
    description: "Completa la actividad para prepararla antes de confirmar.",
    submitLabel: "Enviar al chat",
    fields: [
      {
        key: "hs_task_subject",
        label: "Asunto",
        type: "text",
        required: true,
      },
      {
        key: "hs_task_body",
        label: "Detalle",
        type: "textarea",
        rows: 4,
      },
      {
        key: "hs_timestamp",
        label: "Fecha y hora",
        type: "datetime-local",
        required: true,
      },
      {
        key: "hs_task_status",
        label: "Estado",
        type: "select",
        options: HUBSPOT_TASK_STATUS_OPTIONS,
      },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteHubSpotCrmToolInput =>
      ({
        action: "create_task",
        properties: pickDefinedValues(values, [
          "hs_task_subject",
          "hs_task_body",
          "hs_timestamp",
          "hs_task_status",
        ]),
      }) as ExecuteHubSpotCrmToolInput,
  },
  {
    id: "salesforce_create_lead",
    provider: "salesforce",
    action: "create_lead",
    title: "Crear lead en Salesforce",
    description: "Completa los datos del lead para enviarlos al CRM.",
    submitLabel: "Enviar al chat",
    fields: [
      { key: "firstName", label: "Nombre", type: "text" },
      { key: "lastName", label: "Apellido", type: "text", required: true },
      { key: "company", label: "Empresa", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Telefono", type: "tel" },
      {
        key: "description",
        label: "Descripcion",
        type: "textarea",
        rows: 4,
      },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteSalesforceCrmToolInput =>
      ({
        action: "create_lead",
        ...pickDefinedValues(values, [
          "firstName",
          "lastName",
          "company",
          "email",
          "phone",
          "description",
        ]),
      }) as ExecuteSalesforceCrmToolInput,
  },
  {
    id: "salesforce_create_contact",
    provider: "salesforce",
    action: "create_contact",
    title: "Crear contacto en Salesforce",
    description: "Completa los datos del contacto para enviarlos al CRM.",
    submitLabel: "Enviar al chat",
    fields: [
      { key: "firstName", label: "Nombre", type: "text" },
      { key: "lastName", label: "Apellido", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Telefono", type: "tel" },
      { key: "title", label: "Cargo", type: "text" },
      { key: "accountName", label: "Account", type: "text" },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteSalesforceCrmToolInput =>
      ({
        action: "create_contact",
        ...pickDefinedValues(values, [
          "firstName",
          "lastName",
          "email",
          "phone",
          "title",
          "accountName",
        ]),
      }) as ExecuteSalesforceCrmToolInput,
  },
  {
    id: "salesforce_create_task",
    provider: "salesforce",
    action: "create_task",
    title: "Crear task en Salesforce",
    description: "Completa la actividad para prepararla antes de confirmar.",
    submitLabel: "Enviar al chat",
    fields: [
      { key: "subject", label: "Asunto", type: "text", required: true },
      {
        key: "description",
        label: "Descripcion",
        type: "textarea",
        rows: 4,
      },
      { key: "dueDate", label: "Fecha limite", type: "date" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: SALESFORCE_TASK_STATUS_OPTIONS,
      },
      {
        key: "priority",
        label: "Prioridad",
        type: "select",
        options: SALESFORCE_TASK_PRIORITY_OPTIONS,
      },
    ],
    buildActionInput: (values: ChatFormValues): ExecuteSalesforceCrmToolInput =>
      ({
        action: "create_task",
        ...pickDefinedValues(values, [
          "subject",
          "description",
          "dueDate",
          "status",
          "priority",
        ]),
      }) as ExecuteSalesforceCrmToolInput,
  },
] as const satisfies readonly ChatFormDefinition[];

const CHAT_FORM_ID_SET = new Set<ChatFormId>(CHAT_FORM_IDS);
const CHAT_CONFIRMATION_PROVIDER_SET = new Set<ChatConfirmationProvider>(
  CHAT_CONFIRMATION_PROVIDERS
);
const CHAT_FORM_MARKER_PATTERN = /(?:\r?\n)?\[FORM:([a-z0-9_]+)\]\s*$/i;
const CHAT_CONFIRMATION_MARKER_PATTERN =
  /(?:\r?\n)?\[CONFIRM:([a-z0-9_]+)\]\s*$/i;

function stripTerminalMarker(content: string, marker: string): string {
  return content.slice(0, content.length - marker.length).trimEnd();
}

function escapeFormSubmissionValue(value: string): string {
  return value.trim().replace(/\r?\n/g, "\\n");
}

function unescapeFormSubmissionValue(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

export function getChatFormDefinition(
  formId: ChatFormId
): ChatFormDefinition | null {
  return (
    CHAT_FORM_DEFINITIONS.find((definition) => definition.id === formId) ?? null
  );
}

export function getAvailableChatForms(
  provider: ChatQuickActionProvider,
  allowedActions: readonly ChatFormAction[]
): ChatFormDefinition[] {
  const allowedActionSet = new Set(allowedActions);

  return CHAT_FORM_DEFINITIONS.filter(
    (definition) =>
      definition.provider === provider && allowedActionSet.has(definition.action)
  );
}

export function formatChatFormMarker(formId: ChatFormId): string {
  return `[FORM:${formId}]`;
}

export function parseChatFormMarker(
  content: string
): ParsedChatFormMarker | null {
  const match = content.match(CHAT_FORM_MARKER_PATTERN);
  const marker = match?.[0];
  const rawFormId = match?.[1]?.toLowerCase();

  if (!marker || !rawFormId || !CHAT_FORM_ID_SET.has(rawFormId as ChatFormId)) {
    return null;
  }

  return {
    formId: rawFormId as ChatFormId,
    content: stripTerminalMarker(content, marker),
    marker: marker.trim(),
  };
}

export function formatChatConfirmationMarker(
  provider: ChatConfirmationProvider
): string {
  return `[CONFIRM:${provider}]`;
}

export function parseChatConfirmationMarker(
  content: string
): ParsedChatConfirmationMarker | null {
  const match = content.match(CHAT_CONFIRMATION_MARKER_PATTERN);
  const marker = match?.[0];
  const rawProvider = match?.[1]?.toLowerCase();

  if (
    !marker ||
    !rawProvider ||
    !CHAT_CONFIRMATION_PROVIDER_SET.has(rawProvider as ChatConfirmationProvider)
  ) {
    return null;
  }

  return {
    provider: rawProvider as ChatConfirmationProvider,
    content: stripTerminalMarker(content, marker),
    marker: marker.trim(),
  };
}

export function buildFormSubmissionMessage(
  formId: ChatFormId,
  values: ChatFormValues
): string {
  const definition = getChatFormDefinition(formId);

  if (!definition) {
    throw new Error(`Formulario no soportado: ${formId}`);
  }

  const lines: string[] = [formId];

  for (const field of definition.fields) {
    const value = pickFormValue(values, field.key);
    if (!value) {
      continue;
    }

    lines.push(`${field.key}: ${escapeFormSubmissionValue(value)}`);
  }

  return lines.join("\n");
}

export function parseChatFormSubmissionMessage(
  content: string
): ParsedChatFormSubmission | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rawFormId = lines[0]?.toLowerCase();
  if (!rawFormId || !CHAT_FORM_ID_SET.has(rawFormId as ChatFormId)) {
    return null;
  }

  const values: ChatFormValues = {};

  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = unescapeFormSubmissionValue(line.slice(separatorIndex + 1));

    if (!key || value.length === 0) {
      continue;
    }

    values[key] = value;
  }

  return {
    formId: rawFormId as ChatFormId,
    values,
  };
}

export function buildChatFormActionInput(
  formId: ChatFormId,
  values: ChatFormValues
): ChatFormActionInput {
  const definition = getChatFormDefinition(formId);

  if (!definition) {
    throw new Error(`Formulario no soportado: ${formId}`);
  }

  return definition.buildActionInput(values);
}

export function buildChatFormGuidance(input: {
  provider: ChatQuickActionProvider;
  allowedActions: readonly ChatFormAction[];
}): string | null {
  const forms = getAvailableChatForms(input.provider, input.allowedActions);

  if (forms.length === 0) {
    return null;
  }

  const lines = [
    `INLINE_${input.provider.toUpperCase()}_FORMS`,
    "<inline_forms>",
    `Provider activo: ${input.provider}.`,
    `Acciones de formulario habilitadas: ${forms
      .map((form) => form.action)
      .join(", ")}.`,
    "Si necesitas pedir datos para una escritura CRM y existe un formulario soportado, responde normalmente y agrega exactamente un marker al final de la ultima linea.",
    "Markers disponibles en este chat:",
    ...forms.map(
      (form) =>
        `- ${formatChatFormMarker(form.id)} -> accion ${form.action} -> campos ${form.fields
          .map((field) => field.key)
          .join(", ")}`
    ),
    "No emitas markers para acciones no listadas.",
    "No mezcles un marker [FORM:...] con follow-up intents numerados en la misma respuesta.",
    "Emite como maximo un solo marker por respuesta y siempre al final del mensaje.",
    "Si el usuario envia un formulario, la primera linea sera el form id exacto y las siguientes lineas vendran como fieldKey: value.",
    "Cuando recibas ese formato, interpretalo como datos estructurados del formulario correspondiente y no como texto libre.",
    "</inline_forms>",
  ];

  return lines.join("\n");
}

export function isInlineChatSurfaceActive(input: {
  messages: readonly MinimalChatMessage[];
  messageId: string;
  isStreaming: boolean;
}): boolean {
  if (input.isStreaming) {
    return false;
  }

  const lastMessage = input.messages[input.messages.length - 1];
  return (
    lastMessage?.id === input.messageId && lastMessage.role === "assistant"
  );
}
