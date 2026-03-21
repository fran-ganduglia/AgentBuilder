import assert from "node:assert/strict";

import {
  getDefaultGmailAgentToolConfig,
} from "./google-agent-tools";
import {
  GMAIL_REQUIRED_SCOPES,
  GOOGLE_DRIVE_REQUIRED_SCOPES,
  GOOGLE_SHEETS_REQUIRED_SCOPES,
  getRequiredGoogleScopesForSurface,
} from "./google-scopes";

function runGmailScopesTest(): void {
  assert.deepEqual(GMAIL_REQUIRED_SCOPES, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ]);
  assert.deepEqual(getRequiredGoogleScopesForSurface("gmail"), [
    "https://www.googleapis.com/auth/gmail.readonly",
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

function runGoogleSheetsScopesTest(): void {
  assert.deepEqual(GOOGLE_SHEETS_REQUIRED_SCOPES, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ]);
  assert.deepEqual(getRequiredGoogleScopesForSurface("google_sheets"), [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ]);
}

function runGoogleDriveScopesTest(): void {
  assert.deepEqual(GOOGLE_DRIVE_REQUIRED_SCOPES, [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ]);
  assert.deepEqual(getRequiredGoogleScopesForSurface("google_drive"), [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ]);
}

function main(): void {
  runGmailScopesTest();
  runGmailDefaultToolConfigTest();
  runGoogleSheetsScopesTest();
  runGoogleDriveScopesTest();
  console.log("google-gmail-config checks passed");
}

main();
