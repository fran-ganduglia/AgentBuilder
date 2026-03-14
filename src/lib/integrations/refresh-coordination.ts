import { randomUUID } from "node:crypto";

type RefreshObservedState = {
  tokenGeneration: number;
  authStatus: string | null;
};

export type RefreshCoordinationResult =
  | { kind: "winner" }
  | { kind: "follower"; state: RefreshObservedState }
  | { kind: "timeout"; state: RefreshObservedState };

export type RefreshLockErrorStrategy = "throw" | "refresh_without_lock" | "timeout";

export type RefreshLockStore = {
  acquire: (key: string, token: string, ttlSeconds: number) => Promise<boolean>;
  release: (key: string, token: string) => Promise<boolean>;
};

const DEFAULT_LOCK_TTL_SECONDS = 15;
const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_MAX_WAIT_MS = 4_000;

async function getDefaultRedisLockStore(): Promise<RefreshLockStore> {
  const { acquireRedisLock, releaseRedisLock } = await import("@/lib/redis");

  return {
    acquire: acquireRedisLock,
    release: releaseRedisLock,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildIntegrationRefreshLockKey(
  provider: string,
  integrationId: string
): string {
  return `integration_refresh:${provider}:${integrationId}`;
}

export async function coordinateIntegrationRefresh(input: {
  provider: string;
  integrationId: string;
  loadState: () => Promise<RefreshObservedState>;
  refresh: () => Promise<void>;
  lockStore?: RefreshLockStore;
  lockTtlSeconds?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onLockError?: RefreshLockErrorStrategy;
}): Promise<RefreshCoordinationResult> {
  const lockStore = input.lockStore ?? await getDefaultRedisLockStore();
  const lockTtlSeconds = input.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = input.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const onLockError = input.onLockError ?? "throw";
  const initialState = await input.loadState();
  const lockKey = buildIntegrationRefreshLockKey(
    input.provider,
    input.integrationId
  );
  const lockToken = randomUUID();
  let acquired = false;

  try {
    acquired = await lockStore.acquire(lockKey, lockToken, lockTtlSeconds);
  } catch (error) {
    if (onLockError === "refresh_without_lock") {
      await input.refresh();
      return { kind: "winner" };
    }

    if (onLockError === "timeout") {
      const latestState = await input.loadState();
      return { kind: "timeout", state: latestState };
    }

    throw error;
  }

  if (acquired) {
    try {
      await input.refresh();
      return { kind: "winner" };
    } finally {
      await lockStore.release(lockKey, lockToken).catch(() => false);
    }
  }

  const deadline = Date.now() + maxWaitMs;
  let latestState = initialState;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    latestState = await input.loadState();

    if (latestState.authStatus === "reauth_required") {
      return { kind: "follower", state: latestState };
    }

    if (latestState.tokenGeneration !== initialState.tokenGeneration) {
      return { kind: "follower", state: latestState };
    }
  }

  latestState = await input.loadState();
  return { kind: "timeout", state: latestState };
}
