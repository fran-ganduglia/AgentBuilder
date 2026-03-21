import assert from "node:assert/strict";

import {
  mergeConversationMetadata,
  readPendingCrmAction,
  readRecentCrmToolContext,
} from "./conversation-metadata";

function runDoesNotReadLegacySalesforcePendingActionTest(): void {
  const pendingAction = readPendingCrmAction(
    {
      pending_tool_action: {
        tool: "salesforce_crm",
        integrationId: "550e8400-e29b-41d4-a716-446655440000",
        actionInput: {
          action: "create_lead",
          lastName: "Garcia",
          company: "ACME",
        },
        summary: "Crear lead",
        initiatedBy: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: "2026-03-15T18:00:00.000Z",
        expiresAt: "2026-03-15T18:10:00.000Z",
      },
    },
    "salesforce"
  );

  assert.equal(pendingAction, null);
}

function runDoesNotReadLegacySalesforceRecentContextTest(): void {
  const recentContext = readRecentCrmToolContext(
    {
      recent_salesforce_tool_context: {
        context: "legacy context",
        recordedAt: "2026-03-15T18:00:00.000Z",
      },
    },
    "salesforce"
  );

  assert.equal(recentContext, null);
}

function runMergeDropsLegacySalesforceFieldsTest(): void {
  const merged = mergeConversationMetadata(
    {
      pending_tool_action: {
        tool: "salesforce_crm",
        integrationId: "550e8400-e29b-41d4-a716-446655440000",
        actionInput: {
          action: "create_lead",
          lastName: "Garcia",
          company: "ACME",
        },
        summary: "Crear lead",
        initiatedBy: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: "2026-03-15T18:00:00.000Z",
        expiresAt: "2026-03-15T18:10:00.000Z",
      },
      recent_salesforce_tool_context: {
        context: "legacy context",
        recordedAt: "2026-03-15T18:00:00.000Z",
      },
    },
    {
      pending_crm_action: null,
      recent_crm_tool_context: null,
    }
  ) as Record<string, unknown>;

  assert.equal("pending_tool_action" in merged, false);
  assert.equal("recent_salesforce_tool_context" in merged, false);
}

function main(): void {
  runDoesNotReadLegacySalesforcePendingActionTest();
  runDoesNotReadLegacySalesforceRecentContextTest();
  runMergeDropsLegacySalesforceFieldsTest();
  console.log("conversation-metadata checks passed");
}

main();

export {};
