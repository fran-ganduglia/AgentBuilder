import assert from "node:assert/strict";
import {
  classifyWhatsAppIntentHeuristically,
  resolveWhatsAppIntentRoute,
} from "./whatsapp-intent-router";

async function run(): Promise<void> {
  assert.equal(
    classifyWhatsAppIntentHeuristically("Hola, necesito ayuda porque mi pedido no funciona")?.intent,
    "support"
  );
  assert.equal(
    classifyWhatsAppIntentHeuristically("Quiero precio y una demo del plan")?.intent,
    "sales"
  );
  assert.equal(
    classifyWhatsAppIntentHeuristically("Necesito reprogramar mi turno para manana")?.intent,
    "appointment_booking"
  );
  assert.equal(
    classifyWhatsAppIntentHeuristically("Hagamos seguimiento del recordatorio pendiente")?.intent,
    "reminder_follow_up"
  );

  assert.equal(
    classifyWhatsAppIntentHeuristically("Hola, me ayudas con informacion y precios")?.intent ?? null,
    null
  );

  const ambiguousWithoutIntent = resolveWhatsAppIntentRoute({
    currentActiveIntent: null,
    heuristic: null,
  });
  assert.deepEqual(ambiguousWithoutIntent, {
    activeIntent: null,
    confidence: null,
    source: "heuristic",
    needsClarification: true,
    shouldReplyWithMenu: true,
    switchedIntent: false,
  });

  const strongSwitch = resolveWhatsAppIntentRoute({
    currentActiveIntent: "sales",
    heuristic: {
      intent: "support",
      confidence: 0.92,
      source: "heuristic",
      strongSignal: true,
      matchedSignals: ["ayuda", "error"],
    },
  });
  assert.deepEqual(strongSwitch, {
    activeIntent: "support",
    confidence: 0.92,
    source: "heuristic",
    needsClarification: false,
    shouldReplyWithMenu: false,
    switchedIntent: true,
  });

  const weakConflictingSignal = resolveWhatsAppIntentRoute({
    currentActiveIntent: "sales",
    heuristic: {
      intent: "support",
      confidence: 0.68,
      source: "heuristic",
      strongSignal: false,
      matchedSignals: ["ayuda"],
    },
  });
  assert.deepEqual(weakConflictingSignal, {
    activeIntent: "sales",
    confidence: 0.68,
    source: "heuristic",
    needsClarification: true,
    shouldReplyWithMenu: true,
    switchedIntent: false,
  });

  const carryover = resolveWhatsAppIntentRoute({
    currentActiveIntent: "support",
    heuristic: null,
  });
  assert.deepEqual(carryover, {
    activeIntent: "support",
    confidence: null,
    source: "carryover",
    needsClarification: false,
    shouldReplyWithMenu: false,
    switchedIntent: false,
  });

  console.log("whatsapp-intent-router checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
