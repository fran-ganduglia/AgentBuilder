import assert from "node:assert/strict";

const {
  detectSalesforcePromptConflict,
  getSalesforceAgentToolSelectionDiagnostics,
  selectMostRecentByCreatedAt,
  selectPreferredSalesforceAgentToolCore,
} = await import(new URL("./salesforce-selection.ts", import.meta.url).href);

type SalesforceToolConfigLike = {
  provider: "salesforce";
  allowed_actions: string[];
};

type TestRecord = {
  id: string;
  created_at: string | null;
};

type TestTool = {
  id: string;
  tool_type: string;
  integration_id: string | null;
  is_enabled: boolean | null;
  created_at: string | null;
  config: unknown;
};

function parseConfig(config: unknown): SalesforceToolConfigLike | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const provider = Reflect.get(config, "provider");
  const allowedActions = Reflect.get(config, "allowed_actions");

  if (provider !== "salesforce" || !Array.isArray(allowedActions)) {
    return null;
  }

  return {
    provider,
    allowed_actions: allowedActions.filter(
      (value): value is string => typeof value === "string"
    ),
  };
}

function run(): void {
  const records: TestRecord[] = [
    { id: "older", created_at: "2026-03-10T10:00:00.000Z" },
    { id: "newest", created_at: "2026-03-12T15:30:00.000Z" },
    { id: "middle", created_at: "2026-03-11T12:00:00.000Z" },
  ];

  assert.equal(selectMostRecentByCreatedAt(records)?.id, "newest");

  const alignedTools: TestTool[] = [
    {
      id: "stale",
      tool_type: "crm",
      integration_id: "integration-old",
      is_enabled: true,
      created_at: "2026-03-11T10:00:00.000Z",
      config: { provider: "salesforce", allowed_actions: ["lookup_records"] },
    },
    {
      id: "aligned",
      tool_type: "crm",
      integration_id: "integration-new",
      is_enabled: true,
      created_at: "2026-03-12T10:00:00.000Z",
      config: { provider: "salesforce", allowed_actions: ["lookup_records"] },
    },
  ];

  assert.equal(
    selectPreferredSalesforceAgentToolCore(alignedTools, "integration-new", parseConfig)?.id,
    "aligned"
  );

  const duplicateTools: TestTool[] = [
    {
      id: "selected",
      tool_type: "crm",
      integration_id: "integration-new",
      is_enabled: true,
      created_at: "2026-03-12T10:00:00.000Z",
      config: { provider: "salesforce", allowed_actions: ["create_task"] },
    },
    {
      id: "stale",
      tool_type: "crm",
      integration_id: "integration-old",
      is_enabled: true,
      created_at: "2026-03-11T10:00:00.000Z",
      config: { provider: "salesforce", allowed_actions: ["lookup_records"] },
    },
  ];

  const diagnostics = getSalesforceAgentToolSelectionDiagnostics(
    duplicateTools,
    "integration-new",
    parseConfig
  );

  assert.equal(diagnostics.selectedTool?.id, "selected");
  assert.equal(diagnostics.hasDuplicateSalesforceTools, true);
  assert.equal(diagnostics.hasMisalignedSalesforceTools, true);
  assert.equal(diagnostics.hasLookupRecordsAction, false);
  assert.deepEqual(diagnostics.selectedAllowedActions, ["create_task"]);

  const prompt = `
    Quiero ser transparente contigo:
    No tengo acceso a tu CRM.
    No estoy conectado a Salesforce ni a ninguna base de datos externa.
  `;

  const result = detectSalesforcePromptConflict(prompt);

  assert.equal(result.hasConflict, true);
  assert.match(result.snippet ?? "", /no tengo acceso/i);
}

run();
console.log("salesforce-selection checks passed");
