import http from "node:http";
import type { RedisSubscription } from "@/lib/workers/queue-notify";
import { subscribeEventQueueNotifications } from "@/lib/workers/queue-notify";

type QueueBatchResult = {
  label: string;
  processed: number;
  failed: number;
  status: number;
};

const SWEEP_INTERVAL_MS = 30_000;
const REDIS_RECONNECT_DELAY_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const PORT = Number(process.env.PORT || "3000");
const INTERNAL_CRON_SECRET = process.env.CRON_SECRET?.trim() || "internal-worker-secret";

let shuttingDown = false;
let subscription: RedisSubscription | null = null;
let runningCycle: Promise<void> | null = null;
let rerunRequested = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let sweepTimer: NodeJS.Timeout | null = null;

const server = http.createServer((request, response) => {
  if (request.url === "/health" || request.url === "/") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
});

function createWorkerRequest(pathname: string): Request {
  return new Request(`http://127.0.0.1${pathname}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${INTERNAL_CRON_SECRET}`,
    },
  });
}

async function parseBatchResponse(label: string, response: Response): Promise<QueueBatchResult> {
  if (response.status === 204) {
    return { label, processed: 0, failed: 0, status: response.status };
  }

  let processed = 0;
  let failed = 0;

  try {
    const payload = (await response.json()) as {
      data?: {
        processed?: number;
        failed?: number;
      };
    };

    processed = typeof payload.data?.processed === "number" ? payload.data.processed : 0;
    failed = typeof payload.data?.failed === "number" ? payload.data.failed : 0;
  } catch {
    // Ignored: non-JSON responses are treated as zero counts and logged by status.
  }

  return { label, processed, failed, status: response.status };
}

async function runQueuePass(): Promise<number> {
  const results = await Promise.all([
    parseBatchResponse("events", await getEventsWorker(createWorkerRequest("/api/workers/events"))),
    parseBatchResponse("rag", await getRagWorker(createWorkerRequest("/api/workers/rag"))),
    parseBatchResponse(
      "webhooks",
      await getWebhooksWorker(createWorkerRequest("/api/workers/webhooks"))
    ),
  ]);

  let processedTotal = 0;

  for (const result of results) {
    processedTotal += result.processed;

    if (result.processed > 0 || result.failed > 0 || result.status >= 400) {
      console.info("worker.queue.batch", result);
    }
  }

  return processedTotal;
}

async function scheduleQueueCycle(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  if (runningCycle) {
    rerunRequested = true;
    return;
  }

  runningCycle = (async () => {
    let currentReason = reason;

    while (!shuttingDown) {
      const processed = await runQueuePass();
      const shouldRerun = rerunRequested || processed > 0;
      rerunRequested = false;

      if (!shouldRerun) {
        break;
      }

      currentReason = `${currentReason}:drain`;
      console.info("worker.queue.rerun", { reason: currentReason });
    }
  })()
    .catch((error) => {
      console.error("worker.queue.cycle_error", {
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      runningCycle = null;

      if (rerunRequested && !shuttingDown) {
        const pendingReason = "queued-notify";
        rerunRequested = false;
        void scheduleQueueCycle(pendingReason);
      }
    });

  await runningCycle;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleSubscriptionReconnect(): void {
  if (shuttingDown || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectSubscription();
  }, REDIS_RECONNECT_DELAY_MS);
}

async function connectSubscription(): Promise<void> {
  if (shuttingDown || subscription) {
    return;
  }

  try {
    subscription = await subscribeEventQueueNotifications(
      () => {
        void scheduleQueueCycle("redis-notify");
      },
      (error) => {
        console.error("worker.queue.redis_subscription_error", {
          error: error.message,
        });
        if (subscription) {
          void subscription.close().catch(() => undefined);
          subscription = null;
        }
        scheduleSubscriptionReconnect();
      }
    );

    console.info("worker.queue.redis_subscribed", {
      channel: "event_queue:notify",
    });
  } catch (error) {
    console.error("worker.queue.redis_connect_error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    scheduleSubscriptionReconnect();
  }
}

async function startHealthServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function stopHealthServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function waitForCurrentCycle(): Promise<void> {
  if (!runningCycle) {
    return;
  }

  await Promise.race([
    runningCycle,
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout esperando cierre del batch actual")), SHUTDOWN_TIMEOUT_MS);
    }),
  ]);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info("worker.queue.shutdown_started", { signal });

  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }

  clearReconnectTimer();

  if (subscription) {
    await subscription.close().catch(() => undefined);
    subscription = null;
  }

  await Promise.allSettled([waitForCurrentCycle(), stopHealthServer()]);

  console.info("worker.queue.shutdown_completed", { signal });
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.env.CRON_SECRET = INTERNAL_CRON_SECRET;

const [
  { GET: getEventsWorker },
  { GET: getRagWorker },
  { GET: getWebhooksWorker },
] = await Promise.all([
  import("@/app/api/workers/events/route"),
  import("@/app/api/workers/rag/route"),
  import("@/app/api/workers/webhooks/route"),
]);

await startHealthServer();
console.info("worker.queue.health_ready", { port: PORT });

await connectSubscription();

sweepTimer = setInterval(() => {
  void scheduleQueueCycle("interval-sweep");
}, SWEEP_INTERVAL_MS);

void scheduleQueueCycle("startup");
