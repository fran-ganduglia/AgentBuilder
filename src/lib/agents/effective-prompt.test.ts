import assert from "node:assert/strict";
import { createDefaultAgentSetupState, type AgentSetupState } from "./agent-setup";
import { buildRecommendedSystemPrompt } from "./agent-templates";
import { resolveEffectiveAgentPrompt } from "./effective-prompt";

function buildSetupState() {
  const setupState = createDefaultAgentSetupState({
    integrations: ["gmail", "google_calendar", "salesforce"],
  });

  setupState.capabilities = [
    "request_handling",
    "integrated_reads",
    "integrated_writes_with_approval",
  ];
  setupState.businessInstructions.objective = "Resolver pedidos operativos.";
  setupState.businessInstructions.tasks = "Leer y ejecutar solo dentro del runtime habilitado.";
  setupState.businessInstructions.restrictions = "Nunca inventar resultados ni saltar approvals.";

  return setupState;
}

function runRecommendedVariantChecks(): void {
  const setupState = buildSetupState();
  const savedPrompt = buildRecommendedSystemPrompt(setupState, {
    salesforceUsable: true,
    gmailConfigured: true,
    gmailRuntimeAvailable: true,
    googleCalendarConfigured: true,
    googleCalendarRuntimeAvailable: true,
  });

  const result = resolveEffectiveAgentPrompt({
    savedPrompt,
    setupState,
    promptVariant: "compact",
    promptEnvironment: {
      salesforceUsable: true,
      gmailConfigured: true,
      gmailRuntimeAvailable: true,
      googleCalendarConfigured: true,
      googleCalendarRuntimeAvailable: true,
    },
  });

  assert.equal(result.syncMode, "recommended");
  assert.equal(result.promptVariant, "compact");
  assert.equal(result.systemPromptProfile, "compact_v2");
  assert.equal(result.compactPromptCandidate, null);
  assert.match(result.effectivePrompt, /Gmail: lectura segura por metadata/i);
  assert.doesNotMatch(result.effectivePrompt, /Para consultar disponibilidad di algo como:/);
}

function runCustomPromptChecks(): void {
  const result = resolveEffectiveAgentPrompt({
    savedPrompt: "PROMPT CUSTOM",
    setupState: buildSetupState(),
    promptVariant: "compact",
  });

  assert.equal(result.syncMode, "custom");
  assert.equal(result.promptVariant, "full");
  assert.equal(result.systemPromptProfile, "custom_full");
  assert.equal(result.compactPromptCandidate, null);
  assert.equal(result.effectivePrompt, "PROMPT CUSTOM");
}

function runFullVariantObservabilityChecks(): void {
  const setupState = buildSetupState();
  const savedPrompt = buildRecommendedSystemPrompt(setupState, {
    salesforceUsable: true,
    gmailConfigured: true,
    gmailRuntimeAvailable: true,
  });

  const result = resolveEffectiveAgentPrompt({
    savedPrompt,
    setupState,
    promptVariant: "full",
    promptEnvironment: {
      salesforceUsable: true,
      gmailConfigured: true,
      gmailRuntimeAvailable: true,
    },
  });

  assert.equal(result.syncMode, "recommended");
  assert.equal(result.promptVariant, "full");
  assert.equal(result.systemPromptProfile, "full");
  assert.ok(result.compactPromptCandidate);
  assert.notEqual(result.compactPromptCandidate, result.effectivePrompt);
}

function runStoredSetupStateMatchChecks(): void {
  const storedSetupState = createDefaultAgentSetupState({
    integrations: ["gmail"],
  });
  storedSetupState.capabilities = ["request_handling", "integrated_reads"];
  storedSetupState.businessInstructions.objective = "Resolver pedidos por Gmail.";

  const runtimeSetupState: AgentSetupState = {
    ...storedSetupState,
    integrations: ["gmail", "google_sheets"],
  };

  const savedPrompt = buildRecommendedSystemPrompt(storedSetupState, {
    gmailConfigured: true,
    gmailRuntimeAvailable: true,
  });

  const result = resolveEffectiveAgentPrompt({
    savedPrompt,
    setupState: runtimeSetupState,
    matchSetupState: storedSetupState,
    promptVariant: "compact",
    promptEnvironment: {
      gmailConfigured: true,
      gmailRuntimeAvailable: true,
      googleSheetsConfigured: true,
      googleSheetsRuntimeAvailable: true,
    },
  });

  assert.equal(result.syncMode, "recommended");
  assert.equal(result.promptVariant, "compact");
  assert.equal(result.systemPromptProfile, "compact_v2");
}

function run(): void {
  runRecommendedVariantChecks();
  runCustomPromptChecks();
  runFullVariantObservabilityChecks();
  runStoredSetupStateMatchChecks();
  console.log("effective-prompt checks passed");
}

run();
