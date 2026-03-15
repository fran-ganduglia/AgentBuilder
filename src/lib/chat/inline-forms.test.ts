import assert from "node:assert/strict";
import {
  formatChatConfirmationMarker,
  isInlineChatSurfaceActive,
  parseChatConfirmationMarker,
  parseChatFormMarker,
} from "./inline-forms";

function runConfirmationMarkerChecks(): void {
  const validConfirmationMessage = [
    "Listo para ejecutar la escritura.",
    formatChatConfirmationMarker("salesforce"),
  ].join("\n");

  assert.deepEqual(parseChatConfirmationMarker(validConfirmationMessage), {
    provider: "salesforce",
    content: "Listo para ejecutar la escritura.",
    marker: "[CONFIRM:salesforce]",
  });

  assert.equal(
    parseChatConfirmationMarker("Texto todavia no final"),
    null
  );
  assert.equal(parseChatConfirmationMarker("[CONFIRM:unknown]"), null);
}

function runLegacyFormMarkerChecks(): void {
  assert.equal(parseChatFormMarker("anything"), null);
  assert.equal(parseChatFormMarker("[FORM:salesforce_create_lead]"), null);
}

function runActiveSurfaceChecks(): void {
  const messages = [
    { id: "1", role: "assistant" },
    { id: "2", role: "user" },
    { id: "3", role: "assistant" },
  ];

  assert.equal(
    isInlineChatSurfaceActive({
      messages,
      messageId: "3",
      isStreaming: false,
    }),
    true
  );
  assert.equal(
    isInlineChatSurfaceActive({
      messages,
      messageId: "1",
      isStreaming: false,
    }),
    false
  );
  assert.equal(
    isInlineChatSurfaceActive({
      messages,
      messageId: "3",
      isStreaming: true,
    }),
    false
  );
}

function run(): void {
  runConfirmationMarkerChecks();
  runLegacyFormMarkerChecks();
  runActiveSurfaceChecks();
  console.log("inline-forms checks passed");
}

run();
