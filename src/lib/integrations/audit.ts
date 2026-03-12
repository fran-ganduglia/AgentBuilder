import "server-only";

import { insertAuditLog } from "@/lib/db/audit";
import type { Json } from "@/types/database";

type ProviderActionAuditInput = {
  organizationId: string;
  userId: string | null;
  integrationId: string;
  agentId?: string | null;
  provider: string;
  providerObjectType: string;
  providerObjectId: string | null;
  action: string;
  requestId?: string | null;
  status: "success" | "error";
};

export async function insertProviderActionAudit(
  input: ProviderActionAuditInput
): Promise<void> {
  const payload: Json = {
    agent_id: input.agentId ?? null,
    integration_id: input.integrationId,
    provider: input.provider,
    provider_object_type: input.providerObjectType,
    provider_object_id: input.providerObjectId,
    request_id: input.requestId ?? null,
    status: input.status,
  };

  await insertAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    resourceType: "integration",
    resourceId: input.integrationId,
    newValue: payload,
  });
}
