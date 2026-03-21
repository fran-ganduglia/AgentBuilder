import assert from "node:assert/strict";
import {
  createDefaultAgentSetupState,
  getResolvedToolsForIntegration,
} from "./agent-setup";

function run(): void {
  const gmailOnlySetup = createDefaultAgentSetupState({
    integrations: ["gmail"],
    toolScopePreset: "conservative",
  });

  assert.deepEqual(getResolvedToolsForIntegration(gmailOnlySetup, "gmail"), [
    "search_threads",
    "read_thread",
  ]);
  assert.deepEqual(getResolvedToolsForIntegration(gmailOnlySetup, "google_calendar"), []);
  assert.deepEqual(getResolvedToolsForIntegration(gmailOnlySetup, "google_sheets"), []);

  const customSheetsSetup = createDefaultAgentSetupState({
    integrations: ["google_sheets"],
    toolScopePreset: "custom",
  });
  customSheetsSetup.task_data = {
    tool_scope_custom: {
      google_sheets: ["read_range", "list_sheets"],
      gmail: ["search_threads"],
    },
  };

  assert.deepEqual(getResolvedToolsForIntegration(customSheetsSetup, "google_sheets"), [
    "read_range",
    "list_sheets",
  ]);
  assert.deepEqual(getResolvedToolsForIntegration(customSheetsSetup, "gmail"), []);

  console.log("agent-setup checks passed");
}

run();
