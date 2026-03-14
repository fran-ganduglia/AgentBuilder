import assert from "node:assert/strict";
import {
  buildIntegrationRefreshLockKey,
  coordinateIntegrationRefresh,
} from "./refresh-coordination";

async function runWinnerTest(): Promise<void> {
  let refreshCalls = 0;
  let released = false;

  const result = await coordinateIntegrationRefresh({
    provider: "hubspot",
    integrationId: "integration-1",
    loadState: async () => ({ tokenGeneration: 1, authStatus: "ok" }),
    refresh: async () => {
      refreshCalls += 1;
    },
    lockStore: {
      acquire: async (key: string, token: string, ttl: number) => {
        assert.equal(key, buildIntegrationRefreshLockKey("hubspot", "integration-1"));
        assert.ok(token.length > 0);
        assert.equal(ttl, 15);
        return true;
      },
      release: async () => {
        released = true;
        return true;
      },
    },
  });

  assert.deepEqual(result, { kind: "winner" });
  assert.equal(refreshCalls, 1);
  assert.equal(released, true);
}

async function runFollowerTest(): Promise<void> {
  let tokenGeneration = 7;

  setTimeout(() => {
    tokenGeneration = 8;
  }, 20);

  const result = await coordinateIntegrationRefresh({
    provider: "hubspot",
    integrationId: "integration-2",
    loadState: async () => ({ tokenGeneration, authStatus: "ok" }),
    refresh: async () => {
      throw new Error("Follower no deberia refrescar");
    },
    lockStore: {
      acquire: async () => false,
      release: async () => true,
    },
    pollIntervalMs: 5,
    maxWaitMs: 80,
  });

  assert.equal(result.kind, "follower");
  assert.equal(result.state.tokenGeneration, 8);
}

async function runTimeoutTest(): Promise<void> {
  const result = await coordinateIntegrationRefresh({
    provider: "hubspot",
    integrationId: "integration-3",
    loadState: async () => ({ tokenGeneration: 3, authStatus: "ok" }),
    refresh: async () => {
      throw new Error("Timeout follower no deberia refrescar");
    },
    lockStore: {
      acquire: async () => false,
      release: async () => true,
    },
    pollIntervalMs: 5,
    maxWaitMs: 20,
  });

  assert.equal(result.kind, "timeout");
  assert.equal(result.state.tokenGeneration, 3);
}

async function main(): Promise<void> {
  await runWinnerTest();
  await runFollowerTest();
  await runTimeoutTest();
  console.log("refresh-coordination checks passed");
}

void main();