import assert from "node:assert/strict";

import { readRuntimeKillSwitchConfig } from "./runtime-kill-switch";

function readDefaultsTest(): void {
  const config = readRuntimeKillSwitchConfig(null);

  assert.deepEqual(config.disabledSurfaces, []);
  assert.deepEqual(config.disabledActionTypes, []);
}

function readConfiguredValuesTest(): void {
  const config = readRuntimeKillSwitchConfig({
    runtime_rollout: {
      disabled_surfaces: ["gmail", "google_sheets", "invalid"],
      disabled_action_types: ["send_email", "update_sheet_range", "unknown"],
    },
  });

  assert.deepEqual(config.disabledSurfaces, ["gmail", "google_sheets"]);
  assert.deepEqual(config.disabledActionTypes, ["send_email", "update_sheet_range"]);
}

function ignoresLegacyCompatKeysTest(): void {
  const config = readRuntimeKillSwitchConfig({
    runtime_rollout: {
      default_mode: "legacy_default",
      legacy_forced_surfaces: ["gmail"],
      legacy_forced_action_types: ["send_email"],
      freeze_legacy_features: false,
    },
  });

  assert.deepEqual(config.disabledSurfaces, []);
  assert.deepEqual(config.disabledActionTypes, []);
}

function main(): void {
  readDefaultsTest();
  readConfiguredValuesTest();
  ignoresLegacyCompatKeysTest();
  console.log("runtime kill switch checks passed");
}

main();
