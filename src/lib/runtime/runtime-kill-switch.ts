import type { Json } from "@/types/database";
import type { RuntimeActionType } from "./types";

export type RuntimeProviderSurfaceV1 =
  | "gmail"
  | "google_calendar"
  | "google_sheets"
  | "salesforce";

export type RuntimeKillSwitchConfigV1 = {
  disabledSurfaces: RuntimeProviderSurfaceV1[];
  disabledActionTypes: RuntimeActionType[];
};

type JsonRecord = Record<string, Json>;

const KNOWN_RUNTIME_SURFACES: RuntimeProviderSurfaceV1[] = [
  "gmail",
  "google_calendar",
  "google_sheets",
  "salesforce",
];

const KNOWN_RUNTIME_ACTIONS: RuntimeActionType[] = [
  "search_email",
  "summarize_thread",
  "send_email",
  "create_event",
  "archive_thread",
  "apply_label",
  "reschedule_event",
  "cancel_event",
  "list_events",
  "read_sheet_range",
  "append_sheet_rows",
  "update_sheet_range",
  "search_records",
  "create_lead",
  "update_lead",
  "create_task",
];

const DEFAULT_KILL_SWITCH_CONFIG: RuntimeKillSwitchConfigV1 = {
  disabledSurfaces: [],
  disabledActionTypes: [],
};

function asRecord(value: Json | null | undefined): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function readStringArray<T extends string>(input: Json | undefined, allowed: readonly T[]): T[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((value): value is T => typeof value === "string" && allowed.includes(value as T));
}

export function readRuntimeKillSwitchConfig(
  organizationSettings: Json | null | undefined
): RuntimeKillSwitchConfigV1 {
  const settingsRecord = asRecord(organizationSettings);
  const runtimeRollout = asRecord(settingsRecord?.runtime_rollout ?? null);
  if (!runtimeRollout) {
    return DEFAULT_KILL_SWITCH_CONFIG;
  }

  return {
    disabledSurfaces: readStringArray(
      runtimeRollout.disabled_surfaces,
      KNOWN_RUNTIME_SURFACES
    ),
    disabledActionTypes: readStringArray(
      runtimeRollout.disabled_action_types,
      KNOWN_RUNTIME_ACTIONS
    ),
  };
}

export function isRuntimeSurfaceDisabled(
  surface: RuntimeProviderSurfaceV1,
  killSwitch: RuntimeKillSwitchConfigV1
): boolean {
  return killSwitch.disabledSurfaces.includes(surface);
}

export function isRuntimeActionDisabled(
  actionType: RuntimeActionType,
  surface: RuntimeProviderSurfaceV1,
  killSwitch: RuntimeKillSwitchConfigV1
): boolean {
  return (
    killSwitch.disabledSurfaces.includes(surface) ||
    killSwitch.disabledActionTypes.includes(actionType)
  );
}
