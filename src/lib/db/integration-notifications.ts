import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getIntegrationOperationalView } from "@/lib/integrations/metadata";
import type { Integration } from "@/types/app";

const DEDUPE_WINDOW_MS = 1000 * 60 * 60 * 12;

type IntegrationNotificationInput = {
  integration: Integration;
  title: string;
  body: string;
  type: "warning" | "error" | "info";
};

function buildNotificationFingerprint(input: IntegrationNotificationInput): string {
  return [input.integration.organization_id, input.integration.id, input.type, input.title].join(":");
}

export async function insertIntegrationNotification(
  input: IntegrationNotificationInput
): Promise<boolean> {
  const serviceClient = createServiceSupabaseClient();
  const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  const { data: existing, error: existingError } = await serviceClient
    .from("notifications")
    .select("id")
    .eq("organization_id", input.integration.organization_id)
    .eq("resource_type", "integration")
    .eq("resource_id", input.integration.id)
    .eq("type", input.type)
    .eq("title", input.title)
    .gte("created_at", dedupeSince)
    .limit(1);

  if (existingError) {
    console.error("notifications.integration_lookup_error", {
      fingerprint: buildNotificationFingerprint(input),
      error: existingError.message,
    });
    return false;
  }

  if ((existing ?? []).length > 0) {
    return false;
  }

  const { error } = await serviceClient.from("notifications").insert({
    organization_id: input.integration.organization_id,
    type: input.type,
    title: input.title,
    body: input.body,
    resource_type: "integration",
    resource_id: input.integration.id,
  });

  if (error) {
    console.error("notifications.integration_insert_error", {
      fingerprint: buildNotificationFingerprint(input),
      error: error.message,
    });
    return false;
  }

  return true;
}

export async function insertIntegrationHealthNotification(
  integration: Integration
): Promise<boolean> {
  const view = getIntegrationOperationalView(integration);

  if (view.status === "connected" || view.status === "disconnected") {
    return false;
  }

  if (view.status === "expiring_soon") {
    return insertIntegrationNotification({
      integration,
      type: "warning",
      title: `${integration.name}: sesion expira pronto`,
      body: "Conviene refrescar o reautenticar esta integracion antes de que impacte en los agentes.",
    });
  }

  if (view.status === "revoked") {
    return insertIntegrationNotification({
      integration,
      type: "info",
      title: `${integration.name}: integracion revocada`,
      body: "La integracion fue revocada y ya no operara hasta que alguien la reconecte.",
    });
  }

  return insertIntegrationNotification({
    integration,
    type: "error",
    title: `${integration.name}: requiere atencion`,
    body: view.detail ?? view.summary,
  });
}
