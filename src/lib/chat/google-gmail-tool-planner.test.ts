import assert from "node:assert/strict";

import { planGoogleGmailToolAction } from "./google-gmail-tool-planner";

const config = {
  provider: "google",
  surface: "gmail",
  allowed_actions: [
    "search_threads",
    "read_thread",
    "create_draft_reply",
    "apply_label",
    "archive_thread",
  ],
} as const;

async function runDraftPlanningTest(): Promise<void> {
  const result = await planGoogleGmailToolAction({
    config: config as never,
    latestUserMessage:
      'responde este mail con un borrador que diga "Gracias, lo reviso hoy"',
    recentMessages: [],
    recentToolContext:
      "thread_id=abc123def456\nmessage_id=msg-1\nrfc_message_id=<msg-1@example.com>\nsubject=Factura Marzo",
  });

  assert.equal(result.kind, "write");
  if (result.kind === "write") {
    assert.equal(result.input.action, "create_draft_reply");
    assert.equal(result.input.threadId, "abc123def456");
    assert.equal(result.input.messageId, "msg-1");
  }
}

async function runLabelMissingDataTest(): Promise<void> {
  const result = await planGoogleGmailToolAction({
    config: config as never,
    latestUserMessage: "aplica un label a este hilo",
    recentMessages: [],
    recentToolContext: undefined,
  });

  assert.equal(result.kind, "missing_data");
}

async function runArchivePlanningTest(): Promise<void> {
  const result = await planGoogleGmailToolAction({
    config: config as never,
    latestUserMessage: "archiva este hilo",
    recentMessages: [],
    recentToolContext:
      "thread_id=abc123def456\nmessage_id=msg-1\nrfc_message_id=<msg-1@example.com>\nsubject=Factura Marzo",
  });

  assert.equal(result.kind, "write");
  if (result.kind === "write") {
    assert.equal(result.input.action, "archive_thread");
  }
}

async function runDraftResolvesThreadBeforeWriteTest(): Promise<void> {
  const result = await planGoogleGmailToolAction({
    config: config as never,
    latestUserMessage:
      'responde este hilo con un borrador que diga "Gracias, lo reviso hoy"',
    recentMessages: [],
    recentToolContext: "thread_id=abc123def456\nsubject=Factura Marzo",
  });

  assert.equal(result.kind, "resolve_thread_for_write");
  if (result.kind === "resolve_thread_for_write") {
    assert.equal(result.readInput.threadId, "abc123def456");
    assert.equal(result.writeAction.action, "create_draft_reply");
  }
}

async function runShortDraftRequestUsesRecentThreadContextTest(): Promise<void> {
  const result = await planGoogleGmailToolAction({
    config: config as never,
    latestUserMessage: 'crea un borrador que diga "Hola"',
    recentMessages: [],
    recentToolContext:
      "thread_id=abc123def456\nmessage_id=msg-1\nrfc_message_id=<msg-1@example.com>\nsubject=Factura Marzo",
  });

  assert.equal(result.kind, "write");
  if (result.kind === "write") {
    assert.equal(result.input.action, "create_draft_reply");
    assert.equal(result.input.body, "Hola");
  }
}

async function main(): Promise<void> {
  await runDraftPlanningTest();
  await runLabelMissingDataTest();
  await runArchivePlanningTest();
  await runDraftResolvesThreadBeforeWriteTest();
  await runShortDraftRequestUsesRecentThreadContextTest();
  console.log("google-gmail-tool-planner checks passed");
}

void main();
