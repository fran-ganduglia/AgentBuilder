import { z } from "zod";
import {
  hasValidCriteriaTaskData,
  hasValidScheduleTaskData,
  normalizeCriteriaTaskData,
  normalizeDeferredTaskData,
  normalizeScheduleTaskData,
  type CriteriaTaskData,
  type ScheduleTaskData,
} from "@/lib/agents/agent-setup-task-data";
import type { Json } from "@/types/database";

export const CHANNEL_INTENTS = ["whatsapp", "web", "api", "email"] as const;
export type ChannelIntent = (typeof CHANNEL_INTENTS)[number];

export const CHANNEL_LABELS: Record<ChannelIntent, string> = {
  whatsapp: "WhatsApp",
  web: "Web",
  api: "API",
  email: "Email",
};

export const AGENT_TEMPLATE_IDS = [
  "whatsapp_support",
  "whatsapp_sales",
  "whatsapp_appointment_booking",
  "whatsapp_reminder_follow_up",
  "salesforce_lead_qualification",
  "salesforce_case_triage",
  "salesforce_opportunity_follow_up",
  "salesforce_post_sale_handoff",
  "hubspot_lead_capture",
  "hubspot_pipeline_follow_up",
  "hubspot_meeting_booking",
  "hubspot_reactivation_follow_up",
  "gmail_inbox_assistant",
  "calendar_booking_assistant",
  "gmail_follow_up_assistant",
  "calendar_reschedule_assistant",
  "slack_teams_internal_helpdesk",
  "slack_teams_onboarding_assistant",
  "slack_teams_incident_triage",
  "slack_teams_team_updates_assistant",
  "web_faq",
  "web_lead_capture",
  "web_internal_assistant",
  "api_faq",
  "from_scratch",
] as const;
export type AgentTemplateId = (typeof AGENT_TEMPLATE_IDS)[number];

export const CHECKLIST_ITEM_STATUSES = ["pending", "completed", "deferred"] as const;
export type AgentSetupChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

export const AGENT_SETUP_STATUSES = ["not_started", "in_progress", "blocked", "completed"] as const;
export type AgentSetupStatus = (typeof AGENT_SETUP_STATUSES)[number];

export const CHECKLIST_VERIFICATION_MODES = ["structured", "manual"] as const;
export type AgentSetupChecklistVerificationMode = (typeof CHECKLIST_VERIFICATION_MODES)[number];

export const PROVIDER_INTEGRATION_PROVIDERS = ["salesforce"] as const;
export type ProviderIntegrationProvider = (typeof PROVIDER_INTEGRATION_PROVIDERS)[number];

export const SETUP_INPUT_KINDS = [
  "schedule",
  "handoff_triggers",
  "builder_field_review",
  "documents_presence",
  "provider_integration",
  "manual_confirm",
] as const;
export type AgentSetupInputKind = (typeof SETUP_INPUT_KINDS)[number];

export const PROMPT_TONES = ["professional", "friendly", "formal", "direct"] as const;
export type PromptTone = (typeof PROMPT_TONES)[number];

export const PROMPT_TONE_LABELS: Record<PromptTone, string> = {
  professional: "Profesional",
  friendly: "Cercano",
  formal: "Formal",
  direct: "Directo",
};

export const PROMPT_BUILDER_TEXT_FIELDS = [
  "objective",
  "role",
  "audience",
  "allowedTasks",
  "restrictions",
  "humanHandoff",
  "openingMessage",
] as const;
export type PromptBuilderTextField = (typeof PROMPT_BUILDER_TEXT_FIELDS)[number];

export type PromptBuilderDraft = {
  objective: string;
  role: string;
  audience: string;
  allowedTasks: string;
  tone: PromptTone;
  restrictions: string;
  humanHandoff: string;
  openingMessage: string;
  channel: ChannelIntent;
};

export type AgentSetupChecklistItem = {
  id: string;
  label: string;
  description: string;
  status: AgentSetupChecklistItemStatus;
  required_for_activation: boolean;
  verification_mode: AgentSetupChecklistVerificationMode;
  input_kind: AgentSetupInputKind;
  options?: string[];
  builder_field?: PromptBuilderTextField;
  integration_provider?: ProviderIntegrationProvider;
  placeholder?: string;
};

export type AgentSetupTaskData = Record<string, unknown>;

export type AgentSetupState = {
  version: 1;
  template_id: AgentTemplateId;
  channel: ChannelIntent;
  setup_status: AgentSetupStatus;
  current_step: number;
  builder_draft: PromptBuilderDraft;
  task_data: AgentSetupTaskData;
  checklist: AgentSetupChecklistItem[];
};

export type ActivationReadiness = {
  canActivate: boolean;
  missingBaseFields: string[];
  blockingItems: AgentSetupChecklistItem[];
};

export type SetupResolutionContext = {
  hasReadyDocuments?: boolean;
  fallbackTimezone?: string;
  providerIntegrations?: Partial<Record<ProviderIntegrationProvider, {
    isUsable: boolean;
    hasEnabledTool: boolean;
    checklistLabel?: string;
    checklistDescription?: string;
  }>>;
};

export const promptBuilderDraftSchema = z.object({
  objective: z.string(),
  role: z.string(),
  audience: z.string(),
  allowedTasks: z.string(),
  tone: z.enum(PROMPT_TONES),
  restrictions: z.string(),
  humanHandoff: z.string(),
  openingMessage: z.string(),
  channel: z.enum(CHANNEL_INTENTS),
});

export const agentSetupChecklistItemSchema = z.object({
  id: z.string().min(1, "Item de setup invalido"),
  label: z.string().min(1, "Etiqueta invalida"),
  description: z.string().min(1, "Descripcion invalida"),
  status: z.enum(CHECKLIST_ITEM_STATUSES),
  required_for_activation: z.boolean(),
  verification_mode: z.enum(CHECKLIST_VERIFICATION_MODES).optional(),
  input_kind: z.enum(SETUP_INPUT_KINDS).optional(),
  options: z.array(z.string()).optional(),
  builder_field: z.enum(PROMPT_BUILDER_TEXT_FIELDS).optional(),
  integration_provider: z.enum(PROVIDER_INTEGRATION_PROVIDERS).optional(),
  placeholder: z.string().optional(),
});

export const agentSetupStateSchema = z.object({
  version: z.literal(1),
  template_id: z.enum(AGENT_TEMPLATE_IDS),
  channel: z.enum(CHANNEL_INTENTS),
  setup_status: z.enum(AGENT_SETUP_STATUSES),
  current_step: z.number().int().min(1).max(4),
  builder_draft: promptBuilderDraftSchema.optional(),
  task_data: z.record(z.string(), z.unknown()).optional(),
  checklist: z.array(agentSetupChecklistItemSchema),
});

export const setupProgressPatchSchema = z.object({
  currentStep: z.number().int().min(1).max(4).optional(),
  builderDraft: promptBuilderDraftSchema.partial().optional(),
  taskData: z.record(z.string(), z.unknown()).optional(),
  manualChecklist: z.array(
    z.object({
      id: z.string().min(1, "Item de setup invalido"),
      status: z.enum(CHECKLIST_ITEM_STATUSES),
    })
  ).optional(),
}).refine(
  (value) =>
    value.currentStep !== undefined ||
    value.builderDraft !== undefined ||
    value.taskData !== undefined ||
    value.manualChecklist !== undefined,
  { message: "Debes enviar al menos un cambio de setup" }
);

export function deriveSetupStatus(checklist: AgentSetupChecklistItem[]): AgentSetupStatus {
  if (checklist.length === 0) return "not_started";
  if (checklist.every((item) => item.status === "completed")) return "completed";
  if (checklist.every((item) => item.status === "pending")) return "not_started";
  if (checklist.some((item) => item.required_for_activation && item.status === "deferred")) return "blocked";
  return "in_progress";
}

export function createSetupState(input: {
  templateId: AgentTemplateId;
  channel: ChannelIntent;
  builderDraft: PromptBuilderDraft;
  checklist: AgentSetupChecklistItem[];
  taskData?: AgentSetupTaskData;
  currentStep?: number;
  fallbackTimezone?: string;
}): AgentSetupState {
  return resolveSetupState(
    {
      version: 1,
      template_id: input.templateId,
      channel: input.channel,
      setup_status: "not_started",
      current_step: input.currentStep ?? 3,
      builder_draft: { ...input.builderDraft, channel: input.channel },
      task_data: input.taskData ?? {},
      checklist: input.checklist,
    },
    { fallbackTimezone: input.fallbackTimezone }
  );
}

export function mergeSetupProgress(
  setupState: AgentSetupState,
  patch: z.infer<typeof setupProgressPatchSchema>,
  context?: SetupResolutionContext
): AgentSetupState {
  const manualStatusUpdates = new Map((patch.manualChecklist ?? []).map((item) => [item.id, item.status]));
  const checklist = setupState.checklist.map((item) => {
    const nextStatus = manualStatusUpdates.get(item.id);
    return nextStatus ? { ...item, status: nextStatus } : item;
  });

  return resolveSetupState(
    {
      ...setupState,
      current_step: patch.currentStep ?? setupState.current_step,
      builder_draft: patch.builderDraft
        ? { ...setupState.builder_draft, ...patch.builderDraft, channel: setupState.channel }
        : setupState.builder_draft,
      task_data: patch.taskData ? { ...setupState.task_data, ...patch.taskData } : setupState.task_data,
      checklist,
    },
    context
  );
}

export function resolveSetupState(
  setupState: AgentSetupState,
  context: SetupResolutionContext = {}
): AgentSetupState {
  const fallbackTimezone = context.fallbackTimezone ?? "UTC";
  const taskData: AgentSetupTaskData = { ...setupState.task_data };
  const checklist = setupState.checklist.map((item) => {
    const normalizedItem = resolveChecklistItemPresentation({
      ...item,
      verification_mode: item.verification_mode ?? "manual",
      input_kind: item.input_kind ?? "manual_confirm",
      options: item.options ?? [],
    }, context);

    return {
      ...normalizedItem,
      status: resolveChecklistItemStatus(normalizedItem, setupState, taskData, context, fallbackTimezone),
    };
  });

  return {
    ...setupState,
    builder_draft: { ...createEmptyPromptBuilderDraft(setupState.channel), ...setupState.builder_draft, channel: setupState.channel },
    task_data: taskData,
    checklist,
    setup_status: deriveSetupStatus(checklist),
  };
}

export function getSetupProgress(setupState: AgentSetupState): { completed: number; total: number; deferred: number; percent: number } {
  const total = setupState.checklist.length;
  const completed = setupState.checklist.filter((item) => item.status === "completed").length;
  const deferred = setupState.checklist.filter((item) => item.status === "deferred").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, deferred, percent };
}

export function getActivationReadiness(input: {
  name: string | null | undefined;
  systemPrompt: string | null | undefined;
  llmModel: string | null | undefined;
  llmTemperature: number | null | undefined;
  setupState: AgentSetupState | null;
  hasReadyDocuments?: boolean;
  providerIntegrations?: SetupResolutionContext["providerIntegrations"];
}): ActivationReadiness {
  const missingBaseFields: string[] = [];
  if (!input.name?.trim()) missingBaseFields.push("nombre");
  if (!input.systemPrompt?.trim()) missingBaseFields.push("system prompt");
  if (!input.llmModel?.trim()) missingBaseFields.push("modelo");
  if (input.llmTemperature === null || input.llmTemperature === undefined || Number.isNaN(input.llmTemperature) || input.llmTemperature < 0 || input.llmTemperature > 1) {
    missingBaseFields.push("temperatura");
  }

  const resolvedSetupState = input.setupState
    ? resolveSetupState(input.setupState, {
      hasReadyDocuments: input.hasReadyDocuments,
      providerIntegrations: input.providerIntegrations,
    })
    : null;
  const blockingItems = resolvedSetupState
    ? resolvedSetupState.checklist.filter((item) => item.required_for_activation && item.status !== "completed")
    : [];

  return { canActivate: missingBaseFields.length === 0 && blockingItems.length === 0, missingBaseFields, blockingItems };
}

export function getScheduleTaskData(setupState: AgentSetupState, itemId: string, fallbackTimezone = "UTC"): ScheduleTaskData {
  return normalizeScheduleTaskData(setupState.task_data[itemId], fallbackTimezone);
}

export function getCriteriaTaskData(setupState: AgentSetupState, itemId: string): CriteriaTaskData {
  return normalizeCriteriaTaskData(setupState.task_data[itemId]);
}

export function getBuilderFieldValue(setupState: AgentSetupState, field: PromptBuilderTextField | undefined): string {
  if (!field) return "";
  return setupState.builder_draft[field]?.trim() ?? "";
}

export function canManualChecklistItemBeCompleted(item: AgentSetupChecklistItem, setupState: AgentSetupState): boolean {
  if (item.input_kind === "builder_field_review") {
    return getBuilderFieldValue(setupState, item.builder_field).length > 0;
  }

  return item.verification_mode === "manual";
}

export function toSetupStateJson(setupState: AgentSetupState): Json {
  return setupState as unknown as Json;
}

function resolveChecklistItemStatus(
  item: AgentSetupChecklistItem,
  setupState: AgentSetupState,
  taskData: AgentSetupTaskData,
  context: SetupResolutionContext,
  fallbackTimezone: string
): AgentSetupChecklistItemStatus {
  if (item.verification_mode === "structured") {
    if (item.input_kind === "schedule") {
      const value = normalizeScheduleTaskData(taskData[item.id], fallbackTimezone);
      taskData[item.id] = value;
      return hasValidScheduleTaskData(value) ? "completed" : value.deferred ? "deferred" : "pending";
    }

    if (item.input_kind === "handoff_triggers") {
      const value = normalizeCriteriaTaskData(taskData[item.id]);
      taskData[item.id] = value;
      return hasValidCriteriaTaskData(value) ? "completed" : value.deferred ? "deferred" : "pending";
    }

    if (item.input_kind === "documents_presence") {
      const value = normalizeDeferredTaskData(taskData[item.id]);
      taskData[item.id] = value;
      return context.hasReadyDocuments ? "completed" : value.deferred ? "deferred" : "pending";
    }

    if (item.input_kind === "provider_integration") {
      const value = normalizeDeferredTaskData(taskData[item.id]);
      const providerState = item.integration_provider
        ? context.providerIntegrations?.[item.integration_provider]
        : undefined;

      taskData[item.id] = value;

      return providerState?.isUsable && providerState.hasEnabledTool
        ? "completed"
        : value.deferred ? "deferred" : "pending";
    }
  }

  if (item.input_kind === "builder_field_review" && item.status === "completed") {
    return canManualChecklistItemBeCompleted(item, setupState) ? "completed" : "pending";
  }

  return item.status;
}

function resolveChecklistItemPresentation(
  item: AgentSetupChecklistItem,
  context: SetupResolutionContext
): AgentSetupChecklistItem {
  if (item.input_kind !== "provider_integration" || !item.integration_provider) {
    return item;
  }

  const providerState = context.providerIntegrations?.[item.integration_provider];
  if (!providerState) {
    return item;
  }

  return {
    ...item,
    label: providerState.checklistLabel ?? item.label,
    description: providerState.checklistDescription ?? item.description,
  };
}

function createEmptyPromptBuilderDraft(channel: ChannelIntent): PromptBuilderDraft {
  return {
    objective: "",
    role: "",
    audience: "",
    allowedTasks: "",
    tone: "professional",
    restrictions: "",
    humanHandoff: "",
    openingMessage: "",
    channel,
  };
}











