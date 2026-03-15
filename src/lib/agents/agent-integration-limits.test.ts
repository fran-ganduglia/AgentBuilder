import assert from "node:assert/strict";
import {
  canActivateScope,
  getOrganizationPlanConfig,
  normalizeOrganizationPlanName,
  validateIntegrationSelection,
} from "./agent-integration-limits";

function run(): void {
  assert.equal(normalizeOrganizationPlanName("pro"), "growth");
  assert.equal(normalizeOrganizationPlanName("growth"), "growth");

  const starterConfig = getOrganizationPlanConfig("starter");
  assert.equal(starterConfig.maxScopesActive, 1);
  assert.equal(starterConfig.maxSessionsMonth, 300);
  assert.equal(starterConfig.integrationsUnlimited, true);

  const trialIntegrationError = validateIntegrationSelection({
    planName: "trial",
    integrationIds: ["gmail", "google_calendar"],
  });
  assert.match(trialIntegrationError ?? "", /hasta 1 integracion/i);

  const starterActivation = canActivateScope({
    planName: "starter",
    activeScopes: ["support"],
    activeAgentsInScope: 0,
    targetScope: "sales",
  });
  assert.equal(starterActivation.allowed, false);
  assert.match(starterActivation.message ?? "", /1 scope activo/i);

  const growthActivation = canActivateScope({
    planName: "growth",
    activeScopes: ["support", "sales"],
    activeAgentsInScope: 0,
    targetScope: "operations",
  });
  assert.equal(growthActivation.allowed, true);

  const sameScopeBlocked = canActivateScope({
    planName: "growth",
    activeScopes: ["support"],
    activeAgentsInScope: 1,
    targetScope: "support",
  });
  assert.equal(sameScopeBlocked.allowed, false);
  assert.match(sameScopeBlocked.message ?? "", /un solo agente activo por scope/i);

  console.log("agent-integration-limits checks passed");
}

run();
