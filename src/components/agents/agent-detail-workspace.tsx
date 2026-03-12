"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentDetailConfigPanel } from "@/components/agents/agent-detail-config-panel";
import { AgentWorkspaceSaveRail } from "@/components/agents/agent-form-summary";
import {
  createInitialFields,
  hasFieldChanges,
  type AgentFormErrors,
  type AgentFormFields,
} from "@/components/agents/agent-form-shared";
import { AgentDetailWorkspaceHeader } from "@/components/agents/agent-detail-workspace-header";
import { AgentDetailWorkspaceMain } from "@/components/agents/agent-detail-workspace-main";
import {
  cloneSetupState,
  getClientTimeZone,
  getFieldErrors,
  getStatusLabel,
  resolveInitialWorkspaceTab,
  TAB_LABELS,
  type WorkspaceTab,
} from "@/components/agents/agent-detail-workspace-utils";
import { getActivationReadiness, mergeSetupProgress, type AgentSetupState } from "@/lib/agents/agent-setup";
import {
  buildRecommendedSystemPrompt,
  detectPromptSyncMode,
  syncSystemPromptWithSetup,
  type PromptSyncMode,
} from "@/lib/agents/agent-templates";
import {
  canAccessQaPanel,
  canUseSandboxForConnection,
  isChannelConnectedAgent,
  type AgentConnectionSummary,
} from "@/lib/agents/connection-policy";
import { consumeQaDraftProposal, saveChatPreviewSession } from "@/lib/chat/session-draft";
import type { Agent, AgentConnection, Role } from "@/types/app";
import type { Tables } from "@/types/database";

type AgentDocument = Tables<"agent_documents">;

type AgentDetailWorkspaceProps = {
  agent: Agent;
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  documents: AgentDocument[];
  setupState: AgentSetupState | null;
  userRole: Role;
  canEditAgent: boolean;
  canManageDocuments: boolean;
  canChat: boolean;
  initialTab: WorkspaceTab;
  whatsappIntegrationId: string | null;
  salesforceIntegrationNotice: {
    title: string;
    message: string;
    tone: "emerald" | "amber" | "rose" | "slate";
    href: string;
    label: string;
  } | null;
};

function replaceProposalUrl(tab: WorkspaceTab): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("tab", tab);
  nextUrl.searchParams.delete("proposal");
  window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

function assignCurrentAgentUrl(tab: WorkspaceTab): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("tab", tab);
  nextUrl.searchParams.delete("proposal");
  window.location.assign(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

export function AgentDetailWorkspace({
  agent,
  connection,
  connectionSummary,
  documents,
  setupState,
  userRole,
  canEditAgent,
  canManageDocuments,
  canChat,
  initialTab,
  whatsappIntegrationId,
  salesforceIntegrationNotice,
}: AgentDetailWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalConsumedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    resolveInitialWorkspaceTab(initialTab, agent.status)
  );
  const [fields, setFields] = useState<AgentFormFields>(() => createInitialFields(agent));
  const [savedFields, setSavedFields] = useState<AgentFormFields>(() => createInitialFields(agent));
  const [draftSetupState, setDraftSetupState] = useState<AgentSetupState | null>(() => cloneSetupState(setupState));
  const [savedSetupState, setSavedSetupState] = useState<AgentSetupState | null>(() => cloneSetupState(setupState));
  const [errors, setErrors] = useState<AgentFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [qaProposalSummary, setQaProposalSummary] = useState<string | null>(null);
  const [qaRecommendations, setQaRecommendations] = useState<string[]>([]);
  const [promptSyncMode, setPromptSyncMode] = useState<PromptSyncMode>(() =>
    setupState ? detectPromptSyncMode(agent.system_prompt, setupState) : "custom"
  );

  const recommendedPrompt = useMemo(
    () => (draftSetupState ? buildRecommendedSystemPrompt(draftSetupState) : fields.systemPrompt),
    [draftSetupState, fields.systemPrompt]
  );
  const hasConfigChanges = hasFieldChanges(fields, savedFields);
  const hasSetupChanges = JSON.stringify(draftSetupState) !== JSON.stringify(savedSetupState);
  const hasUnsavedChanges = hasConfigChanges || hasSetupChanges;
  const changedTabs = [...(hasSetupChanges ? ["Setup"] : []), ...(hasConfigChanges ? ["Configuracion"] : [])];
  const promptWords = fields.systemPrompt.trim() ? fields.systemPrompt.trim().split(/\s+/).length : 0;
  const promptLines = fields.systemPrompt ? fields.systemPrompt.split(/\r?\n/).length : 0;
  const readiness = getActivationReadiness({
    name: fields.name,
    systemPrompt: fields.systemPrompt,
    llmModel: fields.llmModel,
    llmTemperature: fields.llmTemperature,
    setupState: draftSetupState,
  });
  const canUseSandbox = canEditAgent && canUseSandboxForConnection(connectionSummary);
  const setupChatHref = canChat ? `/agents/${agent.id}/chat` : canUseSandbox ? `/agents/${agent.id}/chat?chatMode=sandbox` : null;
  const setupChatLabel = canChat
    ? "Probar chat operativo"
    : canUseSandbox
      ? "Abrir sandbox"
      : null;
  const canShowQaTab =
    connectionSummary.classification !== "remote_managed" &&
    canAccessQaPanel(connectionSummary, savedFields.status);
  const canOpenQa = isChannelConnectedAgent(connectionSummary) && canShowQaTab;
  const hasRecommendedPromptUpdate =
    Boolean(draftSetupState) &&
    promptSyncMode === "custom" &&
    fields.systemPrompt.trim() !== recommendedPrompt.trim();
  const tabs: WorkspaceTab[] = canShowQaTab ? ["setup", "config", "knowledge", "qa"] : ["setup", "config", "knowledge"];

  useEffect(() => {
    if (proposalConsumedRef.current || searchParams.get("proposal") !== "1") {
      return;
    }

    proposalConsumedRef.current = true;
    const proposal = consumeQaDraftProposal(agent.id);
    if (!proposal) {
      return;
    }

    setFields((current) => ({ ...current, systemPrompt: proposal.suggestedSystemPrompt }));
    setQaProposalSummary(proposal.summary);
    setQaRecommendations(proposal.recommendations);
    setPromptSyncMode(
      draftSetupState && detectPromptSyncMode(proposal.suggestedSystemPrompt, draftSetupState) === "recommended"
        ? "recommended"
        : "custom"
    );
    setSubmitError(null);
    setSuccessMessage(null);
    setActiveTab("config");

    if (typeof window !== "undefined") {
      replaceProposalUrl("config");
    }
  }, [agent.id, draftSetupState, searchParams]);

  function clearFeedback() {
    setSubmitError(null);
    setSuccessMessage(null);
    setActivationError(null);
  }

  function handleFieldChange<K extends keyof AgentFormFields>(field: K, value: AgentFormFields[K]) {
    if (!canEditAgent) {
      return;
    }

    clearFeedback();
    setFields((current) => ({ ...current, [field]: value }));

    if (field === "systemPrompt") {
      setPromptSyncMode(
        draftSetupState && detectPromptSyncMode(String(value), draftSetupState) === "recommended"
          ? "recommended"
          : "custom"
      );
    }
  }

  function applySetupStateChange(
    updater: (setup: AgentSetupState, fallbackTimezone: string) => AgentSetupState
  ) {
    if (!canEditAgent) {
      return;
    }

    clearFeedback();
    const fallbackTimezone = getClientTimeZone();

    setDraftSetupState((currentSetupState) => {
      if (!currentSetupState) {
        return currentSetupState;
      }

      const nextSetupState = updater(currentSetupState, fallbackTimezone);
      setFields((currentFields) => {
        const nextPrompt = syncSystemPromptWithSetup(
          currentFields.systemPrompt,
          currentSetupState,
          nextSetupState
        );
        setPromptSyncMode(detectPromptSyncMode(nextPrompt, nextSetupState));
        return { ...currentFields, systemPrompt: nextPrompt };
      });

      return nextSetupState;
    });
  }

  async function persistAgent(statusOverride?: Agent["status"]) {
    if (!canEditAgent) {
      return;
    }

    const nextErrors = getFieldErrors(fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (statusOverride === "active") {
        setActivationError("Revisa los campos base del agente antes de activarlo.");
      }
      return;
    }

    setLoading(true);
    clearFeedback();

    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          description: fields.description || undefined,
          systemPrompt: fields.systemPrompt,
          llmModel: fields.llmModel,
          llmTemperature: fields.llmTemperature,
          status: statusOverride ?? fields.status,
          ...(draftSetupState ? { setupState: draftSetupState } : {}),
        }),
      });
      const result = (await response.json()) as { data?: Agent; error?: string };

      if (!response.ok || !result.data) {
        const message = result.error ?? "No se pudo guardar la configuracion del agente.";
        setSubmitError(message);
        if (statusOverride === "active") {
          setActivationError(message);
        }
        return;
      }

      const nextSavedFields = createInitialFields(result.data);
      const nextSavedSetupState = cloneSetupState(draftSetupState);
      setFields(nextSavedFields);
      setSavedFields(nextSavedFields);
      setDraftSetupState(cloneSetupState(nextSavedSetupState));
      setSavedSetupState(nextSavedSetupState);
      setErrors({});
      setSuccessMessage(statusOverride === "active" ? "Agente activado y cambios guardados." : "Cambios guardados.");
      setPromptSyncMode(
        nextSavedSetupState ? detectPromptSyncMode(nextSavedFields.systemPrompt, nextSavedSetupState) : "custom"
      );

      if (qaProposalSummary && typeof window !== "undefined") {
        assignCurrentAgentUrl(activeTab);
        return;
      }

      void router.refresh();
    } catch {
      const message = "No se pudo guardar la configuracion del agente.";
      setSubmitError(message);
      if (statusOverride === "active") {
        setActivationError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDiscard() {
    setFields(savedFields);
    setDraftSetupState(cloneSetupState(savedSetupState));
    setErrors({});
    clearFeedback();
    setQaProposalSummary(null);
    setQaRecommendations([]);
    setPromptSyncMode(
      savedSetupState ? detectPromptSyncMode(savedFields.systemPrompt, savedSetupState) : "custom"
    );
  }

  function handleOpenPreview() {
    if (!canUseSandbox) {
      return;
    }

    saveChatPreviewSession(
      agent.id,
      {
        systemPrompt: fields.systemPrompt,
        llmModel: fields.llmModel,
        llmTemperature: fields.llmTemperature,
        maxTokens: agent.max_tokens ?? 1000,
      },
      "Borrador del editor"
    );
    router.push(`/agents/${agent.id}/chat?chatMode=sandbox&preview=1`);
  }

  return (
    <div className="space-y-6">
      <AgentDetailWorkspaceHeader
        agentId={agent.id}
        name={fields.name}
        description={fields.description || agent.description}
        savedStatus={savedFields.status}
        connectionSummary={connectionSummary}
        canUseSandbox={canUseSandbox}
        canChat={canChat}
        canOpenQa={canOpenQa}
        qaEnabled={canShowQaTab}
        activeTab={activeTab}
        tabs={tabs}
        statusLabel={getStatusLabel(savedFields.status)}
        onTabChange={setActiveTab}
        onOpenPreview={handleOpenPreview}
        onOpenQa={() => setActiveTab("qa")}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <AgentDetailWorkspaceMain
            activeTab={activeTab}
            agentId={agent.id}
            documents={documents}
            connection={connection}
            connectionSummary={connectionSummary}
            whatsappIntegrationId={whatsappIntegrationId}
            configContent={
              <AgentDetailConfigPanel
                agentId={agent.id}
                connection={connection}
                connectionSummary={connectionSummary}
                fields={fields}
                errors={errors}
                userRole={userRole}
                qaProposalSummary={qaProposalSummary}
                qaRecommendations={qaRecommendations}
                salesforceIntegrationNotice={salesforceIntegrationNotice}
                onChange={handleFieldChange}
              />
            }
            draftSetupState={draftSetupState}
            savedStatus={savedFields.status}
            canEditAgent={canEditAgent}
            canManageDocuments={canManageDocuments}
            canUploadDocuments={canManageDocuments}
            setupChatHref={setupChatHref}
            setupChatLabel={setupChatLabel}
            hasUnsavedChanges={hasUnsavedChanges}
            canActivate={readiness.canActivate}
            baseFieldsReady={readiness.missingBaseFields.length === 0}
            isActivating={loading}
            activationError={activationError}
            onOpenKnowledge={() => setActiveTab("knowledge")}
            onTaskDataChange={(itemId, value) =>
              applySetupStateChange((currentSetupState, fallbackTimezone) =>
                mergeSetupProgress(
                  currentSetupState,
                  { currentStep: 3, taskData: { [itemId]: value } },
                  { fallbackTimezone }
                )
              )
            }
            onManualStatusChange={(itemId, status) =>
              applySetupStateChange((currentSetupState, fallbackTimezone) =>
                mergeSetupProgress(
                  currentSetupState,
                  { currentStep: 3, manualChecklist: [{ id: itemId, status }] },
                  { fallbackTimezone }
                )
              )
            }
            onBuilderDraftChange={(field, value) =>
              applySetupStateChange((currentSetupState, fallbackTimezone) =>
                mergeSetupProgress(
                  currentSetupState,
                  { currentStep: 3, builderDraft: { [field]: value } },
                  { fallbackTimezone }
                )
              )
            }
            onActivate={() => void persistAgent("active")}
          />
        </div>

        <AgentWorkspaceSaveRail
          fields={fields}
          connection={connection}
          connectionSummary={connectionSummary}
          selectedStatusLabel={getStatusLabel(fields.status)}
          selectedModelLabel={fields.llmModel}
          promptWords={promptWords}
          promptLines={promptLines}
          activeTabLabel={TAB_LABELS[activeTab]}
          changedTabs={changedTabs}
          hasUnsavedChanges={hasUnsavedChanges}
          loading={loading}
          submitError={submitError}
          successMessage={successMessage}
          canEdit={canEditAgent}
          onSave={() => void persistAgent()}
          onDiscard={handleDiscard}
          promptSyncMode={promptSyncMode}
          hasRecommendedPromptUpdate={hasRecommendedPromptUpdate}
          onApplyRecommendedPrompt={() => {
            if (!draftSetupState || !canEditAgent) {
              return;
            }

            clearFeedback();
            setFields((current) => ({ ...current, systemPrompt: recommendedPrompt }));
            setPromptSyncMode("recommended");
          }}
        />
      </div>
    </div>
  );
}



