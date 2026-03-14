import http from "node:http";
import type { RedisSubscription } from "@/lib/workers/queue-notify";
import { subscribeEventQueueNotifications } from "@/lib/workers/queue-notify";

type QueueBatchResult = {
  label: string;
  processed: number;
  failed: number;
  status: number;
};

type WorkerGetHandler = (request: Request) => Promise<Response>;

type ScheduledJob = {
  name: string;
  intervalMs: number;
  handler: WorkerGetHandler;
  path: string;
};

const PORT = Number(process.env.PORT || "3000");
const INTERNAL_CRON_SECRET = process.env.CRON_SECRET?.trim() || "internal-worker-secret";
const SWEEP_INTERVAL_MS = 30_000;
const REDIS_RECONNECT_DELAY_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

let shuttingDown = false;
let subscription: RedisSubscription | null = null;
let queueCycle: Promise<void> | null = null;
let queueRerunRequested = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let sweepTimer: NodeJS.Timeout | null = null;
const activeMaintenanceRuns = new Map<string, Promise<void>>();
const maintenanceTimers = new Map<string, NodeJS.Timeout>();

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
    // Ignore non-JSON responses and rely on status/logs.
  }

  return { label, processed, failed, status: response.status };
}

async function runQueuePass(queueHandlers: {
  getEventsWorker: WorkerGetHandler;
  getRagWorker: WorkerGetHandler;
  getWebhooksWorker: WorkerGetHandler;
}): Promise<number> {
  const results = await Promise.all([
    parseBatchResponse(
      "events",
      await queueHandlers.getEventsWorker(createWorkerRequest("/api/workers/events"))
    ),
    parseBatchResponse(
      "rag",
      await queueHandlers.getRagWorker(createWorkerRequest("/api/workers/rag"))
    ),
    parseBatchResponse(
      "webhooks",
      await queueHandlers.getWebhooksWorker(createWorkerRequest("/api/workers/webhooks"))
    ),
  ]);

  let processedTotal = 0;

  for (const result of results) {
    processedTotal += result.processed;

    if (result.processed > 0 || result.failed > 0 || result.status >= 400) {
      console.info("worker.service.queue_batch", result);
    }
  }

  return processedTotal;
}

async function scheduleQueueCycle(
  queueHandlers: {
    getEventsWorker: WorkerGetHandler;
    getRagWorker: WorkerGetHandler;
    getWebhooksWorker: WorkerGetHandler;
  },
  reason: string
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  if (queueCycle) {
    queueRerunRequested = true;
    return;
  }

  queueCycle = (async () => {
    while (!shuttingDown) {
      const processed = await runQueuePass(queueHandlers);
      const shouldRerun = queueRerunRequested || processed > 0;
      queueRerunRequested = false;

      if (!shouldRerun) {
        break;
      }

      console.info("worker.service.queue_rerun", { reason });
    }
  })()
    .catch((error) => {
      console.error("worker.service.queue_cycle_error", {
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      queueCycle = null;

      if (queueRerunRequested && !shuttingDown) {
        const pendingReason = "queued-notify";
        queueRerunRequested = false;
        void scheduleQueueCycle(queueHandlers, pendingReason);
      }
    });

  await queueCycle;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleSubscriptionReconnect(
  queueHandlers: {
    getEventsWorker: WorkerGetHandler;
    getRagWorker: WorkerGetHandler;
    getWebhooksWorker: WorkerGetHandler;
  }
): void {
  if (shuttingDown || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectSubscription(queueHandlers);
  }, REDIS_RECONNECT_DELAY_MS);
}

async function connectSubscription(
  queueHandlers: {
    getEventsWorker: WorkerGetHandler;
    getRagWorker: WorkerGetHandler;
    getWebhooksWorker: WorkerGetHandler;
  }
): Promise<void> {
  if (shuttingDown || subscription) {
    return;
  }

  try {
    subscription = await subscribeEventQueueNotifications(
      () => {
        void scheduleQueueCycle(queueHandlers, "redis-notify");
      },
      (error) => {
        console.error("worker.service.redis_subscription_error", {
          error: error.message,
        });

        if (subscription) {
          void subscription.close().catch(() => undefined);
          subscription = null;
        }

        scheduleSubscriptionReconnect(queueHandlers);
      }
    );

    console.info("worker.service.redis_subscribed", {
      channel: "event_queue:notify",
    });
  } catch (error) {
    console.error("worker.service.redis_connect_error", {
      error: error instanceof Error ? error.message : "unknown",
    });
    scheduleSubscriptionReconnect(queueHandlers);
  }
}

async function summarizeResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function runMaintenanceJob(job: ScheduledJob, reason: string): Promise<void> {
  if (shuttingDown || activeMaintenanceRuns.has(job.name)) {
    return;
  }

  const runPromise = (async () => {
    const response = await job.handler(createWorkerRequest(job.path));
    const summary = await summarizeResponse(response);

    if (response.status !== 204) {
      console.info("worker.service.maintenance_job", {
        job: job.name,
        reason,
        status: response.status,
        summary,
      });
    }
  })()
    .catch((error) => {
      console.error("worker.service.maintenance_job_error", {
        job: job.name,
        reason,
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      activeMaintenanceRuns.delete(job.name);
    });

  activeMaintenanceRuns.set(job.name, runPromise);
  await runPromise;
}

function scheduleMaintenanceJobs(jobs: ScheduledJob[]): void {
  for (const job of jobs) {
    const timer = setInterval(() => {
      void runMaintenanceJob(job, "interval");
    }, job.intervalMs);

    maintenanceTimers.set(job.name, timer);
    void runMaintenanceJob(job, "startup");
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

async function waitForQueueCycle(): Promise<void> {
  if (!queueCycle) {
    return;
  }

  await Promise.race([
    queueCycle,
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout esperando cierre del batch de cola")), SHUTDOWN_TIMEOUT_MS);
    }),
  ]);
}

async function waitForMaintenanceRuns(): Promise<void> {
  const runs = Array.from(activeMaintenanceRuns.values());
  if (runs.length === 0) {
    return;
  }

  await Promise.race([
    Promise.allSettled(runs).then(() => undefined),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout esperando jobs de mantenimiento")), SHUTDOWN_TIMEOUT_MS);
    }),
  ]);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info("worker.service.shutdown_started", { signal });

  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }

  clearReconnectTimer();

  for (const timer of maintenanceTimers.values()) {
    clearInterval(timer);
  }
  maintenanceTimers.clear();

  if (subscription) {
    await subscription.close().catch(() => undefined);
    subscription = null;
  }

  await Promise.allSettled([waitForQueueCycle(), waitForMaintenanceRuns(), stopHealthServer()]);

  console.info("worker.service.shutdown_completed", { signal });
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
  approvalsRoute,
  integrationsRoute,
  deletionRoute,
  oauthRefreshRoute,
  conversationReengagementRoute,
  whatsAppFollowupRoute,
  whatsAppBroadcastRoute,
] = await Promise.all([
  import("@/app/api/workers/events/route"),
  import("@/app/api/workers/rag/route"),
  import("@/app/api/workers/webhooks/route"),
  import("@/app/api/workers/approvals/route"),
  import("@/app/api/workers/integrations/route"),
  import("@/app/api/workers/deletion/route"),
  import("@/app/api/workers/oauth/refresh/route"),
  import("@/app/api/workers/conversations/reengagement/route"),
  import("@/app/api/workers/whatsapp/followup/route"),
  import("@/app/api/workers/whatsapp/broadcast/route"),
]);

const queueHandlers = {
  getEventsWorker,
  getRagWorker,
  getWebhooksWorker,
};

const maintenanceJobs: ScheduledJob[] = [
  {
    name: "approvals",
    intervalMs: 15 * 60 * 1000,
    handler: approvalsRoute.GET,
    path: "/api/workers/approvals",
  },
  {
    name: "oauth-refresh",
    intervalMs: 10 * 60 * 1000,
    handler: oauthRefreshRoute.GET,
    path: "/api/workers/oauth/refresh",
  },
  {
    name: "deletion",
    intervalMs: 15 * 60 * 1000,
    handler: deletionRoute.GET,
    path: "/api/workers/deletion",
  },
  {
    name: "integrations",
    intervalMs: 60 * 60 * 1000,
    handler: integrationsRoute.GET,
    path: "/api/workers/integrations",
  },
  {
    name: "conversation-reengagement",
    intervalMs: 60 * 60 * 1000,
    handler: conversationReengagementRoute.GET,
    path: "/api/workers/conversations/reengagement",
  },
  {
    name: "whatsapp-followup",
    intervalMs: 15 * 60 * 1000,
    handler: whatsAppFollowupRoute.GET,
    path: "/api/workers/whatsapp/followup",
  },
  {
    name: "whatsapp-broadcast",
    intervalMs: 30 * 60 * 1000,
    handler: whatsAppBroadcastRoute.GET,
    path: "/api/workers/whatsapp/broadcast",
  },
];

await startHealthServer();
console.info("worker.service.health_ready", { port: PORT });

await connectSubscription(queueHandlers);
scheduleMaintenanceJobs(maintenanceJobs);

sweepTimer = setInterval(() => {
  void scheduleQueueCycle(queueHandlers, "interval-sweep");
}, SWEEP_INTERVAL_MS);

void scheduleQueueCycle(queueHandlers, "startup");
