import assert from "node:assert/strict";
import {
  assertScopeAllowsSensitiveAction,
  buildOutOfScopeResponse,
  classifyScopeIntent,
  deriveAgentScope,
} from "./agent-scope";
import { inferScopeFromWorkflowAction } from "../workflows/action-matrix";

function run(): void {
  assert.equal(
    deriveAgentScope({ templateId: "gmail_inbox_assistant" }),
    "support"
  );
  assert.equal(
    deriveAgentScope({ templateId: "salesforce_lead_qualification" }),
    "sales"
  );
  assert.equal(
    deriveAgentScope({ workflowTemplateId: "advanced_builder" }),
    "operations"
  );

  assert.deepEqual(
    classifyScopeIntent({
      content: "Necesito hacer follow-up comercial a este lead y preparar una propuesta.",
      agentScope: "sales",
    }),
    { decision: "in_scope" }
  );

  assert.deepEqual(
    classifyScopeIntent({
      content: "Tengo un reclamo y un incidente con el pedido del cliente.",
      agentScope: "sales",
    }),
    { decision: "out_of_scope", targetScope: "support" }
  );

  assert.deepEqual(
    classifyScopeIntent({
      content: "Necesito un resumen y tambien una propuesta para el pipeline.",
      agentScope: "operations",
    }),
    { decision: "out_of_scope", targetScope: "sales" }
  );

  assert.match(
    buildOutOfScopeResponse({ agentScope: "support", targetScope: "sales" }),
    /fuera de su alcance/i
  );

  assert.deepEqual(
    assertScopeAllowsSensitiveAction({
      agentScope: "support",
      provider: "salesforce",
      action: "create_lead",
      summary: "Crear lead nuevo para ACME",
    }),
    {
      ok: false,
      targetScope: "sales",
      message:
        "Este agente es de soporte y este pedido queda fuera de su alcance. Conviene derivarlo a ventas o a una persona responsable antes de seguir.",
    }
  );

  assert.deepEqual(
    assertScopeAllowsSensitiveAction({
      agentScope: "support",
      provider: "salesforce",
      action: "create_case",
      summary: "Crear caso por reclamo de facturacion",
    }),
    { ok: true }
  );

  assert.deepEqual(
    assertScopeAllowsSensitiveAction({
      agentScope: "support",
      provider: "gmail",
      action: "create_draft_reply",
      summary: "Crear borrador de follow-up comercial para este lead con propuesta.",
    }),
    {
      ok: false,
      targetScope: "sales",
      message:
        "Este agente es de soporte y este pedido queda fuera de su alcance. Conviene derivarlo a ventas o a una persona responsable antes de seguir.",
    }
  );

  assert.deepEqual(
    assertScopeAllowsSensitiveAction({
      agentScope: "sales",
      provider: "google_calendar",
      action: "create_event",
      summary: "Crear reunion interna de operaciones para aprobacion del reporte semanal.",
    }),
    {
      ok: false,
      targetScope: "operations",
      message:
        "Este agente es de ventas y este pedido queda fuera de su alcance. Conviene derivarlo a operaciones o a una persona responsable antes de seguir.",
    }
  );

  assert.deepEqual(
    assertScopeAllowsSensitiveAction({
      agentScope: "operations",
      provider: "google_calendar",
      action: "cancel_event",
      summary: "Cancelar comite interno de aprobacion con el equipo de operaciones.",
    }),
    { ok: true }
  );

  assert.equal(
    inferScopeFromWorkflowAction({
      provider: "salesforce",
      action: "create_case",
      summary: "Crear caso por reclamo de facturacion",
    }),
    "support"
  );

  assert.equal(
    inferScopeFromWorkflowAction({
      provider: "gmail",
      action: "apply_label",
      summary: "Aplicar label al lead estancado del pipeline comercial",
    }),
    "sales"
  );

  assert.equal(
    inferScopeFromWorkflowAction({
      provider: "google_calendar",
      action: "cancel_event",
      summary: "Cancelar comite interno de aprobacion con el equipo",
    }),
    "operations"
  );

  console.log("agent-scope checks passed");
}

run();
