import type { Integration } from "@/types/app";
import {
  getIntegrationUnavailableMessage,
  getIntegrationOperationalView,
  isIntegrationUsable,
} from "@/lib/integrations/metadata";

export type IntegrationAccessResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function assertUsableIntegration(
  integration: Integration | null | undefined
): IntegrationAccessResult {
  if (!integration) {
    return { ok: false, status: 404, message: "Integracion no encontrada" };
  }

  if (isIntegrationUsable(integration)) {
    return { ok: true };
  }

  const view = getIntegrationOperationalView(integration);
  return {
    ok: false,
    status: view.status === "revoked" ? 409 : 403,
    message: getIntegrationUnavailableMessage(integration),
  };
}
