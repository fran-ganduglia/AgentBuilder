import assert from "node:assert/strict";

import type { IntegrationAdapterV1 } from "@/lib/runtime/types";

import { createAdapterPlatformV1 } from "./platform";

function createAdapter(provider: IntegrationAdapterV1["provider"]): IntegrationAdapterV1 {
  return {
    manifest: {
      id: `runtime.${provider}`,
      version: "1.0.0",
      provider,
      capability: provider === "salesforce" ? "crm" : "email",
      supportedActionTypes: provider === "salesforce" ? ["search_records"] : ["search_email"],
      requiredScopes: [],
      operationalLimits: {},
      supportsSimulation: true,
      supportsCompensation: false,
      featureFlagKey: `runtime_adapter_${provider}`,
    },
    provider,
    capability: provider === "salesforce" ? "crm" : "email",
    actionTypes: provider === "salesforce" ? ["search_records"] : ["search_email"],
    supports: ({ action }) =>
      provider === "salesforce"
        ? action.type === "search_records"
        : action.type === "search_email",
    compile: () => ({}),
    simulate: () => ({
      provider,
      payload: {},
      summary: "ok",
      preview: {},
    }),
    execute: () => ({
      provider,
      payload: {},
      output: {},
      summary: "ok",
    }),
    normalizeOutput: () => ({}),
    normalizeError: ({ error }) => ({
      code: "provider_retryable",
      status: "failed",
      reason: error instanceof Error ? error.message : "error",
      provider,
    }),
    buildIdempotencyMaterial: () => ({}),
  };
}

async function main(): Promise<void> {
  let currentTime = new Date("2026-03-18T10:00:00.000Z");
  const platform = createAdapterPlatformV1({
    featureFlags: {
      gmail: true,
      salesforce: false,
    },
    failureThreshold: 3,
    cooldownMs: 60_000,
    now: () => currentTime,
  });

  const gmailAdapter = createAdapter("gmail");
  const salesforceAdapter = createAdapter("salesforce");

  const initialHealth = platform.getHealth({
    adapter: gmailAdapter,
    integrationId: "integration-1",
  });
  assert.equal(initialHealth.status, "healthy");

  for (let index = 0; index < 3; index += 1) {
    platform.recordFailure({
      adapter: gmailAdapter,
      integrationId: "integration-1",
      error: {
        code: "provider_retryable",
        status: "failed",
        reason: "timeout",
        provider: "gmail",
      },
    });
  }

  const openHealth = platform.getHealth({
    adapter: gmailAdapter,
    integrationId: "integration-1",
  });
  assert.equal(openHealth.status, "circuit_open");
  assert.equal(openHealth.consecutiveFailures, 3);

  currentTime = new Date("2026-03-18T10:02:00.000Z");
  const recoveredHealth = platform.getHealth({
    adapter: gmailAdapter,
    integrationId: "integration-1",
  });
  assert.equal(recoveredHealth.status, "degraded");

  platform.recordSuccess({
    adapter: gmailAdapter,
    integrationId: "integration-1",
  });
  assert.equal(
    platform.getHealth({
      adapter: gmailAdapter,
      integrationId: "integration-1",
    }).status,
    "healthy"
  );

  assert.equal(
    platform.getHealth({
      adapter: salesforceAdapter,
    }).status,
    "disabled"
  );

  const probe = platform.probeAdapter(gmailAdapter);
  assert.equal(probe.version, "1.0.0");
  assert.equal(probe.enabled, true);
  console.log("runtime adapter platform checks passed");
}

void main();
