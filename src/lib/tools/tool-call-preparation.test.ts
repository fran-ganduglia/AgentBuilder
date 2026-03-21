import assert from "node:assert/strict";
import { prepareToolCallExecution } from "./tool-call-preparation";

function createApprovalPolicy(shouldRequireApproval: boolean) {
  return {
    requireApproval: () => shouldRequireApproval,
  };
}

function runNeedsFormBeforeApprovalChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-1",
    toolName: "gmail_send_email",
    arguments: JSON.stringify({
      to: "ana@example.com",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "needs_form");
  assert.match(result.assistantContent, /\[FORM_DATA:/);
  assert.equal(result.pendingChatForm.action, "send_email");
  assert.equal(result.pendingChatForm.definition.title, "Enviar email nuevo");
}

function runStructuredListNormalizationChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-2",
    toolName: "gmail_send_email",
    arguments: JSON.stringify({
      to: "ana@example.com\nben@example.com",
      cc: "cc1@example.com,cc2@example.com",
      body: "Hola equipo",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "requires_approval");
  assert.deepEqual(result.args.to, ["ana@example.com", "ben@example.com"]);
  assert.deepEqual(result.args.cc, ["cc1@example.com", "cc2@example.com"]);
}

function runHiddenReferenceChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-3",
    toolName: "gmail_create_draft_reply",
    arguments: JSON.stringify({
      threadId: "thread-123456789012",
      messageId: "msg-123",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "needs_form");
  assert.deepEqual(result.pendingChatForm.fieldUi.threadId, {
    hidden: true,
    readOnly: true,
  });
  assert.deepEqual(result.pendingChatForm.fieldUi.messageId, {
    hidden: true,
    readOnly: true,
  });
}

function runSheetsChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-4",
    toolName: "google_sheets_append_rows",
    arguments: JSON.stringify({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc1234567890/edit",
      sheetName: "Leads",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "needs_form");
  assert.ok(
    result.pendingChatForm.definition.fields.some((field) => field.key === "values")
  );
}

function runSheetsReadRoutingChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-4b",
    toolName: "google_sheets_get_spreadsheet",
    arguments: JSON.stringify({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc1234567890/edit",
    }),
    approvalPolicy: createApprovalPolicy(false),
  });

  assert.equal(result.kind, "execute_now");
  assert.equal(result.action, "get_spreadsheet");
}

function runSheetsStructuredPayloadChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-4c",
    toolName: "google_sheets_update_rows_by_match",
    arguments: JSON.stringify({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc1234567890/edit",
      sheetName: "Leads",
      records: '[{"estado":"Contactado"}]',
      "match.column": "email",
      "match.value": "ana@example.com",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "requires_approval");
  assert.deepEqual(result.args.match, {
    column: "email",
    value: "ana@example.com",
    operator: "equals",
  });
}

function runGoogleCalendarDateTimeNormalizationChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-5",
    toolName: "google_calendar_create_event",
    arguments: JSON.stringify({
      title: "Demo",
      timezone: "America/Argentina/Buenos_Aires",
      startIso: "2026-03-16T07:47",
      endIso: "2026-03-16T08:21:00",
    }),
    approvalPolicy: createApprovalPolicy(true),
  });

  assert.equal(result.kind, "requires_approval");
  assert.equal(result.args.title, "Demo");
  assert.equal(result.args.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(result.args.startIso, "2026-03-16T10:47:00.000Z");
  assert.equal(result.args.endIso, "2026-03-16T11:21:00.000Z");
}

function runSalesforceChecks(): void {
  const result = prepareToolCallExecution({
    toolCallId: "tool-6",
    toolName: "salesforce_lookup_records",
    arguments: JSON.stringify({}),
    approvalPolicy: createApprovalPolicy(false),
  });

  assert.equal(result.kind, "needs_form");
  assert.ok(
    result.pendingChatForm.definition.fields.some((field) => field.key === "query")
  );
}

function run(): void {
  runNeedsFormBeforeApprovalChecks();
  runStructuredListNormalizationChecks();
  runHiddenReferenceChecks();
  runSheetsChecks();
  runSheetsReadRoutingChecks();
  runSheetsStructuredPayloadChecks();
  runGoogleCalendarDateTimeNormalizationChecks();
  runSalesforceChecks();
  console.log("tool-call-preparation checks passed");
}

run();
