import assert from "node:assert/strict";

import {
  buildPendingChatFormFromRuntimeClarification,
  buildRuntimeClarificationSpec,
} from "./runtime-clarification";

function runRecipientCandidatesSelectTest(): void {
  const form = buildPendingChatFormFromRuntimeClarification({
    spec: {
      clarificationId: "clarify-1",
      source: "runtime",
      actionType: "send_email",
      actionId: "action-1",
      runtimeRunId: "11111111-1111-1111-1111-111111111111",
      requiredFields: ["to"],
      optionalFields: [],
      knownParams: {},
      candidateOptionsByField: {
        to: [
          {
            value: "ana@empresa.com",
            label: "Ana Gomez (ana@empresa.com)",
          },
        ],
      },
      resumeMode: "resume_checkpoint",
      createdAt: "2026-03-18T00:00:00.000Z",
    },
    message: "Necesito el email exacto del destinatario para continuar.",
  });

  assert.ok(form);
  assert.equal(form?.kind, "dynamic_form");
  assert.equal(form?.definition.fields[0]?.key, "to");
  assert.equal(form?.definition.fields[0]?.type, "select");
}

function runRecipientFreeTextFallbackTest(): void {
  const form = buildPendingChatFormFromRuntimeClarification({
    spec: {
      clarificationId: "clarify-2",
      source: "runtime",
      actionType: "send_email",
      actionId: "action-2",
      runtimeRunId: "22222222-2222-2222-2222-222222222222",
      requiredFields: ["to"],
      optionalFields: [],
      knownParams: {},
      candidateOptionsByField: {},
      resumeMode: "resume_checkpoint",
      createdAt: "2026-03-18T00:00:00.000Z",
    },
    message: "Necesito el email exacto del destinatario para continuar.",
  });

  assert.ok(form);
  assert.equal(form?.definition.fields[0]?.type, "textarea");
}

function runPlannerDraftWithActionTypeTest(): void {
  // Main path: plannerDraft has action with type — used directly, no heuristic
  const spec = buildRuntimeClarificationSpec({
    source: "planner",
    plannerDraftPlan: {
      version: 1,
      intent: "enviar email",
      actions: [
        {
          id: "action-1",
          type: "send_email",
          params: {
            to: { kind: "unknown", reason: "falta destinatario" },
          },
          approvalMode: "required",
        },
      ],
      confidence: 0.3,
      missingFields: ["to"],
    },
    plannerMissingFields: ["to"],
  });

  assert.ok(spec);
  assert.equal(spec?.actionType, "send_email");
  assert.equal(spec?.resumeMode, "start_from_draft");
  assert.deepEqual(spec?.requiredFields, ["to"]);
}

function runPlannerFallbackSynthesizesDraftTest(): void {
  // Fallback: plannerDraft has no actions — synthesize from intent (safety net)
  const spec = buildRuntimeClarificationSpec({
    source: "planner",
    plannerDraftPlan: {
      version: 1,
      intent: "enviar email",
      actions: [],
      confidence: 0.3,
      missingFields: ["to"],
    },
    plannerMissingFields: ["to"],
  });

  assert.ok(spec);
  assert.equal(spec?.actionType, "send_email");
  assert.equal(spec?.resumeMode, "start_from_draft");
}

function runPlannerReunionSynthesizesCreateEventTest(): void {
  // Caso exacto: el usuario dice "reunión" en vez de "evento"
  const spec = buildRuntimeClarificationSpec({
    source: "planner",
    plannerDraftPlan: {
      version: 1,
      intent: "agendar reunión para mañana",
      actions: [],
      confidence: 0.35,
      missingFields: ["title", "start", "end"],
    },
    plannerMissingFields: ["title", "start", "end"],
  });

  assert.ok(spec, "debe generar spec aunque el intent use 'reunión' en vez de 'evento'");
  assert.equal(spec?.actionType, "create_event");
  assert.deepEqual(spec?.requiredFields, ["title", "start", "end"]);
  assert.equal(spec?.resumeMode, "start_from_draft");
}

function runPlannerAliasStartTimeNormalizationTest(): void {
  // El planner usa start_time/end_time — deben normalizarse a start/end
  const spec = buildRuntimeClarificationSpec({
    source: "planner",
    plannerDraftPlan: {
      version: 1,
      intent: "crear evento",
      actions: [],
      confidence: 0.4,
      missingFields: ["start_time", "end_time"],
    },
    plannerMissingFields: ["start_time", "end_time"],
  });

  assert.ok(spec, "debe generar spec con campos normalizados");
  assert.equal(spec?.actionType, "create_event");
  assert.deepEqual(spec?.requiredFields, ["start", "end"]);
}

function main(): void {
  runRecipientCandidatesSelectTest();
  runRecipientFreeTextFallbackTest();
  runPlannerDraftWithActionTypeTest();
  runPlannerFallbackSynthesizesDraftTest();
  runPlannerReunionSynthesizesCreateEventTest();
  runPlannerAliasStartTimeNormalizationTest();
  console.log("runtime clarification checks passed");
}

main();
