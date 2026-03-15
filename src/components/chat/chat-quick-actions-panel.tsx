"use client";

import { useState } from "react";
import {
  AGENT_SCOPE_LABELS,
  type AgentScope,
} from "@/lib/agents/agent-scope";
import type {
  ChatQuickAction,
  ResolvedChatQuickActions,
} from "@/lib/chat/quick-actions";

type ChatQuickActionsPanelProps = {
  quickActions: ResolvedChatQuickActions;
  isLoading: boolean;
  onActionSelect: (prompt: string) => void;
};

type AccordionSectionProps = {
  title: string;
  actions: ChatQuickAction[];
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onActionSelect: (prompt: string) => void;
};

function AccordionSection({
  title,
  actions,
  isLoading,
  isExpanded,
  onToggle,
  onActionSelect,
}: AccordionSectionProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-1 py-3 text-left"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {title}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isExpanded ? (
        <div className="flex flex-col gap-2 pb-3">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={isLoading}
              onClick={() => onActionSelect(action.prompt)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getScopeNoun(agentScope: AgentScope | null): string {
  if (!agentScope) {
    return "del agente";
  }

  return `de ${AGENT_SCOPE_LABELS[agentScope].toLowerCase()}`;
}

function groupActionsByProvider(
  quickActions: ResolvedChatQuickActions
): { title: string; actions: ChatQuickAction[] }[] {
  const providerLabels: Record<string, string> = {
    salesforce: "CRM (Salesforce)",
    gmail: "Email (Gmail)",
    google_calendar: "Calendario",
    whatsapp: "WhatsApp",
  };

  const groups = new Map<string, ChatQuickAction[]>();

  const allActions = [
    ...quickActions.crmShortcuts,
    ...quickActions.templatePlaybook,
  ];

  for (const action of allActions) {
    const key = action.provider;
    const existing = groups.get(key) ?? [];
    existing.push(action);
    groups.set(key, existing);
  }

  if (quickActions.assistance.length > 0) {
    groups.set("_assistance", quickActions.assistance);
  }

  const sections: { title: string; actions: ChatQuickAction[] }[] = [];

  for (const [key, actions] of groups) {
    if (key === "_assistance") {
      sections.push({ title: "Asistencia rapida", actions });
    } else {
      sections.push({
        title: providerLabels[key] ?? key,
        actions,
      });
    }
  }

  return sections;
}

export function ChatQuickActionsPanel({
  quickActions,
  isLoading,
  onActionSelect,
}: ChatQuickActionsPanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number>(0);

  if (!quickActions.hasConnectedIntegrations) {
    return null;
  }

  const sections = groupActionsByProvider(quickActions);
  const scopeNoun = getScopeNoun(quickActions.agentScope);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm backdrop-blur">
      <div className="border-b border-slate-200 pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Acciones sugeridas
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Atajos guiados {scopeNoun} que reutilizan el flujo actual del chat.
        </p>
      </div>

      <div className="mt-1">
        {sections.map((section, index) => (
          <AccordionSection
            key={section.title}
            title={section.title}
            actions={section.actions}
            isLoading={isLoading}
            isExpanded={expandedIndex === index}
            onToggle={() =>
              setExpandedIndex((current) =>
                current === index ? -1 : index
              )
            }
            onActionSelect={onActionSelect}
          />
        ))}
      </div>
    </div>
  );
}
