import assert from "node:assert/strict";
import {
  buildGoogleSheetsToolDefinitions,
  buildSalesforceToolDefinitions,
} from "./tool-definitions";

function runGoogleSheetsCompactSchemaChecks(): void {
  const [definition] = buildGoogleSheetsToolDefinitions({
    provider: "google",
    surface: "google_sheets",
    allowed_actions: ["append_records"],
  }, {
    exposure: "llm_compact",
  });

  assert.equal(definition.function.description, "google_sheets.append_records");
  assert.equal(
    (definition.function.parameters.properties as Record<string, unknown>).action,
    undefined
  );

  const properties = definition.function.parameters.properties as Record<string, Record<string, unknown>>;
  assert.ok(properties.records);
  assert.equal(properties.records.description, undefined);
}

function runSalesforceCompactSchemaChecks(): void {
  const [definition] = buildSalesforceToolDefinitions({
    provider: "salesforce",
    allowed_actions: ["create_task"],
  }, {
    exposure: "llm_compact",
  });

  assert.equal(definition.function.description, "salesforce.create_task");
  const properties = definition.function.parameters.properties as Record<string, Record<string, unknown>>;
  assert.equal(properties.subject.description, undefined);
}

function run(): void {
  runGoogleSheetsCompactSchemaChecks();
  runSalesforceCompactSchemaChecks();
  console.log("tool-definitions checks passed");
}

run();
