import type { AgentScope } from "@/lib/agents/agent-scope";

export type ChatQuickActionProvider =
  | "salesforce"
  | "gmail"
  | "google_calendar"
  | "google_sheets"
  | "whatsapp";

export type ChatQuickActionSection =
  | "assistant"
  | "crm_shortcuts"
  | "template_playbook";

export type ChatQuickAction = {
  id: string;
  provider: ChatQuickActionProvider;
  section: ChatQuickActionSection;
  label: string;
  prompt: string;
  priority: number;
  action?: string;
};

export type ResolvedChatQuickActions = {
  hasConnectedIntegrations: boolean;
  agentScope: AgentScope | null;
  providers: ChatQuickActionProvider[];
  isRuntimeUsable: boolean;
  assistance: ChatQuickAction[];
  crmShortcuts: ChatQuickAction[];
  templatePlaybook: ChatQuickAction[];
};

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function dedupeByPrompt(actions: readonly ChatQuickAction[]): ChatQuickAction[] {
  const seen = new Set<string>();
  const deduped: ChatQuickAction[] = [];

  for (const action of actions) {
    const normalizedPrompt = normalizePrompt(action.prompt);
    if (seen.has(normalizedPrompt)) {
      continue;
    }

    seen.add(normalizedPrompt);
    deduped.push(action);
  }

  return deduped;
}

export function createEmptyQuickActions(): ResolvedChatQuickActions {
  return {
    hasConnectedIntegrations: false,
    agentScope: null,
    providers: [],
    isRuntimeUsable: false,
    assistance: [],
    crmShortcuts: [],
    templatePlaybook: [],
  };
}

export function getChatEmptyStateQuickActions(
  quickActions: ResolvedChatQuickActions
): ChatQuickAction[] {
  if (!quickActions.hasConnectedIntegrations) {
    return [];
  }

  return quickActions.templatePlaybook.length > 0
    ? quickActions.templatePlaybook
    : quickActions.assistance;
}

export function resolveInlineFallbackQuickActions(
  quickActions: ResolvedChatQuickActions
): ChatQuickAction[] {
  if (!quickActions.hasConnectedIntegrations) {
    return [];
  }

  const prioritized = [
    quickActions.assistance.find(
      (action) =>
        action.id.includes(":assistant:next-step") ||
        action.label.toLowerCase().includes("siguiente paso")
    ),
    quickActions.templatePlaybook[0],
    quickActions.crmShortcuts[0],
  ].filter((action): action is ChatQuickAction => Boolean(action));

  return dedupeByPrompt(prioritized).slice(0, 3);
}
