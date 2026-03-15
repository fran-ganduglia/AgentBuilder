import { NextResponse } from "next/server";
import {
  getGoogleIntegrationConfig,
  getGoogleRefreshState,
  rotateGoogleTokens,
} from "@/lib/db/google-integration-config";
import { markIntegrationReauthRequired } from "@/lib/db/integration-operations";
import { refreshGoogleAccessToken } from "@/lib/integrations/google";
import { coordinateIntegrationRefresh } from "@/lib/integrations/refresh-coordination";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  areWorkersEnabled,
  getWorkerUnauthorizedResponse,
  getWorkersDisabledResponse,
  validateCronRequest,
  withWorkerCompatibilityHeaders,
} from "@/lib/workers/auth";

const REFRESH_BEFORE_EXPIRY_MS = 30 * 60 * 1000;
const BATCH_LIMIT = 10;

type ExpiringIntegrationRow = {
  id: string;
  organization_id: string;
};

type RefreshStats = {
  processed: number;
  failed: number;
};

function readAccessTokenExpiry(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const expiresAt = Reflect.get(metadata, "access_token_expires_at");
  return typeof expiresAt === "string" && expiresAt.length > 0 ? expiresAt : null;
}

function readAuthStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const authStatus = Reflect.get(metadata, "auth_status");
  return typeof authStatus === "string" && authStatus.length > 0 ? authStatus : null;
}

async function listExpiringGoogleIntegrations(): Promise<ExpiringIntegrationRow[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("id, organization_id, metadata")
    .eq("type", "google")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(50);

  if (error || !data) {
    return [];
  }

  const threshold = new Date(Date.now() + REFRESH_BEFORE_EXPIRY_MS).toISOString();

  return data
    .filter((row) => {
      const authStatus = readAuthStatus(row.metadata);
      if (authStatus === "reauth_required") {
        return false;
      }

      const expiresAt = readAccessTokenExpiry(row.metadata);
      return Boolean(expiresAt && expiresAt <= threshold);
    })
    .slice(0, BATCH_LIMIT)
    .map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
    }));
}

async function refreshGoogleRow(row: ExpiringIntegrationRow): Promise<boolean> {
  const coordination = await coordinateIntegrationRefresh({
    provider: "google",
    integrationId: row.id,
    onLockError: "refresh_without_lock",
    loadState: async () => {
      const stateResult = await getGoogleRefreshState(row.id, row.organization_id);
      return stateResult.data ?? { tokenGeneration: 0, authStatus: null };
    },
    refresh: async () => {
      const configResult = await getGoogleIntegrationConfig(row.id, row.organization_id);
      if (configResult.error || !configResult.data) {
        throw new Error(configResult.error ?? "No se pudo leer la configuracion de Google");
      }

      if (!configResult.data.refreshToken) {
        await markIntegrationReauthRequired(
          row.id,
          row.organization_id,
          "Google no devolvio refresh token; reconecta la integracion con consentimiento."
        );
        throw new Error("Google no tiene refresh token");
      }

      const refreshResult = await refreshGoogleAccessToken(configResult.data.refreshToken);
      const rotateResult = await rotateGoogleTokens({
        integrationId: row.id,
        organizationId: row.organization_id,
        userId: row.organization_id,
        accessToken: refreshResult.accessToken,
        refreshToken: refreshResult.refreshToken ?? configResult.data.refreshToken,
        grantedScopes:
          refreshResult.grantedScopes.length > 0
            ? refreshResult.grantedScopes
            : configResult.data.grantedScopes,
        accessTokenExpiresAt: refreshResult.accessTokenExpiresAt,
        connectedEmail: refreshResult.connectedEmail ?? configResult.data.connectedEmail,
        workspaceCustomerId: refreshResult.workspaceCustomerId,
        tokenType: refreshResult.tokenType,
        googleCalendarPrimaryTimezone:
          refreshResult.googleCalendarPrimaryTimezone ??
          configResult.data.googleCalendarPrimaryTimezone,
        googleCalendarUserTimezone:
          refreshResult.googleCalendarUserTimezone ??
          configResult.data.googleCalendarUserTimezone,
      });

      if (rotateResult.error) {
        throw new Error(rotateResult.error);
      }
    },
  });

  return coordination.kind !== "timeout";
}

async function processBatch(rows: ExpiringIntegrationRow[]): Promise<RefreshStats> {
  const stats: RefreshStats = { processed: 0, failed: 0 };

  for (const row of rows) {
    try {
      const ok = await refreshGoogleRow(row);

      if (ok) {
        stats.processed += 1;
      } else {
        stats.failed += 1;
      }
    } catch (error) {
      console.error("worker.oauth.refresh.google.error", {
        integrationId: row.id,
        organizationId: row.organization_id,
        error: error instanceof Error ? error.message : "unknown",
      });
      stats.failed += 1;
    }
  }

  return stats;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return getWorkerUnauthorizedResponse();
  }

  if (!areWorkersEnabled()) {
    return getWorkersDisabledResponse();
  }

  const expiringGoogle = await listExpiringGoogleIntegrations();

  if (expiringGoogle.length === 0) {
    return withWorkerCompatibilityHeaders(new NextResponse(null, { status: 204 }));
  }

  const googleStats = await processBatch(expiringGoogle);

  return withWorkerCompatibilityHeaders(NextResponse.json({
    data: {
      google: googleStats,
    },
  }));
}
