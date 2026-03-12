import "server-only";

import { ProviderRequestError } from "@/lib/integrations/provider-errors";
import { requestSalesforce, type SalesforceCredentials } from "@/lib/integrations/salesforce";

type SalesforceProviderContext = {
  organizationId: string;
  integrationId: string;
  methodKey: string;
  budgetUnits?: number;
};

type LookupApiRecord = {
  attributes?: { type?: string };
  Id?: string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  Company?: string;
  Website?: string;
  Subject?: string;
  CaseNumber?: string;
  Status?: string;
  Priority?: string;
  StageName?: string;
  CloseDate?: string;
  Amount?: number;
  Account?: { Name?: string };
  Contact?: { Name?: string; Email?: string };
};

type CreateResponse = {
  id?: string;
  success?: boolean;
  errors?: string[];
};

export type SalesforceLookupRecord = {
  objectType: "Lead" | "Contact" | "Account" | "Opportunity" | "Case";
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  priority: string | null;
  stageName: string | null;
  caseNumber: string | null;
  closeDate: string | null;
  amount: number | null;
  url: string;
};

export type SalesforceLookupResult = {
  records: SalesforceLookupRecord[];
  requestId: string | null;
};

export type SalesforceMutationResult = {
  id: string;
  url: string;
  requestId: string | null;
};

function buildRecordUrl(instanceUrl: string, objectType: string, recordId: string): string {
  const baseUrl = instanceUrl.endsWith("/") ? instanceUrl.slice(0, -1) : instanceUrl;
  return `${baseUrl}/lightning/r/${objectType}/${recordId}/view`;
}

function sanitizeSearchTerm(rawQuery: string): string {
  const sanitized = rawQuery.replace(/[{}\[\]^~?:!&|"'\\]/g, " ").trim();
  if (sanitized.length < 2) {
    throw new ProviderRequestError({
      provider: "salesforce",
      message: "La busqueda debe tener al menos 2 caracteres utiles",
      statusCode: 400,
    });
  }

  return sanitized;
}

function buildSearchQuery(rawQuery: string, objectClause: string): string {
  return `FIND {${sanitizeSearchTerm(rawQuery)}} IN ALL FIELDS RETURNING ${objectClause}`;
}

function mapLookupRecord(record: LookupApiRecord, instanceUrl: string): SalesforceLookupRecord | null {
  const objectType = record.attributes?.type;
  const id = record.Id;

  if (!id || !objectType || !["Lead", "Contact", "Account", "Opportunity", "Case"].includes(objectType)) {
    return null;
  }

  const fallbackName = [record.FirstName, record.LastName].filter(Boolean).join(" ") || record.Subject || record.CaseNumber || id;
  const company = objectType === "Lead"
    ? record.Company ?? null
    : objectType === "Contact" || objectType === "Opportunity" || objectType === "Case"
      ? record.Account?.Name ?? null
      : record.Name ?? null;

  return {
    objectType: objectType as SalesforceLookupRecord["objectType"],
    id,
    name: record.Name ?? fallbackName,
    email: record.Email ?? record.Contact?.Email ?? null,
    phone: record.Phone ?? null,
    company,
    status: record.Status ?? null,
    priority: record.Priority ?? null,
    stageName: record.StageName ?? null,
    caseNumber: record.CaseNumber ?? null,
    closeDate: record.CloseDate ?? null,
    amount: typeof record.Amount === "number" ? record.Amount : null,
    url: buildRecordUrl(instanceUrl, objectType, id),
  };
}

function assertCreatedObject(response: CreateResponse, objectType: string): string {
  if (response.success && response.id) {
    return response.id;
  }

  throw new ProviderRequestError({
    provider: "salesforce",
    message: response.errors?.[0] ?? `Salesforce no pudo crear o actualizar ${objectType}`,
    statusCode: 400,
  });
}

async function executeLookup(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  objectClauseTemplate: string,
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 5);
  const objectClause = objectClauseTemplate.replaceAll("{limit}", String(limit));
  const search = buildSearchQuery(input.query, objectClause);
  const response = await requestSalesforce<LookupApiRecord[]>(
    credentials,
    `/search/?q=${encodeURIComponent(search)}`,
    { method: "GET" },
    context
  );

  return {
    records: response.data
      .map((record) => mapLookupRecord(record, credentials.instanceUrl))
      .filter((record): record is SalesforceLookupRecord => record !== null),
    requestId: response.requestId,
  };
}

async function executeCreate(
  credentials: SalesforceCredentials,
  objectType: string,
  body: Record<string, unknown>,
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  const response = await requestSalesforce<CreateResponse>(
    credentials,
    `/sobjects/${objectType}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    context
  );

  const recordId = assertCreatedObject(response.data, objectType);
  return {
    id: recordId,
    url: buildRecordUrl(credentials.instanceUrl, objectType, recordId),
    requestId: response.requestId,
  };
}

async function executeUpdate(
  credentials: SalesforceCredentials,
  objectType: string,
  recordId: string,
  body: Record<string, unknown>,
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  const response = await requestSalesforce<Record<string, never>>(
    credentials,
    `/sobjects/${objectType}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    context
  );

  return {
    id: recordId,
    url: buildRecordUrl(credentials.instanceUrl, objectType, recordId),
    requestId: response.requestId,
  };
}

export async function lookupSalesforceLeadOrContact(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  return executeLookup(
    credentials,
    input,
    "Lead(Id,Name,Company,Email,Phone LIMIT {limit}), Contact(Id,Name,Email,Phone,Account.Name LIMIT {limit})",
    context
  );
}

export async function lookupSalesforceAccounts(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  return executeLookup(credentials, input, "Account(Id,Name,Phone,Website LIMIT {limit})", context);
}

export async function lookupSalesforceOpportunities(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  return executeLookup(credentials, input, "Opportunity(Id,Name,StageName,CloseDate,Amount,Account.Name LIMIT {limit})", context);
}

export async function lookupSalesforceCases(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  return executeLookup(credentials, input, "Case(Id,CaseNumber,Subject,Status,Priority,Account.Name,Contact.Email LIMIT {limit})", context);
}

export async function createSalesforceTask(
  credentials: SalesforceCredentials,
  input: { subject: string; description?: string; whoId?: string; whatId?: string; status?: string; priority?: string; dueDate?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "Task", {
    Subject: input.subject,
    Description: input.description ?? undefined,
    WhoId: input.whoId ?? undefined,
    WhatId: input.whatId ?? undefined,
    Status: input.status ?? "Not Started",
    Priority: input.priority ?? "Normal",
    ActivityDate: input.dueDate ?? undefined,
  }, context);
}

export async function createSalesforceLead(
  credentials: SalesforceCredentials,
  input: { firstName?: string; lastName: string; company: string; email?: string; phone?: string; description?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "Lead", {
    FirstName: input.firstName ?? undefined,
    LastName: input.lastName,
    Company: input.company,
    Email: input.email ?? undefined,
    Phone: input.phone ?? undefined,
    Description: input.description ?? undefined,
  }, context);
}

export async function createSalesforceCase(
  credentials: SalesforceCredentials,
  input: { subject: string; description?: string; status?: string; priority?: string; origin?: string; contactId?: string; accountId?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "Case", {
    Subject: input.subject,
    Description: input.description ?? undefined,
    Status: input.status ?? "New",
    Priority: input.priority ?? "Medium",
    Origin: input.origin ?? "Web",
    ContactId: input.contactId ?? undefined,
    AccountId: input.accountId ?? undefined,
  }, context);
}

export async function updateSalesforceCase(
  credentials: SalesforceCredentials,
  input: { caseId: string; subject?: string; description?: string; status?: string; priority?: string; ownerId?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeUpdate(credentials, "Case", input.caseId, {
    Subject: input.subject ?? undefined,
    Description: input.description ?? undefined,
    Status: input.status ?? undefined,
    Priority: input.priority ?? undefined,
    OwnerId: input.ownerId ?? undefined,
  }, context);
}

export async function updateSalesforceOpportunity(
  credentials: SalesforceCredentials,
  input: { opportunityId: string; stageName?: string; amount?: number; closeDate?: string; nextStep?: string; description?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeUpdate(credentials, "Opportunity", input.opportunityId, {
    StageName: input.stageName ?? undefined,
    Amount: input.amount ?? undefined,
    CloseDate: input.closeDate ?? undefined,
    NextStep: input.nextStep ?? undefined,
    Description: input.description ?? undefined,
  }, context);
}
