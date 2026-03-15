import {
  AGENT_STATUSES,
  agentFormSchema,
  type AgentFormErrors,
  type AgentFormFields,
} from "@/components/agents/agent-form-shared";
import type { Agent } from "@/types/app";
import type { AgentSetupState } from "@/lib/agents/agent-setup";

export type WorkspaceTab = "setup" | "config" | "knowledge" | "qa" | "automations";

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  setup: "Setup",
  config: "Configuracion",
  knowledge: "Base de conocimiento",
  qa: "QA",
  automations: "Automatizaciones",
};

export function cloneSetupState(setupState: AgentSetupState | null): AgentSetupState | null {
  return setupState ? (JSON.parse(JSON.stringify(setupState)) as AgentSetupState) : null;
}

export function getClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getStatusLabel(status: Agent["status"]): string {
  return AGENT_STATUSES.find((option) => option.value === status)?.label ?? status;
}

export function getFieldErrors(fields: AgentFormFields): AgentFormErrors {
  const parsed = agentFormSchema.safeParse({
    ...fields,
    description: fields.description || undefined,
  });

  if (parsed.success) {
    return {};
  }

  const nextErrors: AgentFormErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof AgentFormErrors | undefined;
    if (key && !nextErrors[key]) {
      nextErrors[key] = issue.message;
    }
  }

  return nextErrors;
}

export function resolveInitialWorkspaceTab(initialTab: WorkspaceTab, status: Agent["status"]): WorkspaceTab {
  if (initialTab === "qa" && status !== "active") {
    return "setup";
  }

  return initialTab;
}