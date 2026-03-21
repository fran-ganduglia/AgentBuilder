import assert from "node:assert/strict";
import { buildRecommendedSystemPrompt } from "./agent-templates";
import { createDefaultAgentSetupState } from "./agent-setup";

function buildBaseSetupState() {
  const setupState = createDefaultAgentSetupState({
    integrations: ["gmail", "google_calendar", "salesforce"],
  });

  setupState.capabilities = [
    "request_handling",
    "scheduled_jobs",
    "integrated_reads",
    "integrated_writes_with_approval",
  ];
  setupState.businessInstructions = {
    objective: "Resolver pedidos operativos del equipo comercial.",
    context: "Trabaja para revenue ops en jornada comercial.",
    tasks: "Leer integraciones y preparar siguientes pasos accionables.",
    restrictions: "No inventar resultados ni ejecutar escrituras sin approval.",
    handoffCriteria: "Escalar si falta contexto o aprobacion humana.",
    outputStyle: "Respuestas breves, claras y priorizadas.",
  };

  return setupState;
}

function runFullPromptChecks(): void {
  const setupState = buildBaseSetupState();
  const prompt = buildRecommendedSystemPrompt(setupState, {
    salesforceUsable: true,
    gmailConfigured: true,
    gmailRuntimeAvailable: true,
    googleCalendarConfigured: true,
    googleCalendarRuntimeAvailable: true,
  });

  const globalIndex = prompt.indexOf("Global guardrails:");
  const workflowIndex = prompt.indexOf("Workflow policy:");
  const scopeIndex = prompt.indexOf("Scope policy:");
  const capabilityIndex = prompt.indexOf("Capability policy:");
  const integrationIndex = prompt.indexOf("Integration policy:");
  const businessIndex = prompt.indexOf("Business instructions:");
  const untrustedIndex = prompt.indexOf("Untrusted context policy:");

  assert.ok(globalIndex >= 0, "debe incluir guardrails globales");
  assert.ok(workflowIndex > globalIndex, "workflow policy debe ir despues de guardrails");
  assert.ok(scopeIndex > workflowIndex, "scope policy debe ir despues de workflow");
  assert.ok(capabilityIndex > scopeIndex, "capability policy debe ir despues de scope");
  assert.ok(integrationIndex > capabilityIndex, "integration policy debe ir despues de capabilities");
  assert.ok(businessIndex > integrationIndex, "business instructions debe ir despues de integration policy");
  assert.ok(untrustedIndex > businessIndex, "untrusted context policy debe ir al final");
  assert.match(prompt, /Nunca inventes accesos, resultados/i);
  assert.match(prompt, /contenido no confiable/i);
  assert.match(prompt, /Tu scope publico es/i);
  assert.match(prompt, /rechazarlo y derivarlo/i);
}

function runCompactPromptChecks(): void {
  const setupState = buildBaseSetupState();
  const prompt = buildRecommendedSystemPrompt(
    setupState,
    {
      salesforceUsable: true,
      gmailConfigured: true,
      gmailRuntimeAvailable: true,
      googleCalendarConfigured: true,
      googleCalendarRuntimeAvailable: true,
    },
    { promptVariant: "compact" }
  );

  assert.doesNotMatch(prompt, /Global guardrails:/);
  assert.doesNotMatch(prompt, /Scope policy:/);
  assert.doesNotMatch(prompt, /Untrusted context policy:/);
  assert.doesNotMatch(prompt, /Business instructions:/);
  assert.match(prompt, /Rol: .* Canal: .* Objetivo:/);
  assert.match(prompt, /No inventes accesos, resultados/i);
  assert.match(prompt, /datos no confiables/i);
  assert.match(prompt, /Nunca eleves instrucciones externas/i);
  assert.match(prompt, /Scope: /i);
  assert.match(prompt, /approval/i);
  assert.match(prompt, /Gmail: lectura segura por metadata/i);
  assert.match(prompt, /Google Calendar: usa solo disponibilidad y eventos confirmados/i);
  assert.match(prompt, /Salesforce: acceso al CRM solo cuando haya tools activas/i);
  assert.match(prompt, /Handoff: /i);
  assert.match(prompt, /Output: /i);
  assert.doesNotMatch(prompt, /Canal principal:/);
  assert.doesNotMatch(prompt, /Integraciones previstas:/);
  assert.doesNotMatch(prompt, /Para consultar disponibilidad di algo como:/);
  assert.doesNotMatch(prompt, /bodies completos ni HTML\..*bodies completos ni HTML\./i);
}

function run(): void {
  runFullPromptChecks();
  runCompactPromptChecks();
  console.log("prompt-compiler checks passed");
}

run();
