import { z } from "zod";
import type { Agent } from "@/types/app";
import {
  agentSetupStateSchema,
  createDefaultAgentSetupState,
  resolveSetupState,
  type AgentSetupState,
  type SetupResolutionContext,
} from "@/lib/agents/agent-setup";
import { createSetupStateForTemplate } from "@/lib/agents/agent-templates";

type ParsedSetupStateInput = z.input<typeof agentSetupStateSchema>;

export function normalizeSetupState(
  setupState: ParsedSetupStateInput,
  context: SetupResolutionContext = {}
): AgentSetupState {
  const hasExplicitAgentScope =
    typeof Reflect.get(setupState as Record<string, unknown>, "agentScope") === "string";
  const hasExplicitOutOfScopePolicy =
    typeof Reflect.get(setupState as Record<string, unknown>, "outOfScopePolicy") === "string";
  const parsedSetupState = agentSetupStateSchema.parse(setupState);
  const baseState = parsedSetupState.template_id
    ? createSetupStateForTemplate(parsedSetupState.template_id, {
      fallbackTimezone: context.fallbackTimezone,
    })
    : createDefaultAgentSetupState({
      templateId: null,
      workflowId: parsedSetupState.workflowId,
      agentScope: hasExplicitAgentScope ? parsedSetupState.agentScope : undefined,
      outOfScopePolicy: hasExplicitOutOfScopePolicy ? parsedSetupState.outOfScopePolicy : undefined,
      workflowTemplateId: parsedSetupState.workflowTemplateId,
      areas: parsedSetupState.areas,
      integrations: parsedSetupState.integrations,
      toolScopePreset: parsedSetupState.tool_scope_preset,
      channel: parsedSetupState.channel,
      currentStep: parsedSetupState.current_step,
      fallbackTimezone: context.fallbackTimezone,
    });
  const existingItems = new Map(parsedSetupState.checklist.map((item) => [item.id, item]));
  const checklist = baseState.checklist.map((item) => {
    const existing = existingItems.get(item.id);

    if (!existing) {
      return item;
    }

    return {
      ...item,
      status: existing.status,
    };
  });

  return resolveSetupState(
    {
      ...baseState,
      template_id: parsedSetupState.template_id,
      workflowId: parsedSetupState.workflowId,
      agentScope: hasExplicitAgentScope ? parsedSetupState.agentScope : baseState.agentScope,
      outOfScopePolicy: hasExplicitOutOfScopePolicy
        ? parsedSetupState.outOfScopePolicy
        : baseState.outOfScopePolicy,
      workflowTemplateId: parsedSetupState.workflowTemplateId,
      workflowCategory: parsedSetupState.workflowCategory,
      capabilities: parsedSetupState.capabilities,
      businessInstructions: parsedSetupState.businessInstructions,
      requiredIntegrations: parsedSetupState.requiredIntegrations,
      optionalIntegrations: parsedSetupState.optionalIntegrations,
      allowedAutomationPresets: parsedSetupState.allowedAutomationPresets,
      automationPreset: parsedSetupState.automationPreset,
      instanceConfig: parsedSetupState.instanceConfig,
      successMetrics: parsedSetupState.successMetrics,
      areas: parsedSetupState.areas,
      integrations: parsedSetupState.integrations,
      tool_scope_preset: parsedSetupState.tool_scope_preset,
      channel: parsedSetupState.channel,
      current_step: parsedSetupState.current_step,
      builder_draft: parsedSetupState.builder_draft
        ? { ...baseState.builder_draft, ...parsedSetupState.builder_draft, channel: parsedSetupState.channel }
        : baseState.builder_draft,
      task_data: parsedSetupState.task_data ?? baseState.task_data,
      checklist,
    },
    context
  );
}

export function parseAgentSetupState(
  value: unknown,
  context: SetupResolutionContext = {}
): AgentSetupState | null {
  const parsed = agentSetupStateSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return normalizeSetupState(parsed.data, context);
}

export function readAgentSetupState(
  agent: Agent,
  context: SetupResolutionContext = {}
): AgentSetupState | null {
  const rawValue = Reflect.get(agent as Record<string, unknown>, "setup_state");
  return parseAgentSetupState(rawValue, context);
}

export function isWhatsAppChannelAgent(
  agent: Agent,
  context: SetupResolutionContext = {}
): boolean {
  const setupState = readAgentSetupState(agent, context);
  if (!setupState) {
    return false;
  }

  return setupState.channel === "whatsapp" || setupState.integrations.includes("whatsapp");
}
