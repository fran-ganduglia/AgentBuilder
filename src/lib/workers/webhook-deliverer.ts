import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { signPayload, decryptWebhookSecret } from "@/lib/workers/webhook-crypto";
import { validateOutboundWebhookUrl } from "@/lib/workers/webhook-url-validator";

type WebhookEvent = {
  eventId: string;
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  is_active: boolean | null;
};

const WEBHOOK_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export async function deliverWebhooks(event: WebhookEvent): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: webhooks, error: fetchError } = await supabase
    .from("organization_webhooks")
    .select("id, url, events, is_active")
    .eq("organization_id", event.organizationId)
    .eq("is_active", true);

  if (fetchError || !webhooks || webhooks.length === 0) {
    return;
  }

  const matchingWebhooks = (webhooks as unknown as WebhookRow[]).filter(
    (wh) => wh.events.includes(event.eventType) || wh.events.includes("*")
  );

  for (const webhook of matchingWebhooks) {
    await deliverSingleWebhook(webhook, event);
  }
}

async function deliverSingleWebhook(
  webhook: WebhookRow,
  event: WebhookEvent
): Promise<void> {
  const validation = await validateOutboundWebhookUrl(webhook.url);

  if (!validation.valid) {
    console.warn("webhook.url_rejected", {
      webhookId: webhook.id,
      organizationId: event.organizationId,
      eventType: event.eventType,
      reason: validation.reason,
    });

    await insertDelivery(webhook.id, event, "failed", 0, validation.reason, 1);
    return;
  }

  const secret = await decryptWebhookSecret(webhook.id);

  if (!secret) {
    await insertDelivery(webhook.id, event, "failed", 0, "No se pudo descifrar el secreto", 1);
    return;
  }

  const body = JSON.stringify({
    event_id: event.eventId,
    event_type: event.eventType,
    timestamp: new Date().toISOString(),
    payload: event.payload,
  });

  const signature = signPayload(body, secret);

  let lastError = "";
  let statusCode = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(validation.normalizedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": event.eventType,
          "X-Webhook-Id": event.eventId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      statusCode = response.status;

      if (response.ok) {
        await insertDelivery(webhook.id, event, "delivered", statusCode, null, attempt + 1);
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Error desconocido";
    }
  }

  await insertDelivery(webhook.id, event, "failed", statusCode, lastError, MAX_RETRIES + 1);
}

async function insertDelivery(
  webhookId: string,
  event: WebhookEvent,
  status: "delivered" | "failed",
  statusCode: number,
  errorMessage: string | null,
  attempts: number
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  await supabase.from("webhook_deliveries").insert({
    webhook_id: webhookId,
    organization_id: event.organizationId,
    event_type: event.eventType,
    payload: { event_id: event.eventId, ...event.payload },
    status,
    http_status_code: statusCode || null,
    response_body: errorMessage,
    attempts,
  });
}
