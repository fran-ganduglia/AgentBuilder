import { z } from "zod";
import type { Agent } from "@/types/app";
import {
  agentSetupStateSchema,
  resolveSetupState,
  type AgentSetupState,
  type SetupResolutionContext,
} from "@/lib/agents/agent-setup";
import { createSetupStateForTemplate } from "@/lib/agents/agent-templates";

type ParsedSetupState = z.infer<typeof agentSetupStateSchema>;

export function normalizeSetupState(
  setupState: ParsedSetupState,
  context: SetupResolutionContext = {}
): AgentSetupState {
  const baseState = createSetupStateForTemplate(setupState.template_id, {
    fallbackTimezone: context.fallbackTimezone,
  });
  const existingItems = new Map(setupState.checklist.map((item) => [item.id, item]));
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
      channel: setupState.channel,
      current_step: setupState.current_step,
      builder_draft: setupState.builder_draft
        ? { ...baseState.builder_draft, ...setupState.builder_draft, channel: setupState.channel }
        : baseState.builder_draft,
      task_data: setupState.task_data ?? baseState.task_data,
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
  return readAgentSetupState(agent, context)?.channel === "whatsapp";
}