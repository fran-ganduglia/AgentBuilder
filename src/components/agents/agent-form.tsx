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
  connection,
  connectionSummary,
  setupState,
  recommendedPrompt,
  promptSyncMode = "custom",
  userRole = "admin",
  onChange,
}: AgentFormProps) {
  const promptWords = fields.systemPrompt.trim() ? fields.systemPrompt.trim().split(/\s+/).length : 0;
  const promptLines = fields.systemPrompt ? fields.systemPrompt.split(/\r?\n/).length : 0;
  const isRemoteManaged = connectionSummary?.classification === "remote_managed";
  const canEditRemoteManagedFields = !isRemoteManaged || userRole === "admin";

  return (
    <div className="space-y-6">
      {connection && isRemoteManaged && !canEditRemoteManagedFields ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Este agente esta sincronizado con OpenAI. Como editor puedes cambiar el estado local, pero los campos remotos solo los puede modificar un administrador.
          </p>
        </div>
      ) : null}

      <AgentIdentitySection
        fields={fields}
        errors={errors}
        onChange={onChange}
        disabled={!canEditRemoteManagedFields}
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
        disabled={!canEditRemoteManagedFields}
      />
      <AgentEngineSection
        fields={fields}
        errors={errors}
        onChange={onChange}
        disabled={!canEditRemoteManagedFields}
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
