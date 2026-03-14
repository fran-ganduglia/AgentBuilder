import assert from "node:assert/strict";
import {
  buildWhatsAppActivePlaybook,
  buildWhatsAppUnifiedSystemPrompt,
} from "./whatsapp-unified";

async function run(): Promise<void> {
  const supportPlaybook = buildWhatsAppActivePlaybook("support");
  assert.match(supportPlaybook, /Soporte/i);
  assert.doesNotMatch(supportPlaybook, /Ventas por WhatsApp/i);
  assert.doesNotMatch(supportPlaybook, /Reserva de turnos/i);

  const salesPlaybook = buildWhatsAppActivePlaybook("sales");
  assert.match(salesPlaybook, /Ventas/i);
  assert.doesNotMatch(salesPlaybook, /Soporte por WhatsApp/i);
  assert.doesNotMatch(salesPlaybook, /Recordatorios/i);

  const supportPrompt = buildWhatsAppUnifiedSystemPrompt("BASE_PROMPT", "support");
  assert.match(supportPrompt, /BASE_PROMPT/);
  assert.match(supportPrompt, /PLAYBOOK_ACTIVO/);
  assert.match(supportPrompt, /Soporte/i);
  assert.doesNotMatch(supportPrompt, /Ventas por WhatsApp/i);
  assert.doesNotMatch(supportPrompt, /Reserva de turnos/i);
  assert.doesNotMatch(supportPrompt, /Reminder/i);

  const bookingPrompt = buildWhatsAppUnifiedSystemPrompt("BASE_PROMPT", "appointment_booking");
  assert.match(bookingPrompt, /turno/i);
  assert.doesNotMatch(bookingPrompt, /Ventas por WhatsApp/i);
  assert.doesNotMatch(bookingPrompt, /Soporte por WhatsApp/i);

  console.log("whatsapp-unified checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
