import { NextResponse } from "next/server";
import {
  getAgentConnectionByProviderTypeAndAgentIdAcrossOrganizations,
  markAgentConnectionError,
  markAgentConnectionSynced,
} from "@/lib/db/agent-connections";
import {
  findWhatsAppIntegrationByVerifyToken,
  getWhatsAppIntegrationConfig,
} from "@/lib/db/whatsapp-integrations";
import { incrementRateLimit } from "@/lib/redis";
import { ingestWhatsAppWebhookPayload } from "@/lib/chat/whatsapp-ingestion";
import { assertUsableIntegration } from "@/lib/integrations/access";
import { verifyWhatsAppSignature } from "@/lib/whatsapp-cloud";
import type { Json } from "@/types/database";

const WEBHOOK_RATE_LIMIT_MAX_REQUESTS = 120;
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;
const WEBHOOK_REDIS_TIMEOUT_MS = 150;

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: string;
        };
      };
    }>;
  }>;
};

function buildWebhookRateLimitKey(ipAddress: string): string {
  return `rate_limit:whatsapp_webhook:${ipAddress}`;
}

function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function isWebhookRateLimited(request: Request): Promise<boolean> {
  try {
    const count = await withTimeout(
      incrementRateLimit(
        buildWebhookRateLimitKey(getRequestIp(request)),
        WEBHOOK_RATE_LIMIT_WINDOW_SECONDS
      ),
      WEBHOOK_REDIS_TIMEOUT_MS
    );

    return count > WEBHOOK_RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    console.error("whatsapp.webhook_rate_limit_error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return false;
  }
}

function extractPhoneNumberId(payload: MetaWebhookPayload): string | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (typeof phoneNumberId === "string" && phoneNumberId.length > 0) {
        return phoneNumberId;
      }
    }
  }

  return null;
}

function mergeLastSyncedAt(metadata: Json | null, syncedAt: string): Json {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};

  return {
    ...record,
    last_synced_at: syncedAt,
  } as Json;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !verifyToken || !challenge) {
    return new Response("Invalid webhook challenge", { status: 400 });
  }

  const integrationResult = await findWhatsAppIntegrationByVerifyToken(verifyToken);
  if (integrationResult.error) {
    return new Response("Webhook verification failed", { status: 500 });
  }

  if (!integrationResult.data) {
    return new Response("Forbidden", { status: 403 });
  }

  const access = assertUsableIntegration(integrationResult.data);
  if (!access.ok) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (await isWebhookRateLimited(request)) {
    return NextResponse.json({ error: "Too many webhook requests" }, { status: 429 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type debe ser application/json" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const phoneNumberId = extractPhoneNumberId(payload);
  if (!phoneNumberId) {
    return NextResponse.json({ data: { received: true, ignored: true } });
  }

  const connectionResult = await getAgentConnectionByProviderTypeAndAgentIdAcrossOrganizations(
    "whatsapp",
    phoneNumberId
  );
  if (connectionResult.error) {
    return NextResponse.json({ error: "No se pudo resolver la fuente conectada" }, { status: 500 });
  }

  if (!connectionResult.data) {
    return NextResponse.json({ data: { received: true, ignored: true } });
  }

  const integrationConfigResult = await getWhatsAppIntegrationConfig(
    connectionResult.data.integration_id,
    connectionResult.data.organization_id
  );
  if (integrationConfigResult.error || !integrationConfigResult.data) {
    await markAgentConnectionError(
      connectionResult.data.id,
      connectionResult.data.organization_id,
      "whatsapp_integration_config_missing"
    );

    return NextResponse.json(
      { error: integrationConfigResult.error ?? "No se pudo cargar la integracion de WhatsApp" },
      { status: 500 }
    );
  }

  const integrationAccess = assertUsableIntegration(integrationConfigResult.data.integration);
  if (!integrationAccess.ok) {
    await markAgentConnectionError(
      connectionResult.data.id,
      connectionResult.data.organization_id,
      "integration_revoked"
    );

    return NextResponse.json(
      { data: { received: true, ignored: true, blocked: true } },
      { status: 200 }
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const isValidSignature = verifyWhatsAppSignature(
    rawBody,
    integrationConfigResult.data.appSecret,
    signatureHeader
  );

  if (!isValidSignature) {
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  try {
    const ingestion = await ingestWhatsAppWebhookPayload(connectionResult.data, payload);
    const syncedAt = new Date().toISOString();

    await markAgentConnectionSynced(
      connectionResult.data.id,
      connectionResult.data.organization_id,
      null,
      mergeLastSyncedAt(connectionResult.data.metadata, syncedAt)
    );

    return NextResponse.json({
      data: {
        received: true,
        ...ingestion,
      },
    });
  } catch (error) {
    console.error("whatsapp.webhook_ingestion_error", {
      connectionId: connectionResult.data.id,
      organizationId: connectionResult.data.organization_id,
      error: error instanceof Error ? error.message : "unknown",
    });

    await markAgentConnectionError(
      connectionResult.data.id,
      connectionResult.data.organization_id,
      "whatsapp_webhook_processing_failed"
    );

    return NextResponse.json(
      { error: "No se pudo procesar el webhook de WhatsApp" },
      { status: 500 }
    );
  }
}
