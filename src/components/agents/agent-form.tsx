"use client";

import { AgentBehaviorSection, AgentEngineSection, AgentIdentitySection, AgentStateSection } from "@/components/agents/agent-form-sections";
import type { AgentFormErrors, AgentFormFields } from "@/components/agents/agent-form-shared";
import type { AgentConnection, Role } from "@/types/app";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";
import type { AgentSetupState } from "@/lib/agents/agent-setup";
import type { PromptSyncMode } from "@/lib/agents/agent-templates";

type AgentFormProps = {
  fields: AgentFormFields;
  errors: AgentFormErrors;
  connection?: AgentConnection | null;
  connectionSummary?: AgentConnectionSummary | null;
  setupState?: AgentSetupState | null;
  recommendedPrompt?: string;
  promptSyncMode?: PromptSyncMode;
  userRole?: Role;
  onChange: <K extends keyof AgentFormFields>(field: K, value: AgentFormFields[K]) => void;
};

export function AgentForm({
  fields,
  errors,
  connection: _connection,
  connectionSummary: _connectionSummary,
  setupState,
  recommendedPrompt,
  promptSyncMode = "custom",
  userRole: _userRole = "admin",
  onChange,
}: AgentFormProps) {
  void _connection;
  void _connectionSummary;
  void _userRole;
  const promptWords = fields.systemPrompt.trim() ? fields.systemPrompt.trim().split(/\s+/).length : 0;
  const promptLines = fields.systemPrompt ? fields.systemPrompt.split(/\r?\n/).length : 0;
  return (
    <div className="space-y-6">
      <AgentIdentitySection
        fields={fields}
        errors={errors}
        onChange={onChange}
        disabled={false}
      />
      <AgentBehaviorSection
        fields={fields}
        errors={errors}
        promptWords={promptWords}
        promptLines={promptLines}
        setupState={setupState ?? null}
        recommendedPrompt={recommendedPrompt ?? fields.systemPrompt}
        promptSyncMode={promptSyncMode}
        onChange={onChange}
        disabled={false}
      />
      <AgentEngineSection
        fields={fields}
        errors={errors}
        onChange={onChange}
        disabled={false}
      />
      <AgentStateSection
        fields={fields}
        isEditing
        canCreateConnectedAgent={false}
        availableIntegrations={[]}
        onChange={onChange}
      />
    </div>
  );
}
