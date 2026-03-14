import assert from "node:assert/strict";

import { decideProviderBudgetAdmission } from "./provider-budgets";

function main(): void {
  const basePolicy = {
    methodKey: "hubspot.oauth_public_api",
    limit: 100,
    windowSeconds: 60,
  };

  const allow = decideProviderBudgetAdmission({
    currentUsage: 20,
    nextUsage: 21,
    policy: basePolicy,
  });
  assert.equal(allow.decision, "allow");
  assert.equal(allow.retryAfterSeconds, null);

  const queued = decideProviderBudgetAdmission({
    currentUsage: 84,
    nextUsage: 85,
    policy: basePolicy,
  });
  assert.equal(queued.decision, "queue");
  assert.equal(queued.retryAfterSeconds, 30);

  const throttled = decideProviderBudgetAdmission({
    currentUsage: 94,
    nextUsage: 95,
    policy: basePolicy,
  });
  assert.equal(throttled.decision, "throttle");
  assert.equal(throttled.retryAfterSeconds, 60);

  const rejected = decideProviderBudgetAdmission({
    currentUsage: 100,
    nextUsage: 101,
    policy: basePolicy,
  });
  assert.equal(rejected.decision, "reject");
  assert.equal(rejected.retryAfterSeconds, 60);

  console.log("provider budget allocator checks passed");
}

main();

export {};
