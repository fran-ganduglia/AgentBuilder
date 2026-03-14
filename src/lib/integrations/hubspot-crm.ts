import "server-only";

import { ProviderRequestError } from "@/lib/integrations/provider-errors";
import { requestHubSpot, type HubSpotCredentials } from "@/lib/integrations/hubspot";

type HubSpotProviderContext = {
  organizationId: string;
  integrationId: string;
  methodKey: string;
};

type HubSpotAssociationSummary = {
  id: string;
  label: string;
};

type HubSpotLookupRecord = {
  objectType: "contact" | "company" | "deal";
  id: string;
  label: string;
  properties: Record<string, string | null>;
  associatedDeals: HubSpotAssociationSummary[];
  associatedContacts: HubSpotAssociationSummary[];
  associatedCompanies: HubSpotAssociationSummary[];
  url: string;
};

export type HubSpotLookupResult = {
  records: HubSpotLookupRecord[];
  requestId: string | null;
};

export type HubSpotMutationResult = {
  id: string;
  objectType: string;
  url: string;
  requestId: string | null;
};

export type HubSpotContactMatch = {
  id: string;
  label: string;
  email: string | null;
  url: string;
  requestId: string | null;
};

type SearchResponse = {
  results?: Array<{ id: string; properties?: Record<string, string | null> }>;
};

type ObjectResponse = {
  id: string;
  properties?: Record<string, string | null>;
  associations?: Record<string, { results?: Array<{ id: string }> }>;
};

type PipelineResponse = {
  id?: string;
  stages?: Array<{ id?: string }>;
};

const HUBSPOT_APP_BASE_URL = "https://app.hubspot.com";

function buildRecordUrl(hubId: string | null, objectType: string, recordId: string): string {
  if (!hubId) {
    return `${HUBSPOT_APP_BASE_URL}/contacts/0/record/${objectType}/${recordId}`;
  }

  return `${HUBSPOT_APP_BASE_URL}/contacts/${hubId}/record/${objectType}/${recordId}`;
}

function assertHasProperties(properties: Record<string, string | null>, objectType: string): void {
  if (Object.keys(properties).length === 0) {
    throw new ProviderRequestError({
      provider: "hubspot",
      message: `Debes indicar al menos una propiedad para ${objectType}`,
      statusCode: 400,
    });
  }
}

function sanitizeProperties(properties: Record<string, string | number | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
      .map(([key, value]) => [key, String(value).trim()])
  );
}

function getLabel(objectType: "contact" | "company" | "deal", properties: Record<string, string | null>): string {
  if (objectType === "contact") {
    const name = [properties.firstname, properties.lastname].filter(Boolean).join(" ").trim();
    return name || properties.email || properties.phone || properties.jobtitle || properties.hs_object_id || "Contacto sin nombre";
  }

  if (objectType === "company") {
    return properties.name || properties.domain || properties.website || properties.hs_object_id || "Empresa sin nombre";
  }

  return properties.dealname || properties.dealstage || properties.pipeline || properties.hs_object_id || "Deal sin nombre";
}

const LIST_ALL_PATTERN = /^[\s\w]*(lista|todos|all|contactos|leads|empresas|companies|deals|negocios|clientes|registros|records|mostrar|listar|ver|show|get|dame|traer|obtener)[\s\w]*$/i;

function isListAllQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return true;
  }
  const hasNameOrEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed) || /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(trimmed);
  if (hasNameOrEmail) {
    return false;
  }
  return LIST_ALL_PATTERN.test(trimmed);
}

async function searchObjects(
  credentials: HubSpotCredentials,
  objectType: "contacts" | "companies" | "deals",
  query: string,
  properties: string[],
  limit: number,
  context: HubSpotProviderContext
): Promise<SearchResponse & { requestId: string | null }> {
  const body: Record<string, unknown> = { limit, properties };
  if (!isListAllQuery(query)) {
    body["query"] = query;
  }

  const response = await requestHubSpot<SearchResponse>(
    credentials,
    `/crm/v3/objects/${objectType}/search`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    context
  );

  return { ...(response.data ?? {}), requestId: response.requestId };
}

async function findContactByEmail(
  credentials: HubSpotCredentials & { hubId: string | null },
  email: string,
  context: HubSpotProviderContext
): Promise<HubSpotContactMatch | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const response = await requestHubSpot<SearchResponse>(
    credentials,
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: normalizedEmail,
              },
            ],
          },
        ],
        limit: 1,
        properties: ["email", "firstname", "lastname"],
      }),
    },
    context
  );

  const match = response.data?.results?.[0];
  if (!match) {
    return null;
  }

  const properties = match.properties ?? {};
  return {
    id: match.id,
    label: getLabel("contact", properties),
    email: properties.email ?? normalizedEmail,
    url: buildRecordUrl(credentials.hubId, "contact", match.id),
    requestId: response.requestId,
  };
}

async function readObject(
  credentials: HubSpotCredentials,
  objectType: "contacts" | "companies" | "deals",
  recordId: string,
  properties: string[],
  associations: string[],
  context: HubSpotProviderContext
): Promise<ObjectResponse> {
  const params = new URLSearchParams();
  if (properties.length > 0) {
    params.set("properties", properties.join(","));
  }
  if (associations.length > 0) {
    params.set("associations", associations.join(","));
  }

  const response = await requestHubSpot<ObjectResponse>(
    credentials,
    `/crm/v3/objects/${objectType}/${recordId}?${params.toString()}`,
    { method: "GET" },
    context
  );

  return response.data;
}

async function associateDefault(
  credentials: HubSpotCredentials,
  fromObjectType: string,
  fromId: string,
  toObjectType: string,
  toId: string,
  context: HubSpotProviderContext
): Promise<void> {
  await requestHubSpot<Record<string, never>>(
    credentials,
    `/crm/v4/objects/${fromObjectType}/${fromId}/associations/default/${toObjectType}/${toId}`,
    { method: "PUT" },
    context
  );
}

async function associatePrimaryCompanyToDeal(
  credentials: HubSpotCredentials,
  dealId: string,
  companyId: string,
  context: HubSpotProviderContext
): Promise<void> {
  await requestHubSpot<Record<string, never>>(
    credentials,
    `/crm/v3/objects/deals/${dealId}/associations/company/${companyId}/5`,
    { method: "PUT" },
    context
  );
}

async function validateDealPipeline(
  credentials: HubSpotCredentials,
  pipelineId: string,
  stageId: string,
  context: HubSpotProviderContext
): Promise<void> {
  const response = await requestHubSpot<PipelineResponse>(
    credentials,
    `/crm/v3/pipelines/deals/${pipelineId}`,
    { method: "GET" },
    context
  );

  const stageExists = (response.data.stages ?? []).some((stage) => stage.id === stageId);
  if (!stageExists) {
    throw new ProviderRequestError({
      provider: "hubspot",
      message: "La etapa indicada no pertenece al pipeline conectado en HubSpot",
      statusCode: 400,
    });
  }
}

function mapAssociations(
  associations: ObjectResponse["associations"],
  objectType: "contact" | "company" | "deal"
): Pick<HubSpotLookupRecord, "associatedDeals" | "associatedContacts" | "associatedCompanies"> {
  const toSummaries = (label: string, results?: Array<{ id: string }>): HubSpotAssociationSummary[] =>
    (results ?? []).map((item) => ({ id: item.id, label: `${label} ${item.id}` }));

  return {
    associatedDeals: objectType === "deal" ? [] : toSummaries("Deal", associations?.deals?.results),
    associatedContacts: objectType === "contact" ? [] : toSummaries("Contacto", associations?.contacts?.results),
    associatedCompanies: objectType === "company" ? [] : toSummaries("Empresa", associations?.companies?.results),
  };
}

async function buildLookupRecords(
  credentials: HubSpotCredentials & { hubId: string | null },
  objectType: "contacts" | "companies" | "deals",
  records: Array<{ id: string; properties?: Record<string, string | null> }>,
  properties: string[],
  associations: string[],
  context: HubSpotProviderContext
): Promise<HubSpotLookupRecord[]> {
  const normalizedObjectType = objectType.slice(0, -1) as "contact" | "company" | "deal";
  const enriched = await Promise.all(
    records.map(async (record) => {
      const fullRecord = await readObject(credentials, objectType, record.id, properties, associations, context);
      const itemProperties = fullRecord.properties ?? record.properties ?? {};
      return {
        objectType: normalizedObjectType,
        id: fullRecord.id,
        label: getLabel(normalizedObjectType, itemProperties),
        properties: itemProperties,
        ...mapAssociations(fullRecord.associations, normalizedObjectType),
        url: buildRecordUrl(credentials.hubId, normalizedObjectType, fullRecord.id),
      } satisfies HubSpotLookupRecord;
    })
  );

  return enriched;
}

async function createObject(
  credentials: HubSpotCredentials & { hubId: string | null },
  objectType: string,
  properties: Record<string, string>,
  context: HubSpotProviderContext
): Promise<HubSpotMutationResult> {
  const response = await requestHubSpot<{ id: string }>(
    credentials,
    `/crm/v3/objects/${objectType}`,
    {
      method: "POST",
      body: JSON.stringify({ properties }),
    },
    context
  );

  return {
    id: response.data.id,
    objectType,
    url: buildRecordUrl(credentials.hubId, objectType.replace(/s$/, ""), response.data.id),
    requestId: response.requestId,
  };
}

async function updateObject(
  credentials: HubSpotCredentials & { hubId: string | null },
  objectType: string,
  recordId: string,
  properties: Record<string, string>,
  context: HubSpotProviderContext
): Promise<HubSpotMutationResult> {
  if (Object.keys(properties).length > 0) {
    await requestHubSpot<Record<string, never>>(
      credentials,
      `/crm/v3/objects/${objectType}/${recordId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      },
      context
    );
  }

  return {
    id: recordId,
    objectType,
    url: buildRecordUrl(credentials.hubId, objectType.replace(/s$/, ""), recordId),
    requestId: null,
  };
}

async function archiveObject(
  credentials: HubSpotCredentials & { hubId: string | null },
  objectType: string,
  recordId: string,
  context: HubSpotProviderContext
): Promise<HubSpotMutationResult> {
  const response = await requestHubSpot<Record<string, never>>(
    credentials,
    `/crm/v3/objects/${objectType}/${recordId}`,
    {
      method: "DELETE",
    },
    context
  );

  return {
    id: recordId,
    objectType,
    url: buildRecordUrl(credentials.hubId, objectType.replace(/s$/, ""), recordId),
    requestId: response.requestId,
  };
}

export async function findHubSpotContactByEmail(
  credentials: HubSpotCredentials & { hubId: string | null },
  input: { email: string },
  context: HubSpotProviderContext
): Promise<HubSpotContactMatch | null> {
  return findContactByEmail(credentials, input.email, context);
}

export async function lookupHubSpotRecords(
  credentials: HubSpotCredentials & { hubId: string | null },
  input: { query: string; limit?: number },
  context: HubSpotProviderContext
): Promise<HubSpotLookupResult> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  const [contacts, companies] = await Promise.all([
    searchObjects(credentials, "contacts", input.query, ["email", "firstname", "lastname", "phone", "jobtitle", "hubspot_owner_id"], limit, context),
    searchObjects(credentials, "companies", input.query, ["name", "domain", "phone", "industry", "website", "hubspot_owner_id"], limit, context),
  ]);

  const [contactRecords, companyRecords] = await Promise.all([
    buildLookupRecords(credentials, "contacts", contacts.results ?? [], ["email", "firstname", "lastname", "phone", "jobtitle", "hubspot_owner_id"], ["deals", "companies"], context),
    buildLookupRecords(credentials, "companies", companies.results ?? [], ["name", "domain", "phone", "industry", "website", "hubspot_owner_id"], ["deals", "contacts"], context),
  ]);

  return {
    records: [...contactRecords, ...companyRecords].slice(0, limit * 2),
    requestId: contacts.requestId ?? companies.requestId,
  };
}

export async function lookupHubSpotDeals(
  credentials: HubSpotCredentials & { hubId: string | null },
  input: { query: string; limit?: number },
  context: HubSpotProviderContext
): Promise<HubSpotLookupResult> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  const deals = await searchObjects(credentials, "deals", input.query, ["dealname", "pipeline", "dealstage", "amount", "closedate", "hubspot_owner_id"], limit, context);

  return {
    records: await buildLookupRecords(credentials, "deals", deals.results ?? [], ["dealname", "pipeline", "dealstage", "amount", "closedate", "hubspot_owner_id"], ["contacts", "companies"], context),
    requestId: deals.requestId,
  };
}

export async function createOrUpdateHubSpotObject(input: {
  credentials: HubSpotCredentials & { hubId: string | null };
  objectType: "contacts" | "companies" | "deals";
  recordId?: string;
  properties: Record<string, string | number | null | undefined>;
  dealIds?: string[];
  contactIds?: string[];
  companyIds?: string[];
  primaryCompanyId?: string;
  context: HubSpotProviderContext;
}): Promise<HubSpotMutationResult> {
  const properties = sanitizeProperties(input.properties);
  if (!input.recordId) {
    assertHasProperties(properties, input.objectType);
  }

  if (input.objectType === "deals") {
    const currentDeal = input.recordId
      ? await readObject(input.credentials, "deals", input.recordId, ["pipeline"], [], input.context)
      : null;
    const pipeline = properties.pipeline ?? currentDeal?.properties?.pipeline ?? null;
    const stage = properties.dealstage ?? null;

    if (pipeline && stage) {
      await validateDealPipeline(input.credentials, pipeline, stage, input.context);
    }
  }

  const result = input.recordId
    ? await updateObject(input.credentials, input.objectType, input.recordId, properties, input.context)
    : await createObject(input.credentials, input.objectType, properties, input.context);

  if (input.objectType === "contacts") {
    for (const dealId of input.dealIds ?? []) {
      await associateDefault(input.credentials, "contact", result.id, "deal", dealId, input.context);
    }
  }

  if (input.objectType === "companies") {
    for (const dealId of input.dealIds ?? []) {
      await associateDefault(input.credentials, "company", result.id, "deal", dealId, input.context);
    }
  }

  if (input.objectType === "deals") {
    for (const contactId of input.contactIds ?? []) {
      await associateDefault(input.credentials, "deal", result.id, "contact", contactId, input.context);
    }

    for (const companyId of input.companyIds ?? []) {
      await associateDefault(input.credentials, "deal", result.id, "company", companyId, input.context);
    }

    if (input.primaryCompanyId) {
      await associatePrimaryCompanyToDeal(input.credentials, result.id, input.primaryCompanyId, input.context);
    }
  }

  return result;
}

export async function createHubSpotEngagement(input: {
  credentials: HubSpotCredentials & { hubId: string | null };
  objectType: "tasks" | "meetings";
  properties: Record<string, string | number | null | undefined>;
  dealIds?: string[];
  contactIds?: string[];
  companyIds?: string[];
  context: HubSpotProviderContext;
}): Promise<HubSpotMutationResult> {
  const properties = sanitizeProperties(input.properties);
  assertHasProperties(properties, input.objectType);

  const result = await createObject(input.credentials, input.objectType, properties, input.context);

  for (const dealId of input.dealIds ?? []) {
    await associateDefault(input.credentials, input.objectType.slice(0, -1), result.id, "deal", dealId, input.context);
  }

  for (const contactId of input.contactIds ?? []) {
    await associateDefault(input.credentials, input.objectType.slice(0, -1), result.id, "contact", contactId, input.context);
  }

  for (const companyId of input.companyIds ?? []) {
    await associateDefault(input.credentials, input.objectType.slice(0, -1), result.id, "company", companyId, input.context);
  }

  return result;
}

export async function archiveHubSpotObject(input: {
  credentials: HubSpotCredentials & { hubId: string | null };
  objectType: "contacts" | "tasks";
  recordId: string;
  context: HubSpotProviderContext;
}): Promise<HubSpotMutationResult> {
  return archiveObject(
    input.credentials,
    input.objectType,
    input.recordId,
    input.context
  );
}
