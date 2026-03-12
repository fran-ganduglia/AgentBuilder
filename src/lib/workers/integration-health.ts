import "server-only";

import {
  hasIntegrationSecrets,
  listAllIntegrationsForHealth,
  markIntegrationReauthRequired,
} from "@/lib/db/integration-operations";
import { insertIntegrationHealthNotification } from "@/lib/db/integration-notifications";
import {
  buildReauthRequiredIntegrationMetadata,
  getIntegrationOperationalView,
} from "@/lib/integrations/metadata";

export type IntegrationHealthRunSummary = {
  inspected: number;
  updated: number;
  notifications: number;
};

export async function runIntegrationsHealthCheck(): Promise<IntegrationHealthRunSummary> {
  const integrationsResult = await listAllIntegrationsForHealth();
  const integrations = integrationsResult.data ?? [];

  let updated = 0;
  let notifications = 0;

  for (const integration of integrations) {
    let integrationForView = integration;

    if (integration.is_active) {
      const secretsResult = await hasIntegrationSecrets(
        integration.id,
        integration.organization_id
      );

      if (!secretsResult.error && secretsResult.data === false) {
        const reason = "La integracion no tiene secretos activos y debe reconectarse.";
        await markIntegrationReauthRequired(
          integration.id,
          integration.organization_id,
          reason
        );
        integrationForView = {
          ...integration,
          metadata: buildReauthRequiredIntegrationMetadata(integration.metadata, reason),
        };
        updated += 1;
      }
    }

    const view = getIntegrationOperationalView(integrationForView);
    if (view.status === "connected" || view.status === "disconnected") {
      continue;
    }

    const inserted = await insertIntegrationHealthNotification(integrationForView);
    if (inserted) {
      notifications += 1;
    }
  }

  return {
    inspected: integrations.length,
    updated,
    notifications,
  };
}

