import "server-only";

import { insertProviderActionAudit } from "@/lib/integrations/audit";
import { getSalesforceActionLabel, type ExecuteSalesforceCrmToolInput } from "@/lib/integrations/salesforce-tools";
import type { SalesforceToolExecutionResult } from "@/lib/integrations/salesforce-agent-runtime";

export function getSalesforceAuditMetadata(action: ExecuteSalesforceCrmToolInput["action"]): {
  auditAction: string;
  providerObjectType: string;
} {
  const metadata: Record<ExecuteSalesforceCrmToolInput["action"], { auditAction: string; providerObjectType: string }> = {
    lookup_records: { auditAction: "provider.salesforce.lead_contact.lookup", providerObjectType: "lead_contact_search" },
    list_leads_recent: { auditAction: "provider.salesforce.lead.list_recent", providerObjectType: "lead_list" },
    list_leads_by_status: { auditAction: "provider.salesforce.lead.list_by_status", providerObjectType: "lead_list" },
    lookup_accounts: { auditAction: "provider.salesforce.account.lookup", providerObjectType: "account_search" },
    lookup_opportunities: { auditAction: "provider.salesforce.opportunity.lookup", providerObjectType: "opportunity_search" },
    lookup_cases: { auditAction: "provider.salesforce.case.lookup", providerObjectType: "case_search" },
    summarize_pipeline: { auditAction: "provider.salesforce.pipeline.summary", providerObjectType: "pipeline_summary" },
    create_task: { auditAction: "provider.salesforce.task.created", providerObjectType: "task" },
    create_lead: { auditAction: "provider.salesforce.lead.created", providerObjectType: "lead" },
    update_lead: { auditAction: "provider.salesforce.lead.updated", providerObjectType: "lead" },
    create_contact: { auditAction: "provider.salesforce.contact.created", providerObjectType: "contact" },
    create_case: { auditAction: "provider.salesforce.case.created", providerObjectType: "case" },
    update_case: { auditAction: "provider.salesforce.case.updated", providerObjectType: "case" },
    update_opportunity: { auditAction: "provider.salesforce.opportunity.updated", providerObjectType: "opportunity" },
  };

  return metadata[action];
}

export async function auditSalesforceAction(input: {
  organizationId: string;
  userId: string | null;
  agentId: string;
  integrationId: string;
  action: ExecuteSalesforceCrmToolInput["action"];
  requestId?: string | null;
  providerObjectId: string | null;
  status: "success" | "error";
}): Promise<void> {
  const audit = getSalesforceAuditMetadata(input.action);
  await insertProviderActionAudit({
    organizationId: input.organizationId,
    userId: input.userId,
    integrationId: input.integrationId,
    agentId: input.agentId,
    provider: "salesforce",
    providerObjectType: audit.providerObjectType,
    providerObjectId: input.providerObjectId,
    action: audit.auditAction,
    requestId: input.requestId ?? null,
    status: input.status,
  });
}

export function getSalesforceExecutionFallback(action: ExecuteSalesforceCrmToolInput["action"]): string {
  return `No se pudo ejecutar ${getSalesforceActionLabel(action)} en Salesforce`;
}

export function formatSalesforceToolResultForPrompt(result: SalesforceToolExecutionResult): string {
  return JSON.stringify({
    action: result.action,
    isWrite: result.isWrite,
    providerObjectType: result.providerObjectType,
    data: result.data,
  });
}

export function buildSalesforceConfirmationSummary(input: ExecuteSalesforceCrmToolInput): string {
  if (input.action === "create_task") {
    return `Crear una task con asunto \"${input.subject}\".`;
  }

  if (input.action === "create_lead") {
    return `Crear un lead para ${input.firstName ? `${input.firstName} ` : ""}${input.lastName} en ${input.company}.`;
  }

  if (input.action === "update_lead") {
    return `Actualizar el lead ${input.leadId}.`;
  }

  if (input.action === "create_contact") {
    const accountReference = input.accountId ?? input.accountName ?? "sin cuenta asociada";
    return `Crear un contacto para ${input.firstName ? `${input.firstName} ` : ""}${input.lastName} usando ${accountReference}.`;
  }

  if (input.action === "create_case") {
    return `Crear un case con asunto \"${input.subject}\".`;
  }

  if (input.action === "update_case") {
    return `Actualizar el case ${input.caseId}.`;
  }

  if (input.action === "update_opportunity") {
    return `Actualizar la oportunidad ${input.opportunityId}.`;
  }

  return "Confirmar accion de escritura en Salesforce.";
}
