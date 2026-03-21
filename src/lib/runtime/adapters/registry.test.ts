import assert from "node:assert/strict";

import {
  createAdapterRegistryV1,
  listAdapterManifestsV1,
  probeAdapterRegistryCapabilitiesV1,
} from "./registry";
import { selectAdapter } from "./selector";

async function main(): Promise<void> {
  const registry = createAdapterRegistryV1({
    enqueueApproval: async () => ({
      data: {
        approvalItemId: "approval-1",
        workflowRunId: "run-1",
        workflowStepId: "step-1",
        idempotencyKey: "key-1",
        expiresAt: "2026-03-18T00:00:00.000Z",
      },
      error: null,
    }),
  });

  const manifests = listAdapterManifestsV1(registry);
  const probes = probeAdapterRegistryCapabilitiesV1(registry);

  const gmailAdapter = selectAdapter({
    ctx: {
      requestId: "req-1",
      traceId: "trace-1",
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      conversationMetadata: {},
      messageMetadata: {},
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 0,
        llmRepairCallsMaxPerAction: 1,
        syncRetriesMaxPerAction: 1,
      },
    },
    action: {
      id: "action-1",
      type: "search_email",
      approvalMode: "auto",
      params: {},
    },
    registry,
  });
  const calendarAdapter = selectAdapter({
    ctx: {
      requestId: "req-1",
      traceId: "trace-1",
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      conversationMetadata: {},
      messageMetadata: {},
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 0,
        llmRepairCallsMaxPerAction: 1,
        syncRetriesMaxPerAction: 1,
      },
    },
    action: {
      id: "action-2",
      type: "create_event",
      approvalMode: "required",
      params: {},
    },
    registry,
  });

  assert.equal(gmailAdapter.provider, "gmail");
  assert.equal(calendarAdapter.provider, "google_calendar");
  const sheetsAdapter = selectAdapter({
    ctx: {
      requestId: "req-1",
      traceId: "trace-1",
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      conversationMetadata: {},
      messageMetadata: {},
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 0,
        llmRepairCallsMaxPerAction: 1,
        syncRetriesMaxPerAction: 1,
      },
    },
    action: {
      id: "action-3",
      type: "read_sheet_range",
      approvalMode: "auto",
      params: {},
    },
    registry,
  });
  const salesforceAdapter = selectAdapter({
    ctx: {
      requestId: "req-1",
      traceId: "trace-1",
      organizationId: "org-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      conversationMetadata: {},
      messageMetadata: {},
      budget: {
        plannerCallsMax: 1,
        plannerCallsUsed: 0,
        llmRepairCallsMaxPerAction: 1,
        syncRetriesMaxPerAction: 1,
      },
    },
    action: {
      id: "action-4",
      type: "search_records",
      approvalMode: "auto",
      params: {},
    },
    registry,
  });
  assert.equal(sheetsAdapter.provider, "google_sheets");
  assert.equal(salesforceAdapter.provider, "salesforce");
  assert.equal(manifests.length, 4);
  assert.equal(manifests.every((manifest) => manifest.version === "1.0.0"), true);
  assert.equal(probes.length, 4);
  assert.equal(
    probes.some(
      (probe) =>
        probe.provider === "google_calendar" &&
        probe.supportedActionTypes.includes("create_event")
    ),
    true
  );
  console.log("runtime adapter registry checks passed");
}

void main();
