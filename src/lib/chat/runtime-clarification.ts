import { z } from "zod";
import type { PendingChatFormState } from "@/lib/chat/chat-form-state";
import type { DynamicFormFieldDefinition } from "@/lib/chat/interactive-markers";
import {
  getActionDefinitionV1,
  type RuntimeParamContractV1,
} from "@/lib/runtime/action-catalog";
import type {
  ActionPlanV1,
  ExecutionCheckpointV1,
  ParamValueV1,
  RuntimeActionType,
  RuntimeActionV1,
} from "@/lib/runtime/types";

const runtimeClarificationOptionSchema = z.object({
  value: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(500),
});

const runtimeClarificationSpecSchema = z.object({
  clarificationId: z.string().trim().min(1).max(120),
  source: z.enum(["planner", "runtime"]),
  actionType: z.string().trim().min(1).max(80),
  actionId: z.string().trim().min(1).max(120).optional(),
  runtimeRunId: z.string().uuid("runtimeRunId invalido").optional(),
  requiredFields: z.array(z.string().trim().min(1).max(80)).max(20),
  optionalFields: z.array(z.string().trim().min(1).max(80)).max(20),
  knownParams: z.record(z.string(), z.unknown()),
  candidateOptionsByField: z
    .record(z.string(), z.array(runtimeClarificationOptionSchema).max(20))
    .default({}),
  resumeMode: z.enum(["resume_checkpoint", "start_from_draft"]),
  plannerDraftPlan: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export type RuntimeClarificationOption = z.infer<typeof runtimeClarificationOptionSchema>;
export type RuntimeClarificationSpec = z.infer<typeof runtimeClarificationSpecSchema>;

function isParamValue(value: unknown): value is ParamValueV1 {
  return Boolean(value) && typeof value === "object" && "kind" in (value as Record<string, unknown>);
}

function isActionPlan(value: unknown): value is ActionPlanV1 {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Record<string, unknown>).version === 1 &&
    Array.isArray((value as Record<string, unknown>).actions)
  );
}

function formatKnownValue(value: ParamValueV1 | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.kind === "primitive") {
    if (typeof value.value === "string") {
      return value.value;
    }
    if (typeof value.value === "number" || typeof value.value === "boolean") {
      return String(value.value);
    }
    if (Array.isArray(value.value)) {
      return value.value.map((entry) => String(entry ?? "")).join(", ");
    }
    return null;
  }

  if (value.kind === "reference" || value.kind === "entity") {
    return value.label ?? value.value;
  }

  if (value.kind === "time") {
    return value.value;
  }

  if (value.kind === "computed") {
    if (typeof value.value === "string" || typeof value.value === "number") {
      return String(value.value);
    }
  }

  return null;
}

function toFieldLabel(key: string): string {
  const normalized = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/Ref$/i, "")
    .trim();

  return normalized.length > 0
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : key;
}

function buildSelectOptions(candidates: unknown[]): RuntimeClarificationOption[] {
  return candidates
    .map((candidate) => {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return {
          value: candidate.trim(),
          label: candidate.trim(),
        };
      }

      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const record = candidate as Record<string, unknown>;
      const rawValue = [
        typeof record.threadId === "string" ? record.threadId : null,
        typeof record.eventId === "string" ? record.eventId : null,
        typeof record.recordId === "string" ? record.recordId : null,
        typeof record.email === "string" ? record.email : null,
        typeof record.value === "string" ? record.value : null,
      ].find((value) => Boolean(value));
      const rawLabel = [
        typeof record.label === "string" ? record.label : null,
        typeof record.subject === "string" ? record.subject : null,
        typeof record.title === "string" ? record.title : null,
        typeof record.email === "string" ? record.email : null,
      ].find((value) => Boolean(value));

      if (!rawValue || !rawLabel) {
        return null;
      }

      return {
        value: rawValue,
        label: `${rawLabel}${rawValue === rawLabel ? "" : ` (${rawValue})`}`,
      };
    })
    .filter((option): option is RuntimeClarificationOption => Boolean(option))
    .slice(0, 20);
}

function inferFieldType(input: {
  fieldKey: string;
  contract: RuntimeParamContractV1 | undefined;
  options: RuntimeClarificationOption[];
}): DynamicFormFieldDefinition["type"] {
  const resourceFamily = input.contract?.resourceFamily ?? input.fieldKey;

  if (input.options.length > 0) {
    return "select";
  }

  if (resourceFamily === "datetime") {
    return "datetime-local";
  }

  if (resourceFamily === "date") {
    return "date";
  }

  if (resourceFamily === "recipient") {
    return "textarea";
  }

  if (resourceFamily === "limit") {
    return "number";
  }

  if (["body", "description", "reason"].includes(resourceFamily)) {
    return "textarea";
  }

  return "text";
}

function inferHelperText(resourceFamily: string | undefined): string | undefined {
  if (resourceFamily === "recipient") {
    return "Ingresa uno o varios emails, separados por coma.";
  }

  if (resourceFamily === "datetime") {
    return "Usa fecha y hora local del evento.";
  }

  if (resourceFamily === "date") {
    return "Usa una fecha concreta.";
  }

  if (resourceFamily === "range") {
    return "Ejemplo: A1:C10";
  }

  return undefined;
}

function inferPlaceholder(resourceFamily: string | undefined): string | undefined {
  if (resourceFamily === "recipient") {
    return "ana@empresa.com, ventas@empresa.com";
  }

  if (resourceFamily === "datetime") {
    return "2026-03-18T15:30";
  }

  if (resourceFamily === "date") {
    return "2026-03-18";
  }

  if (resourceFamily === "timezone") {
    return "America/Argentina/Buenos_Aires";
  }

  if (resourceFamily === "range") {
    return "A1:C10";
  }

  return undefined;
}

function buildKnownParams(action: RuntimeActionV1, missingFields: string[]): Record<string, ParamValueV1> {
  const missing = new Set(missingFields);
  return Object.fromEntries(
    Object.entries(action.params).filter(([key, value]) => !missing.has(key) && isParamValue(value) && value.kind !== "unknown")
  );
}

function inferMissingFieldFromReason(reason: string | undefined, action: RuntimeActionV1): string[] {
  if (!reason) {
    return [];
  }

  for (const key of Object.keys(getActionDefinitionV1(action.type).input.params)) {
    if (reason.includes(key.toLowerCase())) {
      return [key];
    }
  }

  if (reason.includes("recipient") && "to" in action.params) {
    return ["to"];
  }

  return [];
}

const PLANNER_FIELD_ALIASES: Record<string, string> = {
  start_time: "start",
  end_time: "end",
  event_id: "eventRef",
  thread_id: "threadRef",
  window_start: "windowStart",
  window_end: "windowEnd",
};

function normalizePlannerMissingFields(fields: string[]): string[] {
  return fields.map((f) => PLANNER_FIELD_ALIASES[f] ?? f);
}

function inferPlannerActionTypeFromIntent(intent: string | undefined): RuntimeActionType | null {
  const normalized = intent?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return null;
  }

  if (normalized.includes("enviar") && normalized.includes("email")) {
    return "send_email";
  }

  if ((normalized.includes("buscar") || normalized.includes("search")) && normalized.includes("email")) {
    return "search_email";
  }

  if ((normalized.includes("resumir") || normalized.includes("leer")) && normalized.includes("hilo")) {
    return "summarize_thread";
  }

  const isScheduleVerb = normalized.includes("crear") || normalized.includes("agendar") || normalized.includes("programar") || normalized.includes("organizar") || normalized.includes("agregar");
  const isEventNoun = normalized.includes("evento") || normalized.includes("reuni") || normalized.includes("cita") || normalized.includes("meeting") || normalized.includes("llamada") || normalized.includes("encuentro");

  if (isScheduleVerb && isEventNoun) {
    return "create_event";
  }

  if ((normalized.includes("reprogram") || normalized.includes("mover") || normalized.includes("cambiar") || normalized.includes("postergar")) && (normalized.includes("evento") || normalized.includes("reuni") || normalized.includes("cita"))) {
    return "reschedule_event";
  }

  if ((normalized.includes("cancel") || normalized.includes("eliminar") || normalized.includes("borrar")) && (normalized.includes("evento") || normalized.includes("reuni") || normalized.includes("cita"))) {
    return "cancel_event";
  }

  if ((normalized.includes("listar") || normalized.includes("ver") || normalized.includes("mostrar") || normalized.includes("qu") && normalized.includes("tengo")) && (normalized.includes("evento") || normalized.includes("reuni") || normalized.includes("cita") || normalized.includes("agenda"))) {
    return "list_events";
  }

  if ((normalized.includes("buscar") || normalized.includes("search")) && normalized.includes("registro")) {
    return "search_records";
  }

  return null;
}


function synthesizePlannerClarificationDraft(input: {
  plannerDraftPlan: ActionPlanV1 | null;
  plannerMissingFields: string[];
}): ActionPlanV1 | null {
  const actionType = inferPlannerActionTypeFromIntent(input.plannerDraftPlan?.intent);
  if (!actionType) {
    return null;
  }

  const normalizedFields = normalizePlannerMissingFields(input.plannerMissingFields);
  const validMissingFields = [...new Set(normalizedFields)].filter((field) =>
    field in getActionDefinitionV1(actionType).input.params
  );

  if (validMissingFields.length === 0) {
    return null;
  }

  return {
    version: 1,
    intent: input.plannerDraftPlan?.intent ?? actionType,
    confidence: input.plannerDraftPlan?.confidence ?? 0,
    missingFields: validMissingFields,
    actions: [
      {
        id: "planner-clarify-action-1",
        type: actionType,
        approvalMode: getActionDefinitionV1(actionType).approvalMode,
        params: {},
      },
    ],
  };
}

export function parseRuntimeClarificationSpec(
  value: Record<string, unknown> | null | undefined
): RuntimeClarificationSpec | null {
  const parsed = runtimeClarificationSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildRuntimeClarificationSpec(input:
  | {
      source: "planner";
      plannerDraftPlan: ActionPlanV1 | null;
      plannerMissingFields: string[];
    }
  | {
      source: "runtime";
      checkpoint: ExecutionCheckpointV1;
      runtimeRunId: string | null;
    }
): RuntimeClarificationSpec | null {
  if (input.source === "planner") {
    const effectiveDraftPlan =
      input.plannerDraftPlan && input.plannerDraftPlan.actions.length === 1
        ? input.plannerDraftPlan
        : synthesizePlannerClarificationDraft({
            plannerDraftPlan: input.plannerDraftPlan,
            plannerMissingFields: input.plannerMissingFields,
          });

    if (!effectiveDraftPlan || effectiveDraftPlan.actions.length !== 1) {
      return null;
    }

    const draftAction = effectiveDraftPlan.actions[0];
    if (!draftAction) {
      return null;
    }

    const normalizedMissingFields = normalizePlannerMissingFields(input.plannerMissingFields);
    const requiredFields = [...new Set(normalizedMissingFields)].filter((field) =>
      field in getActionDefinitionV1(draftAction.type).input.params
    );

    if (requiredFields.length === 0) {
      return null;
    }

    return {
      clarificationId: crypto.randomUUID(),
      source: "planner",
      actionType: draftAction.type,
      actionId: draftAction.id,
      requiredFields,
      optionalFields: [],
      knownParams: buildKnownParams(draftAction, requiredFields),
      candidateOptionsByField: {},
      resumeMode: "start_from_draft",
      plannerDraftPlan: effectiveDraftPlan as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
  }

  const action = input.checkpoint.actionSnapshot;
  const resolution = action.metadata?.resolution;
  const resolutionRecord =
    resolution && typeof resolution === "object"
      ? (resolution as Record<string, unknown>)
      : null;
  const reason =
    typeof input.checkpoint.reason === "string" ? input.checkpoint.reason.toLowerCase() : undefined;
  const requiredFields = Array.isArray(resolutionRecord?.missingFields)
    ? resolutionRecord.missingFields.filter((field): field is string => typeof field === "string")
    : inferMissingFieldFromReason(reason, action);
  const clarificationPayload =
    input.checkpoint.contextSnapshot.messageMetadata.runtime_user_clarification;
  const clarificationRecord =
    clarificationPayload && typeof clarificationPayload === "object"
      ? (clarificationPayload as Record<string, unknown>)
      : null;
  const candidates = Array.isArray(clarificationRecord?.candidates)
    ? clarificationRecord.candidates
    : [];

  if (requiredFields.length === 0) {
    return null;
  }

  const firstField = requiredFields[0];
  const options = buildSelectOptions(candidates);

  return {
    clarificationId: crypto.randomUUID(),
    source: "runtime",
    actionType: action.type,
    actionId: action.id,
    runtimeRunId: input.runtimeRunId ?? undefined,
    requiredFields,
    optionalFields: [],
    knownParams: buildKnownParams(action, requiredFields),
    candidateOptionsByField: options.length > 0 ? { [firstField]: options } : {},
    resumeMode: "resume_checkpoint",
    createdAt: new Date().toISOString(),
  };
}

export function buildPendingChatFormFromRuntimeClarification(input: {
  spec: RuntimeClarificationSpec;
  sourceMessageId?: string | null;
  message: string;
  timezone?: string | null;
}): PendingChatFormState | null {
  const actionType = input.spec.actionType as RuntimeActionType;
  const definition = getActionDefinitionV1(actionType);
  const formFields = [...new Set([...input.spec.requiredFields, ...input.spec.optionalFields])]
    .map((fieldKey) => {
      const contract = definition.input.params[fieldKey];
      if (!contract) {
        return null;
      }

      const options = input.spec.candidateOptionsByField[fieldKey] ?? [];
      const type = inferFieldType({
        fieldKey,
        contract,
        options,
      });

      return {
        key: fieldKey,
        type,
        label: toFieldLabel(fieldKey),
        required: input.spec.requiredFields.includes(fieldKey),
        ...(options.length > 0 ? { options } : {}),
        ...(inferHelperText(contract.resourceFamily) ? { helperText: inferHelperText(contract.resourceFamily) } : {}),
        ...(inferPlaceholder(contract.resourceFamily) ? { placeholder: inferPlaceholder(contract.resourceFamily) } : {}),
      } satisfies DynamicFormFieldDefinition;
    })
    .filter((field): field is DynamicFormFieldDefinition => Boolean(field));

  if (formFields.length === 0) {
    return null;
  }

  const initialValues = Object.fromEntries(
    Object.entries(input.spec.knownParams)
      .map(([key, value]) => [key, formatKnownValue(value as ParamValueV1)])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  );
  const fieldUi = Object.fromEntries(
    Object.keys(initialValues).map((key) => [
      key,
      {
        hidden: true,
        readOnly: true,
      },
    ])
  );

  if (
    Object.keys(definition.input.params).includes("timezone") &&
    !("timezone" in initialValues) &&
    input.timezone
  ) {
    initialValues.timezone = input.timezone;
  }

  return {
    kind: "dynamic_form",
    formId: `runtime-clarify:${input.spec.clarificationId}`,
    provider: "runtime",
    surface: "runtime",
    action: actionType,
    toolName: `runtime_${actionType}`,
    message: input.message,
    definition: {
      title: `Completar ${toFieldLabel(actionType.replace(/_/g, " "))}`,
      fields: formFields,
    },
    initialValues,
    fieldUi,
    clarificationId: input.spec.clarificationId,
    source: input.spec.source,
    resumeMode: input.spec.resumeMode,
    sourceMessageId: input.sourceMessageId ?? null,
    createdAt: input.spec.createdAt,
  };
}

export function mapClarificationValueToParam(input: {
  actionType: RuntimeActionType;
  fieldKey: string;
  rawValue: string;
  timezone?: string | null;
}): ParamValueV1 {
  const contract = getActionDefinitionV1(input.actionType).input.params[input.fieldKey];
  const resourceFamily = contract?.resourceFamily;
  const value = input.rawValue.trim();

  if (resourceFamily === "datetime") {
    return {
      kind: "time",
      value: value.length === 16 ? `${value}:00` : value,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      granularity: "datetime",
    };
  }

  if (resourceFamily === "date") {
    return {
      kind: "time",
      value,
      granularity: "date",
    };
  }

  if (["thread", "event", "record", "sheet", "range"].includes(resourceFamily ?? "")) {
    return {
      kind: "reference",
      refType: resourceFamily ?? input.fieldKey,
      value,
      label: value,
    };
  }

  if (resourceFamily === "limit") {
    const parsedNumber = Number(value);
    return {
      kind: "primitive",
      value: Number.isFinite(parsedNumber) ? parsedNumber : value,
    };
  }

  if (resourceFamily === "recipient") {
    const recipients = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return {
      kind: "primitive",
      value: recipients,
    };
  }

  return {
    kind: "primitive",
    value,
  };
}

export function readPlannerDraftPlan(value: RuntimeClarificationSpec): ActionPlanV1 | null {
  return isActionPlan(value.plannerDraftPlan) ? value.plannerDraftPlan : null;
}
