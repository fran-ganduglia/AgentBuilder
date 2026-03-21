import type { ActionPlanV1, RuntimeActionType } from "@/lib/runtime/types";
import {
  isRuntimeActionDisabled,
  type RuntimeKillSwitchConfigV1,
} from "./runtime-kill-switch";

export type RuntimeSurface = "gmail" | "google_calendar" | "google_sheets" | "salesforce";

type GoogleRuntimeLike = {
  actionPolicies: Array<{
    action: string;
  }>;
};

type SalesforceRuntimeLike = {
  config: {
    allowed_actions?: string[];
  };
};

export type RuntimeAvailabilityLike = {
  gmail: GoogleRuntimeLike | null;
  google_calendar: GoogleRuntimeLike | null;
  google_sheets: GoogleRuntimeLike | null;
  salesforce: SalesforceRuntimeLike | null;
};

export type RuntimeChatRoutingDecision = {
  shouldAttemptPlanner: boolean;
  runtimeDecision: "accept" | "reject";
  rejectionReason:
    | "no_supported_runtime_surface"
    | "planner_empty"
    | "planner_invalid_output"
    | "planner_failed"
    | "runtime_unavailable_for_action"
    | null;
  unsupportedActions: RuntimeActionType[];
  actionAvailability: Array<{
    actionType: RuntimeActionType;
    surface: RuntimeSurface;
    runtimeAvailable: boolean;
    actionAllowedByAgent: boolean;
    runtimeEnabled: boolean;
  }>;
};

const RUNTIME_CAPABLE_SURFACES = new Set<RuntimeSurface>([
  "gmail",
  "google_calendar",
  "google_sheets",
  "salesforce",
]);

export function getRuntimeActionSurface(actionType: RuntimeActionType): RuntimeSurface {
  switch (actionType) {
    case "search_email":
    case "summarize_thread":
    case "send_email":
    case "create_draft_email":
    case "create_draft_reply":
    case "send_reply":
    case "archive_thread":
    case "apply_label":
      return "gmail";
    case "create_event":
    case "reschedule_event":
    case "cancel_event":
    case "list_events":
    case "check_availability":
      return "google_calendar";
    case "read_sheet_range":
    case "append_sheet_rows":
    case "update_sheet_range":
    case "list_sheets":
    case "find_rows":
    case "append_records":
    case "get_headers":
    case "preview_sheet":
    case "clear_range":
    case "create_spreadsheet":
      return "google_sheets";
    case "search_records":
    case "create_lead":
    case "update_lead":
    case "create_task":
      return "salesforce";
  }
}

function getProviderActionAliases(actionType: RuntimeActionType): string[] {
  switch (actionType) {
    case "search_email":
      return ["search_threads"];
    case "summarize_thread":
      return ["read_thread"];
    case "send_email":
    case "archive_thread":
    case "apply_label":
    case "create_draft_email":
    case "create_draft_reply":
    case "send_reply":
    case "create_event":
    case "reschedule_event":
    case "cancel_event":
    case "list_events":
    case "create_lead":
    case "update_lead":
    case "create_task":
    case "find_rows":
    case "append_records":
    case "create_spreadsheet":
      return [actionType];
    case "check_availability":
      return ["check_availability", "list_events"];
    case "read_sheet_range":
      return ["read_range"];
    case "append_sheet_rows":
      return ["append_rows"];
    case "update_sheet_range":
      return ["update_range"];
    case "list_sheets":
      return ["list_sheets", "get_spreadsheet"];
    case "get_headers":
      return ["get_headers"];
    case "preview_sheet":
      return ["preview_sheet"];
    case "clear_range":
      return ["clear_range"];
    case "search_records":
      return ["lookup_records", "lookup_accounts", "lookup_opportunities", "lookup_cases"];
  }
}

export function isRuntimeActionAllowedForAgent(
  actionType: RuntimeActionType,
  runtimes: RuntimeAvailabilityLike
): boolean {
  const surface = getRuntimeActionSurface(actionType);
  const aliases = getProviderActionAliases(actionType);

  if (surface === "salesforce") {
    const runtime = runtimes.salesforce;
    const allowedActions = new Set<string>(runtime?.config.allowed_actions ?? []);
    return runtime !== null && aliases.some((alias) => allowedActions.has(alias));
  }

  const runtime = runtimes[surface];
  if (!runtime) {
    return false;
  }

  const allowedActions = new Set<string>(runtime.actionPolicies.map((policy) => policy.action));
  return aliases.some((alias) => allowedActions.has(alias));
}

export function shouldAttemptRuntimePlanner(input: {
  selectedSurfaces: string[];
  runtimes: RuntimeAvailabilityLike;
}): boolean {
  if (input.selectedSurfaces.length === 0) {
    return false;
  }

  return input.selectedSurfaces.some((surface): surface is RuntimeSurface =>
    RUNTIME_CAPABLE_SURFACES.has(surface as RuntimeSurface)
  );
}

function hasRuntimeForAction(
  actionType: RuntimeActionType,
  runtimes: RuntimeAvailabilityLike
): boolean {
  return runtimes[getRuntimeActionSurface(actionType)] !== null;
}

export function resolveRuntimeChatRoutingDecision(input: {
  selectedSurfaces: string[];
  runtimes: RuntimeAvailabilityLike;
  plan: ActionPlanV1 | null;
  plannerErrorType?: string | null;
  killSwitch?: RuntimeKillSwitchConfigV1;
}): RuntimeChatRoutingDecision {
  const shouldAttemptPlanner = shouldAttemptRuntimePlanner({
    selectedSurfaces: input.selectedSurfaces,
    runtimes: input.runtimes,
  });

  if (!shouldAttemptPlanner) {
    return {
      shouldAttemptPlanner: false,
      runtimeDecision: "reject",
      rejectionReason: "no_supported_runtime_surface",
      unsupportedActions: [],
      actionAvailability: [],
    };
  }

  if (!input.plan || input.plan.actions.length === 0) {
    return {
      shouldAttemptPlanner: true,
      runtimeDecision: "reject",
      rejectionReason: input.plannerErrorType
        ? "planner_failed"
        : input.plan?.missingFields.includes("planner_invalid_output")
          ? "planner_invalid_output"
          : "planner_empty",
      unsupportedActions: [],
      actionAvailability: [],
    };
  }

  const actionAvailability = input.plan.actions.map((action) => ({
    actionType: action.type,
    surface: getRuntimeActionSurface(action.type),
    runtimeAvailable: hasRuntimeForAction(action.type, input.runtimes),
    actionAllowedByAgent: isRuntimeActionAllowedForAgent(action.type, input.runtimes),
    runtimeEnabled: input.killSwitch
      ? !isRuntimeActionDisabled(
          action.type,
          getRuntimeActionSurface(action.type),
          input.killSwitch
        )
      : true,
  }));
  const unsupportedActions = actionAvailability
    .filter((action) => !action.runtimeAvailable || !action.actionAllowedByAgent || !action.runtimeEnabled)
    .map((action) => action.actionType);

  return {
    shouldAttemptPlanner: true,
    runtimeDecision: unsupportedActions.length === 0 ? "accept" : "reject",
    rejectionReason: unsupportedActions.length > 0 ? "runtime_unavailable_for_action" : null,
    unsupportedActions,
    actionAvailability,
  };
}
