import assert from "node:assert/strict";
import { createDefaultAgentSetupState } from "./agent-setup";
import { normalizeSetupState } from "./agent-setup-state";

function run(): void {
  const legacyGmailSetup = createDefaultAgentSetupState({
    templateId: "gmail_inbox_assistant",
    integrations: ["gmail"],
  });
  legacyGmailSetup.builder_draft.objective = "Resolver pedidos por Gmail.";
  const legacyGmailRaw = { ...legacyGmailSetup };
  delete (legacyGmailRaw as Record<string, unknown>).workflowId;
  delete (legacyGmailRaw as Record<string, unknown>).agentScope;
  delete (legacyGmailRaw as Record<string, unknown>).outOfScopePolicy;
  delete (legacyGmailRaw as Record<string, unknown>).capabilities;
  delete (legacyGmailRaw as Record<string, unknown>).businessInstructions;

  const normalizedLegacyGmail = normalizeSetupState(legacyGmailRaw);
  assert.equal(normalizedLegacyGmail.workflowId, "general_operations");
  assert.equal(normalizedLegacyGmail.agentScope, "support");
  assert.equal(normalizedLegacyGmail.outOfScopePolicy, "reject_and_redirect");
  assert.ok(normalizedLegacyGmail.capabilities.includes("request_handling"));
  assert.ok(normalizedLegacyGmail.capabilities.includes("integrated_reads"));
  assert.match(normalizedLegacyGmail.businessInstructions.objective, /resolver|pedido/i);

  const legacyWorkflowSetup = createDefaultAgentSetupState({
    workflowTemplateId: "advanced_builder",
    integrations: ["google_calendar"],
  });
  legacyWorkflowSetup.automationPreset = "assisted";
  const legacyWorkflowRaw = { ...legacyWorkflowSetup };
  delete (legacyWorkflowRaw as Record<string, unknown>).workflowId;
  delete (legacyWorkflowRaw as Record<string, unknown>).agentScope;
  delete (legacyWorkflowRaw as Record<string, unknown>).outOfScopePolicy;
  delete (legacyWorkflowRaw as Record<string, unknown>).capabilities;
  delete (legacyWorkflowRaw as Record<string, unknown>).businessInstructions;

  const normalizedLegacyWorkflow = normalizeSetupState(legacyWorkflowRaw);
  assert.equal(normalizedLegacyWorkflow.workflowId, "general_operations");
  assert.equal(normalizedLegacyWorkflow.agentScope, "operations");
  assert.ok(normalizedLegacyWorkflow.capabilities.includes("request_handling"));
  assert.ok(normalizedLegacyWorkflow.capabilities.includes("scheduled_jobs"));

  const modernSetup = normalizeSetupState({
    ...legacyWorkflowSetup,
    workflowId: "general_operations",
    agentScope: "sales",
    outOfScopePolicy: "reject_and_redirect",
    capabilities: ["request_handling", "document_generation"],
    businessInstructions: {
      objective: "Crear resúmenes.",
      context: "Backoffice.",
      tasks: "Generar documentos.",
      restrictions: "No inventar datos.",
      handoffCriteria: "Escalar si falta aprobación.",
      outputStyle: "Breve y accionable.",
    },
  });
  assert.equal(modernSetup.agentScope, "sales");
  assert.deepEqual(modernSetup.capabilities, ["request_handling", "document_generation"]);
  assert.equal(modernSetup.businessInstructions.objective, "Crear resúmenes.");

  console.log("agent-setup-state checks passed");
}

run();
