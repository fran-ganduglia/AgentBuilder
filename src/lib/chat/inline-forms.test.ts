import assert from "node:assert/strict";
import {
  buildFormSubmissionMessage,
  formatChatConfirmationMarker,
  formatChatFormMarker,
  getAvailableChatForms,
  isInlineChatSurfaceActive,
  parseChatConfirmationMarker,
  parseChatFormMarker,
  parseChatFormSubmissionMessage,
} from "./inline-forms";

function runMarkerParserChecks(): void {
  const validFormMessage = [
    "Completo lo que falta y despues lo enviamos al CRM.",
    formatChatFormMarker("hubspot_create_contact"),
  ].join("\n");

  assert.deepEqual(parseChatFormMarker(validFormMessage), {
    formId: "hubspot_create_contact",
    content: "Completo lo que falta y despues lo enviamos al CRM.",
    marker: "[FORM:hubspot_create_contact]",
  });

  assert.equal(
    parseChatFormMarker(
      `Mensaje con marker al medio ${formatChatFormMarker("hubspot_create_contact")} y mas texto`
    ),
    null
  );
  assert.equal(parseChatFormMarker("Mensaje normal"), null);
  assert.equal(parseChatFormMarker("[FORM:hubspot_create_deal]"), null);

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
    parseChatConfirmationMarker(
      `Texto ${formatChatConfirmationMarker("hubspot")} todavia no final`
    ),
    null
  );
  assert.equal(parseChatConfirmationMarker("[CONFIRM:unknown]"), null);
}

function runRegistryChecks(): void {
  assert.deepEqual(
    getAvailableChatForms("hubspot", [
      "create_contact",
      "create_task",
      "create_deal",
    ]).map((form) => form.id),
    ["hubspot_create_contact", "hubspot_create_task"]
  );

  assert.deepEqual(
    getAvailableChatForms("salesforce", [
      "create_contact",
      "lookup_records",
      "create_lead",
    ]).map((form) => form.id),
    ["salesforce_create_lead", "salesforce_create_contact"]
  );

  assert.equal(
    getAvailableChatForms("hubspot", ["create_deal"]).some((form) =>
      form.id.includes("deal")
    ),
    false
  );
}

function runSubmissionChecks(): void {
  const builtMessage = buildFormSubmissionMessage("salesforce_create_task", {
    subject: "Llamar a cliente",
    description: "Confirmar alcance\nCompartir resumen",
    dueDate: "2026-03-14",
    priority: "High",
  });

  assert.equal(
    builtMessage,
    [
      "salesforce_create_task",
      "subject: Llamar a cliente",
      "description: Confirmar alcance\\nCompartir resumen",
      "dueDate: 2026-03-14",
      "priority: High",
    ].join("\n")
  );

  assert.deepEqual(parseChatFormSubmissionMessage(builtMessage), {
    formId: "salesforce_create_task",
    values: {
      subject: "Llamar a cliente",
      description: "Confirmar alcance\nCompartir resumen",
      dueDate: "2026-03-14",
      priority: "High",
    },
  });

  assert.equal(parseChatFormSubmissionMessage("mensaje libre"), null);
  assert.equal(
    parseChatFormSubmissionMessage("salesforce_create_task\nsin separador"),
    null
  );
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
  runMarkerParserChecks();
  runRegistryChecks();
  runSubmissionChecks();
  runActiveSurfaceChecks();
  console.log("inline-forms checks passed");
}

run();
