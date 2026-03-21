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
  CreatedDate?: string;
  Amount?: number | string | null;
  Account?: { Name?: string };
  Contact?: { Name?: string; Email?: string };
};

type AccountQueryRecord = {
  Id?: string;
  Name?: string;
};

type AggregateQueryRecord = {
  StageName?: string | null;
  expr0?: number | string | null;
  expr1?: number | string | null;
};

type QueryResponse<TRecord> = {
  records?: TRecord[];
  totalSize?: number;
  done?: boolean;
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

export type SalesforceLeadListItem = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  createdDate: string | null;
  url: string;
};

export type SalesforceLeadListResult = {
  leads: SalesforceLeadListItem[];
  requestId: string | null;
};

export type SalesforcePipelineStageSummary = {
  stageName: string;
  count: number;
  amountTotal: number;
};

export type SalesforcePipelineSummaryResult = {
  stages: SalesforcePipelineStageSummary[];
  total: {
    count: number;
    amountTotal: number;
  };
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

function escapeSoqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeAmount(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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

export function mapSalesforceLeadListRecord(record: LookupApiRecord, instanceUrl: string): SalesforceLeadListItem | null {
  if (!record.Id) {
    return null;
  }

  const fallbackName = [record.FirstName, record.LastName].filter(Boolean).join(" ") || record.Name || record.Id;

  return {
    id: record.Id,
    name: record.Name ?? fallbackName,
    company: record.Company ?? null,
    email: record.Email ?? null,
    phone: record.Phone ?? null,
    status: record.Status ?? null,
    createdDate: record.CreatedDate ?? null,
    url: buildRecordUrl(instanceUrl, "Lead", record.Id),
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

type SoslSearchResponse = {
  searchRecords?: LookupApiRecord[];
};

function extractSearchRecords(data: SoslSearchResponse | LookupApiRecord[]): LookupApiRecord[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.searchRecords)) {
    return data.searchRecords;
  }

  return [];
}

async function executeSoqlQuery<TRecord>(
  credentials: SalesforceCredentials,
  soql: string,
  context: SalesforceProviderContext
): Promise<{ records: TRecord[]; requestId: string | null }> {
  const response = await requestSalesforce<QueryResponse<TRecord>>(
    credentials,
    `/query/?q=${encodeURIComponent(soql)}`,
    { method: "GET" },
    context
  );

  return {
    records: Array.isArray(response.data.records) ? response.data.records : [],
    requestId: response.requestId,
  };
}

async function executeLookup(
  credentials: SalesforceCredentials,
  input: { query: string; limit?: number },
  objectClauseTemplate: string,
  context: SalesforceProviderContext
): Promise<SalesforceLookupResult> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  const objectClause = objectClauseTemplate.replaceAll("{limit}", String(limit));
  const search = buildSearchQuery(input.query, objectClause);
  const response = await requestSalesforce<SoslSearchResponse | LookupApiRecord[]>(
    credentials,
    `/search/?q=${encodeURIComponent(search)}`,
    { method: "GET" },
    context
  );

  const records = extractSearchRecords(response.data);

  return {
    records: records
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

async function executeDelete(
  credentials: SalesforceCredentials,
  objectType: string,
  recordId: string,
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  const response = await requestSalesforce<Record<string, never>>(
    credentials,
    `/sobjects/${objectType}/${recordId}`,
    {
      method: "DELETE",
    },
    context
  );

  return {
    id: recordId,
    url: buildRecordUrl(credentials.instanceUrl, objectType, recordId),
    requestId: response.requestId,
  };
}

export function buildSalesforceLeadRecentSoql(input: { limit?: number; createdAfter?: string }): string {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const filters = input.createdAfter ? [`CreatedDate >= ${input.createdAfter}T00:00:00Z`] : [];
  const whereClause = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";

  return [
    "SELECT Id, Name, FirstName, LastName, Company, Email, Phone, Status, CreatedDate",
    `FROM Lead${whereClause}`,
    "ORDER BY CreatedDate DESC",
    `LIMIT ${limit}`,
  ].join(" ");
}

export function buildSalesforceLeadByStatusSoql(input: { status: string; limit?: number }): string {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  return [
    "SELECT Id, Name, FirstName, LastName, Company, Email, Phone, Status, CreatedDate",
    `FROM Lead WHERE Status = '${escapeSoqlString(input.status)}'`,
    "ORDER BY CreatedDate DESC",
    `LIMIT ${limit}`,
  ].join(" ");
}

export function buildSalesforceOpenPipelineStageSoql(): string {
  return [
    "SELECT StageName, COUNT(Id), SUM(Amount)",
    "FROM Opportunity",
    "WHERE IsClosed = false",
    "GROUP BY StageName",
    "ORDER BY StageName ASC",
  ].join(" ");
}

export function buildSalesforceOpenPipelineTotalSoql(): string {
  return [
    "SELECT COUNT(Id), SUM(Amount)",
    "FROM Opportunity",
    "WHERE IsClosed = false",
  ].join(" ");
}

export function resolveSalesforceAccountMatch(records: AccountQueryRecord[], accountName: string): { accountId: string } {
  if (records.length === 1 && records[0]?.Id) {
    return { accountId: records[0].Id };
  }

  if (records.length === 0) {
    throw new ProviderRequestError({
      provider: "salesforce",
      message: `No encontre una cuenta llamada \"${accountName}\". Indica el accountId o un nombre exacto.`,
      statusCode: 400,
    });
  }

  throw new ProviderRequestError({
    provider: "salesforce",
    message: `Hay varias cuentas llamadas \"${accountName}\". Indica el accountId o un nombre mas especifico.`,
    statusCode: 400,
  });
}

async function resolveSalesforceAccountId(
  credentials: SalesforceCredentials,
  accountName: string,
  context: SalesforceProviderContext
): Promise<string> {
  const soql = [
    "SELECT Id, Name",
    `FROM Account WHERE Name = '${escapeSoqlString(accountName)}'`,
    "ORDER BY Name ASC",
    "LIMIT 3",
  ].join(" ");
  const response = await executeSoqlQuery<AccountQueryRecord>(credentials, soql, context);
  return resolveSalesforceAccountMatch(response.records, accountName).accountId;
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

export async function listSalesforceLeadsRecent(
  credentials: SalesforceCredentials,
  input: { limit?: number; createdAfter?: string },
  context: SalesforceProviderContext
): Promise<SalesforceLeadListResult> {
  const soql = buildSalesforceLeadRecentSoql(input);
  const response = await executeSoqlQuery<LookupApiRecord>(credentials, soql, context);

  return {
    leads: response.records
      .map((record) => mapSalesforceLeadListRecord(record, credentials.instanceUrl))
      .filter((record): record is SalesforceLeadListItem => record !== null),
    requestId: response.requestId,
  };
}

export async function listSalesforceLeadsByStatus(
  credentials: SalesforceCredentials,
  input: { status: string; limit?: number },
  context: SalesforceProviderContext
): Promise<SalesforceLeadListResult> {
  const soql = buildSalesforceLeadByStatusSoql(input);
  const response = await executeSoqlQuery<LookupApiRecord>(credentials, soql, context);

  return {
    leads: response.records
      .map((record) => mapSalesforceLeadListRecord(record, credentials.instanceUrl))
      .filter((record): record is SalesforceLeadListItem => record !== null),
    requestId: response.requestId,
  };
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

export async function summarizeSalesforcePipeline(
  credentials: SalesforceCredentials,
  context: SalesforceProviderContext
): Promise<SalesforcePipelineSummaryResult> {
  const [stageResponse, totalResponse] = await Promise.all([
    executeSoqlQuery<AggregateQueryRecord>(credentials, buildSalesforceOpenPipelineStageSoql(), context),
    executeSoqlQuery<AggregateQueryRecord>(credentials, buildSalesforceOpenPipelineTotalSoql(), context),
  ]);

  const stages = stageResponse.records.map((record) => ({
    stageName: record.StageName ?? "Sin etapa",
    count: normalizeAmount(record.expr0),
    amountTotal: normalizeAmount(record.expr1),
  }));
  const totalRecord = totalResponse.records[0] ?? null;

  return {
    stages,
    total: {
      count: totalRecord ? normalizeAmount(totalRecord.expr0) : 0,
      amountTotal: totalRecord ? normalizeAmount(totalRecord.expr1) : 0,
    },
    requestId: stageResponse.requestId ?? totalResponse.requestId,
  };
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

export async function updateSalesforceLead(
  credentials: SalesforceCredentials,
  input: { leadId: string; status?: string; rating?: string; description?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeUpdate(credentials, "Lead", input.leadId, {
    Status: input.status ?? undefined,
    Rating: input.rating ?? undefined,
    Description: input.description ?? undefined,
  }, context);
}

export async function createSalesforceContact(
  credentials: SalesforceCredentials,
  input: { lastName: string; firstName?: string; email?: string; phone?: string; title?: string; accountId?: string; accountName?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  const accountId = input.accountId ?? (input.accountName ? await resolveSalesforceAccountId(credentials, input.accountName, context) : undefined);

  return executeCreate(credentials, "Contact", {
    FirstName: input.firstName ?? undefined,
    LastName: input.lastName,
    Email: input.email ?? undefined,
    Phone: input.phone ?? undefined,
    Title: input.title ?? undefined,
    AccountId: accountId ?? undefined,
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

export async function updateSalesforceContact(
  credentials: SalesforceCredentials,
  input: { contactId: string; firstName?: string; lastName?: string; email?: string; phone?: string; title?: string; accountId?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeUpdate(credentials, "Contact", input.contactId, {
    FirstName: input.firstName ?? undefined,
    LastName: input.lastName ?? undefined,
    Email: input.email ?? undefined,
    Phone: input.phone ?? undefined,
    Title: input.title ?? undefined,
    AccountId: input.accountId ?? undefined,
  }, context);
}

export async function updateSalesforceAccount(
  credentials: SalesforceCredentials,
  input: { accountId: string; name?: string; phone?: string; website?: string; industry?: string; description?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeUpdate(credentials, "Account", input.accountId, {
    Name: input.name ?? undefined,
    Phone: input.phone ?? undefined,
    Website: input.website ?? undefined,
    Industry: input.industry ?? undefined,
    Description: input.description ?? undefined,
  }, context);
}

export async function createSalesforceOpportunity(
  credentials: SalesforceCredentials,
  input: { name: string; stageName: string; closeDate: string; accountId?: string; amount?: number; description?: string; type?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "Opportunity", {
    Name: input.name,
    StageName: input.stageName,
    CloseDate: input.closeDate,
    AccountId: input.accountId ?? undefined,
    Amount: input.amount ?? undefined,
    Description: input.description ?? undefined,
    Type: input.type ?? undefined,
  }, context);
}

export async function createSalesforceAccount(
  credentials: SalesforceCredentials,
  input: { name: string; phone?: string; website?: string; industry?: string; description?: string; billingCity?: string; billingState?: string; billingCountry?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "Account", {
    Name: input.name,
    Phone: input.phone ?? undefined,
    Website: input.website ?? undefined,
    Industry: input.industry ?? undefined,
    Description: input.description ?? undefined,
    BillingCity: input.billingCity ?? undefined,
    BillingState: input.billingState ?? undefined,
    BillingCountry: input.billingCountry ?? undefined,
  }, context);
}

export async function createSalesforceOpportunityContactRole(
  credentials: SalesforceCredentials,
  input: { opportunityId: string; contactId: string; role?: string },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeCreate(credentials, "OpportunityContactRole", {
    OpportunityId: input.opportunityId,
    ContactId: input.contactId,
    Role: input.role ?? "Decision Maker",
  }, context);
}

export async function deleteSalesforceObject(
  credentials: SalesforceCredentials,
  input: {
    objectType: "Contact" | "Task" | "Opportunity" | "Account" | "OpportunityContactRole";
    recordId: string;
  },
  context: SalesforceProviderContext
): Promise<SalesforceMutationResult> {
  return executeDelete(credentials, input.objectType, input.recordId, context);
}
