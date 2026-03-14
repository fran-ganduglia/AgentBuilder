import assert from "node:assert/strict";
import { executeSalesforceCrmToolSchema } from "./salesforce-tools";

function main(): void {
  const recentValid = executeSalesforceCrmToolSchema.safeParse({
    action: "list_leads_recent",
    limit: 10,
    createdAfter: "2026-03-01",
  });
  assert.equal(recentValid.success, true);

  const recentInvalidLimit = executeSalesforceCrmToolSchema.safeParse({
    action: "list_leads_recent",
    limit: 30,
  });
  assert.equal(recentInvalidLimit.success, false);

  const statusValid = executeSalesforceCrmToolSchema.safeParse({
    action: "list_leads_by_status",
    status: "Open",
    limit: 5,
  });
  assert.equal(statusValid.success, true);

  const updateLeadInvalid = executeSalesforceCrmToolSchema.safeParse({
    action: "update_lead",
    leadId: "00Q123456789012AAA",
  });
  assert.equal(updateLeadInvalid.success, false);

  const updateLeadValid = executeSalesforceCrmToolSchema.safeParse({
    action: "update_lead",
    leadId: "00Q123456789012AAA",
    status: "Working",
  });
  assert.equal(updateLeadValid.success, true);

  const createContactInvalid = executeSalesforceCrmToolSchema.safeParse({
    action: "create_contact",
    email: "test@example.com",
  });
  assert.equal(createContactInvalid.success, false);

  const createContactValid = executeSalesforceCrmToolSchema.safeParse({
    action: "create_contact",
    lastName: "Perez",
    accountName: "Acme",
  });
  assert.equal(createContactValid.success, true);

  const summarizeValid = executeSalesforceCrmToolSchema.safeParse({
    action: "summarize_pipeline",
  });
  assert.equal(summarizeValid.success, true);

  console.log("salesforce-tools checks passed");
}

main();

export {};
