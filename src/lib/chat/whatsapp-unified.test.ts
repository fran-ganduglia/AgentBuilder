import assert from "node:assert/strict";
import {
  buildWhatsAppActivePlaybook,
  buildWhatsAppUnifiedSystemPrompt,
  prepareWhatsAppUnifiedTurn,
  resolveScopeForWhatsAppIntent,
} from "./whatsapp-unified";
import type { Agent, Conversation } from "@/types/app";

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

  assert.equal(resolveScopeForWhatsAppIntent("support"), "support");
  assert.equal(resolveScopeForWhatsAppIntent("sales"), "sales");
  assert.equal(resolveScopeForWhatsAppIntent("appointment_booking"), "operations");

  const supportScopedUnifiedAgent = {
    id: "agent-1",
    organization_id: "org-1",
    system_prompt: "BASE_PROMPT",
    llm_model: "gemini-pro",
    llm_provider: "gemini",
    llm_temperature: 0.2,
    max_tokens: 500,
    setup_state: {
      version: 1,
      template_id: "whatsapp_unified",
      workflowId: "general_operations",
      agentScope: "support",
      outOfScopePolicy: "reject_and_redirect",
      workflowTemplateId: null,
      workflowCategory: null,
      capabilities: ["request_handling"],
      businessInstructions: {
        objective: "",
        context: "",
        tasks: "",
        restrictions: "",
        handoffCriteria: "",
        outputStyle: "",
      },
      requiredIntegrations: [],
      optionalIntegrations: [],
      allowedAutomationPresets: [],
      automationPreset: null,
      instanceConfig: {
        language: "es",
        ownerLabel: "",
        routingMode: "",
        handoffThreshold: "",
        scheduleSummary: "",
        toneSummary: "",
      },
      successMetrics: [],
      areas: [],
      integrations: [],
      tool_scope_preset: "full",
      channel: "whatsapp",
      setup_status: "not_started",
      current_step: 1,
      builder_draft: {
        objective: "",
        role: "",
        audience: "",
        allowedTasks: "",
        tone: "professional",
        restrictions: "",
        humanHandoff: "",
        openingMessage: "",
        channel: "whatsapp",
      },
      task_data: {},
      checklist: [],
    },
  } as unknown as Agent;
  const whatsappConversation = {
    id: "conv-1",
    organization_id: "org-1",
    agent_id: "agent-1",
    channel: "whatsapp",
    metadata: {},
  } as unknown as Conversation;

  const outOfScopeTurn = await prepareWhatsAppUnifiedTurn({
    agent: supportScopedUnifiedAgent,
    conversation: whatsappConversation,
    organizationId: "org-1",
    latestUserMessage: "Necesito precio y una cotizacion para contratar el plan.",
    currentMetadata: {},
  });

  assert.equal(outOfScopeTurn.kind, "respond_now");
  assert.match(outOfScopeTurn.content, /fuera de su alcance/i);
  assert.match(outOfScopeTurn.content, /ventas/i);

  console.log("whatsapp-unified checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
