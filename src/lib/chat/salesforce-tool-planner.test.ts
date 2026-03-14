import assert from "node:assert/strict";
import {
  getCurrentMonthStart,
  normalizeSalesforcePlannerDecision,
  preclassifySalesforceLeadAction,
} from "./salesforce-tool-planner";
import type { SalesforceCrmAction } from "../integrations/salesforce-tools";

function buildConfig(allowedActions: SalesforceCrmAction[]) {
  return {
    provider: "salesforce" as const,
    allowed_actions: allowedActions,
  };
}

function main(): void {
  const config = buildConfig([
    "lookup_records",
    "list_leads_recent",
    "list_leads_by_status",
  ]);

  assert.equal(getCurrentMonthStart(new Date("2026-03-12T10:00:00Z")), "2026-03-01");

  const recent = preclassifySalesforceLeadAction("dame los leads nuevos", config, new Date("2026-03-12T10:00:00Z"));
  assert.deepEqual(recent, { action: "list_leads_recent", limit: 10 });

  const latest = preclassifySalesforceLeadAction("ultimos leads", config, new Date("2026-03-12T10:00:00Z"));
  assert.deepEqual(latest, { action: "list_leads_recent", limit: 10 });

  const thisMonth = preclassifySalesforceLeadAction("leads este mes", config, new Date("2026-03-12T10:00:00Z"));
  assert.deepEqual(thisMonth, {
    action: "list_leads_recent",
    limit: 10,
    createdAfter: "2026-03-01",
  });

  const byStatus = preclassifySalesforceLeadAction("dame los leads Open", config, new Date("2026-03-12T10:00:00Z"));
  assert.deepEqual(byStatus, {
    action: "list_leads_by_status",
    status: "Open",
    limit: 10,
  });

  const aliasDecision = normalizeSalesforcePlannerDecision({
    decision: "execute_action",
    reason: "buscar persona",
    action: "lookup_person",
    arguments: { name: "Ana Perez", limit: 2 },
  }, config);

  assert.equal(aliasDecision.decision.kind, "action");
  assert.equal(aliasDecision.aliasApplied, true);
  assert.deepEqual(aliasDecision.decision.kind === "action" ? aliasDecision.decision.input : null, {
    action: "lookup_records",
    query: "Ana Perez",
    limit: 2,
  });

  const invalidAliasDecision = normalizeSalesforcePlannerDecision({
    decision: "execute_action",
    reason: "listar leads",
    action: "lookup_person",
    arguments: {},
  }, config);
  assert.equal(invalidAliasDecision.decision.kind, "respond");

  console.log("salesforce-tool-planner checks passed");
}

main();

export {};
