import type { RuntimeActionType } from "./types";

export const RUNTIME_ACTION_ESTIMATED_COST_USD: Record<RuntimeActionType, number> = {
  search_email: 0.002,
  summarize_thread: 0.003,
  send_email: 0.01,
  create_draft_email: 0.007,
  create_draft_reply: 0.007,
  send_reply: 0.01,
  archive_thread: 0.006,
  apply_label: 0.006,
  create_event: 0.008,
  reschedule_event: 0.008,
  cancel_event: 0.007,
  list_events: 0.003,
  check_availability: 0.002,
  read_sheet_range: 0.003,
  append_sheet_rows: 0.008,
  update_sheet_range: 0.01,
  list_sheets: 0.002,
  find_rows: 0.003,
  append_records: 0.009,
  get_headers: 0.002,
  preview_sheet: 0.002,
  clear_range: 0.008,
  create_spreadsheet: 0.01,
  search_records: 0.004,
  create_lead: 0.012,
  update_lead: 0.01,
  create_task: 0.009,
};

export function estimateRuntimeActionCostUsd(actionType: RuntimeActionType): number {
  return RUNTIME_ACTION_ESTIMATED_COST_USD[actionType] ?? 0.01;
}
