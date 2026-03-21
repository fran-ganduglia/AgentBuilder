import assert from "node:assert/strict";

import {
  getActionApprovalModeV1,
  getActionDefinitionV1,
  listActionCatalogV1,
  validateActionParamsV1,
} from "./action-catalog";

function runCatalogShapeTest(): void {
  const actions = listActionCatalogV1();

  assert.equal(actions.length, 27);
  assert.ok(actions.some((a) => a.type === "search_email"));
  assert.ok(actions.some((a) => a.type === "create_draft_reply"));
  assert.ok(actions.some((a) => a.type === "check_availability"));
  assert.ok(actions.some((a) => a.type === "list_sheets"));
  assert.ok(actions.some((a) => a.type === "find_rows"));
  assert.deepEqual(getActionDefinitionV1("search_email").input.minimum, ["query"]);
  assert.deepEqual(getActionDefinitionV1("search_email").input.optional, ["maxResults"]);
  assert.equal(getActionDefinitionV1("search_email").output.summary, "Lista de threads resumidos.");

  assert.deepEqual(getActionDefinitionV1("summarize_thread").input.minimum, ["threadRef"]);
  assert.equal(
    getActionDefinitionV1("summarize_thread").output.summary,
    "Resumen textual estructurado."
  );

  assert.deepEqual(
    getActionDefinitionV1("send_email").input.minimum,
    ["to", "subject", "body"]
  );
  assert.deepEqual(getActionDefinitionV1("send_email").input.optional, ["cc", "bcc"]);
  assert.equal(getActionApprovalModeV1("send_email"), "required");

  assert.deepEqual(
    getActionDefinitionV1("create_event").input.minimum,
    ["title", "start", "end"]
  );
  assert.deepEqual(
    getActionDefinitionV1("create_event").input.optional,
    ["timezone", "description", "location", "attendees"]
  );
  assert.equal(getActionApprovalModeV1("create_event"), "required");
}

function runValidationSuccessTest(): void {
  const result = validateActionParamsV1({
    actionType: "create_event",
    params: {
      title: { kind: "primitive", value: "Demo" },
      start: { kind: "time", value: "2026-03-18T15:00:00-03:00", granularity: "datetime" },
      end: { kind: "time", value: "2026-03-18T16:00:00-03:00", granularity: "datetime" },
      attendees: { kind: "primitive", value: ["ana@example.com"] },
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.unknownParams, []);
  assert.deepEqual(result.invalidKinds, []);
}

function runValidationFailureTest(): void {
  const result = validateActionParamsV1({
    actionType: "summarize_thread",
    params: {
      threadRef: { kind: "primitive", value: "ultimo hilo" },
      query: { kind: "primitive", value: "no-permitido" },
    },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.unknownParams, ["query"]);
  assert.deepEqual(result.invalidKinds, ["threadRef"]);
}

function runMissingRequiredTest(): void {
  const result = validateActionParamsV1({
    actionType: "send_email",
    params: {
      to: { kind: "primitive", value: ["ana@example.com"] },
      body: { kind: "primitive", value: "Hola" },
    },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.missingRequired, ["subject"]);
}

function main(): void {
  runCatalogShapeTest();
  runValidationSuccessTest();
  runValidationFailureTest();
  runMissingRequiredTest();
  console.log("runtime action catalog checks passed");
}

main();
