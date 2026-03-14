import "server-only";

import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { getHubSpotActionLabel, type ExecuteHubSpotCrmToolInput } from "@/lib/integrations/hubspot-tools";
import type { HubSpotToolExecutionResult } from "@/lib/integrations/hubspot-agent-runtime";

export function getHubSpotAuditMetadata(action: ExecuteHubSpotCrmToolInput["action"]): {
  auditAction: string;
  providerObjectType: string;
} {
  const metadata: Record<ExecuteHubSpotCrmToolInput["action"], { auditAction: string; providerObjectType: string }> = {
    lookup_records: { auditAction: "provider.hubspot.contact_company.lookup", providerObjectType: "contact_company_search" },
    lookup_deals: { auditAction: "provider.hubspot.deal.lookup", providerObjectType: "deal_search" },
    create_contact: { auditAction: "provider.hubspot.contact.created", providerObjectType: "contact" },
    update_contact: { auditAction: "provider.hubspot.contact.updated", providerObjectType: "contact" },
    create_company: { auditAction: "provider.hubspot.company.created", providerObjectType: "company" },
    update_company: { auditAction: "provider.hubspot.company.updated", providerObjectType: "company" },
    create_deal: { auditAction: "provider.hubspot.deal.created", providerObjectType: "deal" },
    update_deal: { auditAction: "provider.hubspot.deal.updated", providerObjectType: "deal" },
    create_task: { auditAction: "provider.hubspot.task.created", providerObjectType: "task" },
    create_meeting: { auditAction: "provider.hubspot.meeting.created", providerObjectType: "meeting" },
  };

  return metadata[action];
}

export async function auditHubSpotAction(input: {
  organizationId: string;
  userId: string | null;
  agentId: string;
  integrationId: string;
  action: ExecuteHubSpotCrmToolInput["action"];
  requestId?: string | null;
  providerObjectId: string | null;
  status: "success" | "error";
}): Promise<void> {
  const audit = getHubSpotAuditMetadata(input.action);
  await insertProviderActionAudit({
    organizationId: input.organizationId,
    userId: input.userId,
    integrationId: input.integrationId,
    agentId: input.agentId,
    provider: "hubspot",
    providerObjectType: audit.providerObjectType,
    providerObjectId: input.providerObjectId,
    action: audit.auditAction,
    requestId: input.requestId ?? null,
    status: input.status,
  });
}

export function getHubSpotExecutionFallback(action: ExecuteHubSpotCrmToolInput["action"]): string {
  return `No se pudo ejecutar ${getHubSpotActionLabel(action)} en HubSpot`;
}

export function formatHubSpotToolResultForPrompt(result: HubSpotToolExecutionResult): string {
  return JSON.stringify({
    action: result.action,
    isWrite: result.isWrite,
    providerObjectType: result.providerObjectType,
    data: result.data,
  });
}

export function buildHubSpotConfirmationSummary(input: ExecuteHubSpotCrmToolInput): string {
  if (input.action === "create_contact") {
    return `Crear un lead/contacto en HubSpot con ${input.properties.email ?? input.properties.firstname ?? "los datos enviados"}${input.allowDuplicateByEmail ? " (permitiendo duplicado por email)" : ""}.`;
  }

  if (input.action === "update_contact") {
    return `Actualizar el contacto ${input.contactId} en HubSpot.`;
  }

  if (input.action === "create_company") {
    return `Crear una empresa en HubSpot con ${input.properties.name ?? input.properties.domain ?? "los datos enviados"}.`;
  }

  if (input.action === "update_company") {
    return `Actualizar la empresa ${input.companyId} en HubSpot.`;
  }

  if (input.action === "create_deal") {
    return `Crear un deal en HubSpot con ${input.properties.dealname ?? "los datos enviados"}.`;
  }

  if (input.action === "update_deal") {
    return `Actualizar el deal ${input.dealId} en HubSpot.`;
  }

  if (input.action === "create_task") {
    return `Crear una task en HubSpot con asunto "${input.properties.hs_task_subject}".`;
  }

  if (input.action === "create_meeting") {
    return `Crear un meeting en HubSpot con titulo "${input.properties.hs_meeting_title}".`;
  }

  return "Confirmar accion de escritura en HubSpot.";
}
