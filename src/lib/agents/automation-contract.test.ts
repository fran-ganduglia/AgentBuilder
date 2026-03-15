import assert from "node:assert/strict";
import {
  buildAutomationPrompt,
  classifyAutomationScope,
  readAutomationInstructionFields,
  shouldBlockAutomationForScope,
} from "./automation-contract";

function run(): void {
  assert.match(
    buildAutomationPrompt({
      instruction: "Revisa el pipeline y prepara un resumen.",
      expectedOutput: "Lista priorizada con proximos pasos.",
      deliveryTarget: "chat interno",
      approvalMode: "writes_require_approval",
    }),
    /approval inbox/i
  );

  assert.deepEqual(
    readAutomationInstructionFields({
      instruction: "Responder reclamos urgentes.",
      expected_output: "Resumen corto.",
      delivery_target: "chat de soporte",
      approval_mode: "writes_require_approval",
    }),
    {
      instruction: "Responder reclamos urgentes.",
      expectedOutput: "Resumen corto.",
      deliveryTarget: "chat de soporte",
      approvalMode: "writes_require_approval",
    }
  );

  assert.deepEqual(
    classifyAutomationScope({
      agentScope: "support",
      name: "Resumen de tickets",
      instruction: "Revisa reclamos e incidentes pendientes y deja proximo paso.",
      expectedOutput: "Resumen de soporte",
      deliveryTarget: "chat interno",
    }),
    { decision: "in_scope" }
  );

  assert.deepEqual(
    classifyAutomationScope({
      agentScope: "support",
      name: "Follow-up comercial",
      instruction: "Preparar propuesta y seguimiento para leads del pipeline.",
      expectedOutput: "Borrador comercial",
      deliveryTarget: "email",
    }),
    { decision: "out_of_scope", targetScope: "sales" }
  );

  assert.deepEqual(
    classifyAutomationScope({
      agentScope: "operations",
      name: "Seguimiento general",
      instruction: "Revisar ticket abierto y pipeline comercial en paralelo.",
      expectedOutput: "Informe cruzado",
      deliveryTarget: "email",
    }),
    { decision: "ambiguous", targetScope: "support" }
  );

  assert.deepEqual(
    shouldBlockAutomationForScope({ decision: "in_scope" }),
    { blocked: false }
  );

  assert.deepEqual(
    shouldBlockAutomationForScope({
      decision: "ambiguous",
      targetScope: "support",
    }),
    {
      blocked: true,
      reason: "ambiguous",
      message:
        "La automatizacion no deja claro si pertenece al scope de este agente. Ajusta la instruccion para que quede explicitamente dentro de soporte, ventas u operaciones antes de guardarla.",
    }
  );
}

run();
