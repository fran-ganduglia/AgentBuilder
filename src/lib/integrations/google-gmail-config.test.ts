import assert from "node:assert/strict";

import {
  getDefaultGmailAgentToolConfig,
} from "./google-agent-tools";
import {
  GMAIL_REQUIRED_SCOPES,
  getRequiredGoogleScopesForSurface,
} from "./google-scopes";

function runGmailScopesTest(): void {
  assert.deepEqual(GMAIL_REQUIRED_SCOPES, [
    "https://www.googleapis.com/auth/gmail.metadata",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ]);
  assert.deepEqual(getRequiredGoogleScopesForSurface("gmail"), [
    "https://www.googleapis.com/auth/gmail.metadata",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ]);
}

function runGmailDefaultToolConfigTest(): void {
  assert.deepEqual(getDefaultGmailAgentToolConfig().allowed_actions, [
    "search_threads",
    "read_thread",
  ]);
}

function main(): void {
  runGmailScopesTest();
  runGmailDefaultToolConfigTest();
  console.log("google-gmail-config checks passed");
}

main();
