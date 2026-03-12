"use client";

import { AgentDocumentsPanel } from "@/components/agents/agent-documents-panel";
import { AgentSetupPanel } from "@/components/agents/agent-setup-panel";
import { AgentQaPanel } from "@/components/agents/qa/agent-qa-panel";
import type { WorkspaceTab } from "@/components/agents/agent-detail-workspace-utils";
import type { AgentSetupChecklistItemStatus, AgentSetupState, PromptBuilderTextField } from "@/lib/agents/agent-setup";
import type { Agent, AgentConnection } from "@/types/app";
import type { Tables } from "@/types/database";
import type { ReactNode } from "react";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";

type AgentDocument = Tables<"agent_documents">;

type AgentDetailWorkspaceMainProps = {
  activeTab: WorkspaceTab;
  agentId: string;
  documents: AgentDocument[];
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  whatsappIntegrationId: string | null;
  configContent: ReactNode;
  draftSetupState: AgentSetupState | null;
  savedStatus: Agent["status"];
  canEditAgent: boolean;
  canManageDocuments: boolean;
  canUploadDocuments: boolean;
  setupChatHref: string | null;
  setupChatLabel: string | null;
  hasUnsavedChanges: boolean;
  canActivate: boolean;
  baseFieldsReady: boolean;
  isActivating: boolean;
  activationError: string | null;
  onOpenKnowledge: () => void;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange: (field: PromptBuilderTextField, value: string) => void;
  onActivate: () => void;
};

export function AgentDetailWorkspaceMain({
  activeTab,
  agentId,
  documents,
  connection,
  connectionSummary,
  whatsappIntegrationId,
  configContent,
  draftSetupState,
  savedStatus,
  canEditAgent,
  canManageDocuments,
  canUploadDocuments,
  setupChatHref,
  setupChatLabel,
  hasUnsavedChanges,
  canActivate,
  baseFieldsReady,
  isActivating,
  activationError,
  onOpenKnowledge,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
  onActivate,
}: AgentDetailWorkspaceMainProps) {
  if (activeTab === "setup" && draftSetupState) {
    return (
      <AgentSetupPanel
        setupState={draftSetupState}
        agentStatus={savedStatus}
        canEdit={canEditAgent}
        canManageDocuments={canManageDocuments}
        chatHref={setupChatHref}
        chatLabel={setupChatLabel}
        baseFieldsReady={baseFieldsReady}
        hasUnsavedChanges={hasUnsavedChanges}
        canActivate={canActivate}
        isActivating={isActivating}
        activationError={activationError}
        onOpenKnowledge={onOpenKnowledge}
        onTaskDataChange={onTaskDataChange}
        onManualStatusChange={onManualStatusChange}
        onBuilderDraftChange={onBuilderDraftChange}
        onActivate={onActivate}
      />
    );
  }

  if (activeTab === "setup") {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
        <h2 className="text-lg font-bold text-slate-900">Este agente no tiene onboarding guiado</h2>
        <p className="mt-2 text-sm text-slate-600">Puedes seguir trabajando la configuracion general desde la solapa de configuracion.</p>
      </div>
    );
  }

  if (activeTab === "config") {
    return <>{configContent}</>;
  }

  if (activeTab === "knowledge") {
    return <AgentDocumentsPanel agentId={agentId} initialDocuments={documents} canUpload={canUploadDocuments} />;
  }

  if (connectionSummary.classification === "remote_managed") {
    return (
      <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-8 shadow-sm">
        <h2 className="text-lg font-bold text-amber-900">QA local no disponible para este agente conectado</h2>
        <p className="mt-2 text-sm text-amber-800">El panel QA de esta fase queda reservado para agentes locales y para agentes con WhatsApp conectado. Los agentes gestionados por OpenAI mantienen el comportamiento actual.</p>
      </div>
    );
  }

  return (
    <AgentQaPanel
      agentId={agentId}
      connection={connection}
      connectionSummary={connectionSummary}
      whatsappIntegrationId={whatsappIntegrationId}
      agentStatus={savedStatus}
    />
  );
}
