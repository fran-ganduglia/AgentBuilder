import { NextResponse } from "next/server";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const INTEGRATION_TYPE = "hubspot";

async function listActiveHubSpotIntegrations(): Promise<
  Array<{ id: string; organization_id: string; metadata: Record<string, unknown> | null }>
> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("id, organization_id, metadata")
    .eq("type", INTEGRATION_TYPE)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null,
  }));
}

function getAuthStatus(metadata: Record<string, unknown> | null): string | null {
  return typeof metadata?.auth_status === "string" ? metadata.auth_status : null;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const integrations = await listActiveHubSpotIntegrations();

  if (integrations.length === 0) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  let processed = 0;
  let failed = 0;

  for (const integration of integrations) {
    const authStatus = getAuthStatus(integration.metadata);

    if (authStatus === "reauth_required") {
      console.warn("worker.crm.hubspot.reauth_required", {
        integrationId: integration.id,
        organizationId: integration.organization_id,
      });
      failed++;
    } else {
      processed++;
    }
  }

  return withWorkerCompatibilityHeaders(NextResponse.json({ data: { processed, failed } }));
}
