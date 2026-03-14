import http from "node:http";

type WorkerGetHandler = (request: Request) => Promise<Response>;

type ScheduledJob = {
  name: string;
  intervalMs: number;
  handler: WorkerGetHandler;
  path: string;
};

const SHUTDOWN_TIMEOUT_MS = 15_000;
const PORT = Number(process.env.PORT || "3001");
const INTERNAL_CRON_SECRET = process.env.CRON_SECRET?.trim() || "internal-worker-secret";

let scheduledJobs: ScheduledJob[] = [];

let shuttingDown = false;

const server = http.createServer((request, response) => {
  if (request.url === "/health" || request.url === "/") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
});

const activeRuns = new Map<string, Promise<void>>();
const timers = new Map<string, NodeJS.Timeout>();

function createWorkerRequest(pathname: string): Request {
  return new Request(`http://127.0.0.1${pathname}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${INTERNAL_CRON_SECRET}`,
    },
  });
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

async function runJob(job: ScheduledJob, reason: string): Promise<void> {
  if (shuttingDown || activeRuns.has(job.name)) {
    return;
  }

  const runPromise = (async () => {
    const response = await job.handler(createWorkerRequest(job.path));
    const summary = await summarizeResponse(response);

    if (response.status !== 204) {
      console.info("worker.maintenance.job", {
        job: job.name,
        reason,
        status: response.status,
        summary,
      });
    }
  })()
    .catch((error) => {
      console.error("worker.maintenance.job_error", {
        job: job.name,
        reason,
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      activeRuns.delete(job.name);
    });

  activeRuns.set(job.name, runPromise);
  await runPromise;
}

function scheduleJob(job: ScheduledJob): void {
  const timer = setInterval(() => {
    void runJob(job, "interval");
  }, job.intervalMs);

  timers.set(job.name, timer);
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

async function waitForActiveRuns(): Promise<void> {
  const runs = Array.from(activeRuns.values());
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
  console.info("worker.maintenance.shutdown_started", { signal });

  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();

  await Promise.allSettled([waitForActiveRuns(), stopHealthServer()]);

  console.info("worker.maintenance.shutdown_completed", { signal });
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
  approvalsRoute,
  integrationsRoute,
  deletionRoute,
  oauthRefreshRoute,
  conversationReengagementRoute,
  whatsAppFollowupRoute,
  whatsAppBroadcastRoute,
] = await Promise.all([
  import("@/app/api/workers/approvals/route"),
  import("@/app/api/workers/integrations/route"),
  import("@/app/api/workers/deletion/route"),
  import("@/app/api/workers/oauth/refresh/route"),
  import("@/app/api/workers/conversations/reengagement/route"),
  import("@/app/api/workers/whatsapp/followup/route"),
  import("@/app/api/workers/whatsapp/broadcast/route"),
]);

scheduledJobs = [
  {
    name: "approvals",
    intervalMs: 10 * 60 * 1000,
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
    intervalMs: 30 * 60 * 1000,
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
    intervalMs: 10 * 60 * 1000,
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
console.info("worker.maintenance.health_ready", { port: PORT });

for (const job of scheduledJobs) {
  scheduleJob(job);
  void runJob(job, "startup");
}
