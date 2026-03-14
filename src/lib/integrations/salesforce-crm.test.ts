import assert from "node:assert/strict";
import {
  buildSalesforceLeadByStatusSoql,
  buildSalesforceLeadRecentSoql,
  buildSalesforceOpenPipelineStageSoql,
  buildSalesforceOpenPipelineTotalSoql,
  mapSalesforceLeadListRecord,
  resolveSalesforceAccountMatch,
} from "./salesforce-crm";
import { ProviderRequestError } from "./provider-errors";

function main(): void {
  const recentSoql = buildSalesforceLeadRecentSoql({ limit: 12, createdAfter: "2026-03-01" });
  assert.match(recentSoql, /CreatedDate >= 2026-03-01T00:00:00Z/);
  assert.match(recentSoql, /LIMIT 12$/);

  const statusSoql = buildSalesforceLeadByStatusSoql({ status: "Open", limit: 7 });
  assert.match(statusSoql, /Status = 'Open'/);
  assert.match(statusSoql, /LIMIT 7$/);

  const escapedStatusSoql = buildSalesforceLeadByStatusSoql({ status: "Partner's Queue", limit: 3 });
  assert.match(escapedStatusSoql, /Partner\\'s Queue/);

  const mappedLead = mapSalesforceLeadListRecord({
    Id: "00Q123456789012AAA",
    FirstName: "Ana",
    LastName: "Perez",
    Company: "Acme",
    Email: "ana@example.com",
    Phone: "+54 11 5555 5555",
    Status: "Open",
    CreatedDate: "2026-03-10T12:00:00.000Z",
  }, "https://example.my.salesforce.com");

  assert.deepEqual(mappedLead, {
    id: "00Q123456789012AAA",
    name: "Ana Perez",
    company: "Acme",
    email: "ana@example.com",
    phone: "+54 11 5555 5555",
    status: "Open",
    createdDate: "2026-03-10T12:00:00.000Z",
    url: "https://example.my.salesforce.com/lightning/r/Lead/00Q123456789012AAA/view",
  });

  assert.match(buildSalesforceOpenPipelineStageSoql(), /GROUP BY StageName/);
  assert.doesNotMatch(buildSalesforceOpenPipelineStageSoql(), /SELECT Id/);
  assert.match(buildSalesforceOpenPipelineTotalSoql(), /WHERE IsClosed = false/);

  assert.deepEqual(resolveSalesforceAccountMatch([{ Id: "001123456789012AAA", Name: "Acme" }], "Acme"), {
    accountId: "001123456789012AAA",
  });

  assert.throws(() => resolveSalesforceAccountMatch([], "Acme"), (error: unknown) => {
    assert.equal(error instanceof ProviderRequestError, true);
    assert.match((error as Error).message, /No encontre una cuenta/);
    return true;
  });

  assert.throws(() => resolveSalesforceAccountMatch([
    { Id: "001123456789012AAA", Name: "Acme" },
    { Id: "001123456789012AAB", Name: "Acme" },
  ], "Acme"), (error: unknown) => {
    assert.equal(error instanceof ProviderRequestError, true);
    assert.match((error as Error).message, /Hay varias cuentas/);
    return true;
  });

  console.log("salesforce-crm checks passed");
}

main();

export {};
