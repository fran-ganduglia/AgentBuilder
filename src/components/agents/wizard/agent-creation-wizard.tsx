"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { StepInstanceConfig } from "@/components/agents/wizard/step-instance-config";
import {
  StepIntegrationsScope,
  type WizardIntegrationConnectionState,
} from "@/components/agents/wizard/step-integrations-scope";
import { StepModelSelect } from "@/components/agents/wizard/step-model-select";
import { StepReview } from "@/components/agents/wizard/step-review";
import { StepWorkflowRules } from "@/components/agents/wizard/step-workflow-rules";
import { StepWorkflowSelect } from "@/components/agents/wizard/step-workflow-select";
import { WizardStepIndicator } from "@/components/agents/wizard/wizard-step-indicator";
import { AGENT_MODEL_OPTIONS, agentModelSchema } from "@/lib/agents/agent-config";
import {
  CUSTOM_TOOL_SCOPE_TASK_KEY,
  createDefaultAgentSetupState,
  getCustomToolScopeSelections,
  resolveSetupState,
  type AgentSetupState,
  type ChannelIntent,
  type PromptBuilderDraft,
} from "@/lib/agents/agent-setup";
import type { OrganizationPlanName } from "@/lib/agents/agent-integration-limits";
import { buildRecommendedSystemPrompt } from "@/lib/agents/agent-templates";
import { AGENT_SCOPE_LABELS, type AgentScope } from "@/lib/agents/agent-scope";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import {
  GENERAL_OPERATIONS_WORKFLOW,
  type AgentCapability,
} from "@/lib/agents/public-workflow";
import {
  WIZARD_INTEGRATION_IDS,
  type WizardIntegrationId,
} from "@/lib/agents/wizard-integrations";
import { getWizardIntegrationById } from "@/lib/agents/wizard-integrations";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { GoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";

const stepOneSchema = z.object({
  agentScope: z.string().min(1, "Selecciona un tipo de agente"),
});

const stepTwoSchema = z.object({
  name: z.string().min(1, "El nombre del agente es requerido").max(100, "El nombre no puede superar 100 caracteres"),
});

const stepFiveSchema = z.object({
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt compilado no puede quedar vacio"),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
});

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type WizardErrors = Partial<Record<
  "workflowId" | "name" | "description" | "systemPrompt" | "llmModel" | "llmTemperature" | "integrations",
  string
>>;

type WizardFields = {
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  setupState: AgentSetupState;
};

type AgentCreationWizardProps = {
  whatsappConnection: WhatsAppConnectionView;
  salesforceOperationalView: IntegrationOperationalView;
  gmailOperationalView: GoogleSurfaceOperationalView;
  googleCalendarOperationalView: GoogleSurfaceOperationalView;
  googleSheetsOperationalView: GoogleSurfaceOperationalView;
  planName: OrganizationPlanName;
};

function getInitialWizardFields(): WizardFields {
  const setupState = applySuggestedSetupState(createDefaultAgentSetupState({
    currentStep: 1,
    workflowId: "general_operations",
    agentScope: "operations",
    toolScopePreset: "conservative",
  }), "");

  return {
    name: "",
    description: "",
    llmModel: resolveRecommendedModelForSetup(),
    llmTemperature: 0.7,
    systemPrompt: buildRecommendedSystemPrompt(setupState, {}),
    setupState,
  };
}

function resolveRecommendedModelForSetup(): string {
  return GENERAL_OPERATIONS_WORKFLOW.recommendedModels.find((item) => item.isPrimary)?.model
    ?? AGENT_MODEL_OPTIONS[0]?.value
    ?? "gpt-4o";
}

function resolveChannelFromSetup(setupState: AgentSetupState): ChannelIntent {
  return setupState.integrations.includes("whatsapp") ? "whatsapp" : "web";
}

function toggleInList<T extends string>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function buildSuggestedBuilderDraft(input: {
  name: string;
  integrations: WizardIntegrationId[];
  channel: ChannelIntent;
  previous: PromptBuilderDraft;
}): PromptBuilderDraft {
  const integrationLabels = input.integrations.map((integrationId) => getWizardIntegrationById(integrationId).name);
  const role = input.name.trim() || "Agente operativo";

  return {
    objective:
      input.previous.objective.trim() ||
      `Operar solicitudes, automatizaciones y entregables del workflow unico con reglas claras y trazabilidad.`,
    role,
    audience:
      input.previous.audience.trim() ||
      "Equipos internos y usuarios finales de la organizacion",
    allowedTasks:
      input.previous.allowedTasks.trim() ||
      [
        "Resolver pedidos dentro del alcance configurado.",
        integrationLabels.length > 0
          ? `Usar contexto real de ${integrationLabels.join(", ")} cuando este disponible.`
          : null,
      ].filter((value): value is string => Boolean(value)).join(" "),
    tone: input.previous.tone,
    restrictions:
      input.previous.restrictions.trim() ||
      "No inventar datos, resultados ni side effects. Toda escritura sensible requiere approval.",
    humanHandoff:
      input.previous.humanHandoff.trim() ||
      "Escalar a una persona cuando falte contexto, aprobacion o una integracion requerida falle.",
    openingMessage:
      input.previous.openingMessage.trim() ||
      `Hola, soy ${role}. Te ayudo a resolver este workflow con claridad y pasos accionables.`,
    channel: input.channel,
  };
}

function applySuggestedSetupState(setupState: AgentSetupState, name: string): AgentSetupState {
  const channel = resolveChannelFromSetup(setupState);
  const scopeLabel = AGENT_SCOPE_LABELS[setupState.agentScope].toLowerCase();

  return resolveSetupState({
    ...setupState,
    workflowId: "general_operations",
    outOfScopePolicy: "reject_and_redirect",
    channel,
    businessInstructions: {
      ...setupState.businessInstructions,
      objective:
        setupState.businessInstructions.objective ||
        setupState.builder_draft.objective,
      context:
        setupState.businessInstructions.context ||
        setupState.builder_draft.audience,
      tasks:
        setupState.businessInstructions.tasks ||
        setupState.builder_draft.allowedTasks,
      restrictions:
        setupState.businessInstructions.restrictions ||
        setupState.builder_draft.restrictions ||
        `No inventar datos ni ejecutar tools fuera del scope de ${scopeLabel}. Si el pedido corresponde a otro scope, rechazar y derivar.`,
      handoffCriteria:
        setupState.businessInstructions.handoffCriteria ||
        setupState.builder_draft.humanHandoff,
      outputStyle:
        setupState.businessInstructions.outputStyle ||
        setupState.instanceConfig.toneSummary,
    },
    builder_draft: buildSuggestedBuilderDraft({
      name,
      integrations: setupState.integrations,
      channel,
      previous: setupState.builder_draft,
    }),
  });
}

function buildConnectionStates(input: {
  whatsappConnection: WhatsAppConnectionView;
  salesforceOperationalView: IntegrationOperationalView;
  gmailOperationalView: GoogleSurfaceOperationalView;
  googleCalendarOperationalView: GoogleSurfaceOperationalView;
  googleSheetsOperationalView: GoogleSurfaceOperationalView;
}): Partial<Record<WizardIntegrationId, WizardIntegrationConnectionState>> {
  return {
    whatsapp: input.whatsappConnection.isConnected
      ? { label: "Conectado", summary: "Cuenta lista para usar en el canal real", tone: "emerald" }
      : { label: "Sin conectar", summary: "Conecta el numero antes de usar el canal WhatsApp", tone: "slate" },
    salesforce: {
      label: input.salesforceOperationalView.label,
      summary: input.salesforceOperationalView.summary,
      tone: input.salesforceOperationalView.tone,
    },
    gmail: {
      label: input.gmailOperationalView.label,
      summary: input.gmailOperationalView.summary,
      tone: input.gmailOperationalView.isUsable ? "emerald" : input.gmailOperationalView.tone,
    },
    google_calendar: {
      label: input.googleCalendarOperationalView.label,
      summary: input.googleCalendarOperationalView.summary,
      tone: input.googleCalendarOperationalView.isUsable ? "emerald" : input.googleCalendarOperationalView.tone,
    },
    google_sheets: {
      label: input.googleSheetsOperationalView.label,
      summary: input.googleSheetsOperationalView.summary,
      tone: input.googleSheetsOperationalView.isUsable ? "emerald" : input.googleSheetsOperationalView.tone,
    },
  };
}

function getMissingRequiredIntegrations(
  setupState: AgentSetupState,
  connectionStates: Partial<Record<WizardIntegrationId, WizardIntegrationConnectionState>>
): string[] {
  return setupState.requiredIntegrations.filter(
    (integrationId) => connectionStates[integrationId]?.tone !== "emerald"
  ).map((integrationId) => getWizardIntegrationById(integrationId).name);
}

export function AgentCreationWizard({
  whatsappConnection,
  salesforceOperationalView,
  gmailOperationalView,
  googleCalendarOperationalView,
  googleSheetsOperationalView,
  planName,
}: AgentCreationWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [fields, setFields] = useState<WizardFields>(() => getInitialWizardFields());
  const [errors, setErrors] = useState<WizardErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const connectionStates = buildConnectionStates({
    whatsappConnection,
    salesforceOperationalView,
    gmailOperationalView,
    googleCalendarOperationalView,
    googleSheetsOperationalView,
  });
  const customSelections = getCustomToolScopeSelections(fields.setupState.task_data);
  const workflow = GENERAL_OPERATIONS_WORKFLOW;

  function updateSetupState(
    updater: (setupState: AgentSetupState) => AgentSetupState,
    options: { nextName?: string; nextModel?: string } = {}
  ) {
    setFields((prev) => {
      const nextName = options.nextName ?? prev.name;
      const nextRawSetupState = updater(prev.setupState);
      const nextSetupState = applySuggestedSetupState(nextRawSetupState, nextName);

      return {
        ...prev,
        name: nextName,
        llmModel: options.nextModel ?? prev.llmModel,
        setupState: nextSetupState,
        systemPrompt: buildRecommendedSystemPrompt(nextSetupState, {}),
      };
    });
    setSubmitError(null);
  }

  function validateStepOne(): boolean {
    const parsed = stepOneSchema.safeParse({
      agentScope: fields.setupState.agentScope,
    });

    if (parsed.success) {
      setErrors((prev) => ({ ...prev, workflowId: undefined }));
      return true;
    }

    setErrors((prev) => ({ ...prev, workflowId: parsed.error.errors[0]?.message ?? "Selecciona un tipo de agente" }));
    return false;
  }

  function validateStepTwo(): boolean {
    const parsed = stepTwoSchema.safeParse({ name: fields.name });

    if (parsed.success) {
      setErrors((prev) => ({ ...prev, name: undefined }));
      return true;
    }

    setErrors((prev) => ({ ...prev, name: parsed.error.errors[0]?.message ?? "El nombre es requerido" }));
    return false;
  }

  function validateStepThree(): boolean {
    const missingRequired = getMissingRequiredIntegrations(fields.setupState, connectionStates);

    if (missingRequired.length === 0) {
      setErrors((prev) => ({ ...prev, integrations: undefined }));
      return true;
    }

    setErrors((prev) => ({
      ...prev,
      integrations: `Falta conectar ${missingRequired.join(", ")}. Las integraciones requeridas bloquean la creacion del agente.`,
    }));
    return false;
  }

  function validateStepFive(): boolean {
    const parsed = stepFiveSchema.safeParse({
      description: fields.description || undefined,
      systemPrompt: fields.systemPrompt,
      llmModel: fields.llmModel,
      llmTemperature: fields.llmTemperature,
    });

    if (parsed.success) {
      setErrors((prev) => ({
        ...prev,
        description: undefined,
        systemPrompt: undefined,
        llmModel: undefined,
        llmTemperature: undefined,
      }));
      return true;
    }

    const nextErrors: WizardErrors = {};
    for (const issue of parsed.error.errors) {
      const key = issue.path[0] as keyof WizardErrors | undefined;
      if (key && !nextErrors[key]) {
        nextErrors[key] = issue.message;
      }
    }
    setErrors((prev) => ({ ...prev, ...nextErrors }));
    return false;
  }

  function goToStep(nextStep: WizardStep) {
    setCurrentStep(nextStep);
    updateSetupState((setupState) => ({ ...setupState, current_step: nextStep }));
  }

  function handleNext() {
    if (currentStep === 1) {
      if (!validateStepOne()) return;
      goToStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!validateStepTwo()) return;
      goToStep(3);
      return;
    }

    if (currentStep === 3) {
      if (!validateStepThree()) return;
      goToStep(4);
      return;
    }

    if (currentStep === 4) {
      goToStep(5);
      return;
    }

    if (currentStep === 5) {
      if (!validateStepFive()) return;
      goToStep(6);
    }
  }

  function handleBack() {
    if (currentStep === 1) return;
    goToStep((currentStep - 1) as WizardStep);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateStepOne()) {
      setCurrentStep(1);
      return;
    }

    if (!validateStepTwo()) {
      setCurrentStep(2);
      return;
    }

    if (!validateStepThree()) {
      setCurrentStep(3);
      return;
    }

    if (!validateStepFive()) {
      setCurrentStep(5);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      const setupState = resolveSetupState(
        {
          ...fields.setupState,
          current_step: 6,
        },
        { fallbackTimezone: getClientTimeZone() }
      );
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          description: fields.description || undefined,
          llmModel: fields.llmModel,
          llmTemperature: fields.llmTemperature,
          workflowId: setupState.workflowId,
          agentScope: setupState.agentScope,
          outOfScopePolicy: setupState.outOfScopePolicy,
          capabilities: setupState.capabilities,
          businessInstructions: setupState.businessInstructions,
          setupState,
        }),
      });

      const result = (await response.json()) as {
        data?: { id: string };
        error?: string;
      };

      if (!response.ok || !result.data) {
        setSubmitError(result.error ?? "No se pudo crear el agente");
        return;
      }

      router.push(`/agents/${result.data.id}`);
      router.refresh();
    } catch {
      setSubmitError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <WizardStepIndicator currentStep={currentStep} />

      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        {currentStep === 1 ? (
          <StepWorkflowSelect
            selectedScope={fields.setupState.agentScope}
            error={errors.workflowId}
            onSelectScope={(agentScope: AgentScope) => updateSetupState(
              () => ({
                ...createDefaultAgentSetupState({
                  currentStep: 1,
                  workflowId: "general_operations",
                  agentScope,
                  outOfScopePolicy: "reject_and_redirect",
                  toolScopePreset: "conservative",
                }),
                workflowId: "general_operations",
                agentScope,
                outOfScopePolicy: "reject_and_redirect",
                capabilities: [...workflow.defaultCapabilities],
                successMetrics: [...workflow.successMetrics],
                instanceConfig: { ...workflow.defaultInstanceConfig },
                optionalIntegrations: [...WIZARD_INTEGRATION_IDS],
                integrations: [],
              }),
              { nextModel: workflow.recommendedModels.find((item) => item.isPrimary)?.model ?? "gpt-4o" }
            )}
          />
        ) : null}

        {currentStep === 2 ? (
          <StepInstanceConfig
            workflow={workflow}
            name={fields.name}
            description={fields.description}
            instanceConfig={fields.setupState.instanceConfig}
            promptBuilder={{
              objective: fields.setupState.builder_draft.objective,
              audience: fields.setupState.builder_draft.audience,
            }}
            error={errors.name}
            onNameChange={(value) => updateSetupState((setupState) => setupState, { nextName: value })}
            onDescriptionChange={(value) => setFields((prev) => ({ ...prev, description: value }))}
            onPromptBuilderChange={(patch) => updateSetupState((setupState) => ({
              ...setupState,
              builder_draft: {
                ...setupState.builder_draft,
                ...patch,
              },
            }))}
            onInstanceConfigChange={(patch) => updateSetupState((setupState) => ({
              ...setupState,
              instanceConfig: {
                ...setupState.instanceConfig,
                ...patch,
              },
            }))}
          />
        ) : null}

        {currentStep === 3 ? (
          <div className="space-y-4">
            {errors.integrations ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">{errors.integrations}</p>
              </div>
            ) : null}
            <StepIntegrationsScope
              selectedIntegrationIds={fields.setupState.integrations}
              requiredIntegrationIds={fields.setupState.requiredIntegrations}
              optionalIntegrationIds={fields.setupState.optionalIntegrations}
              toolScopePreset={fields.setupState.tool_scope_preset}
              customSelections={customSelections}
              connectionStates={connectionStates}
              planName={planName}
              onToggleOptionalIntegration={(integrationId) => updateSetupState((setupState) => ({
                ...setupState,
                integrations: toggleInList(setupState.integrations, integrationId),
              }))}
              onSelectPreset={(preset) => updateSetupState((setupState) => ({
                ...setupState,
                tool_scope_preset: preset,
              }))}
              onToggleCustomAction={(integrationId, actionId) => updateSetupState((setupState) => {
                const currentSelections = getCustomToolScopeSelections(setupState.task_data);
                const nextIntegrationSelections = toggleInList(currentSelections[integrationId] ?? [], actionId);

                return {
                  ...setupState,
                  task_data: {
                    ...setupState.task_data,
                    [CUSTOM_TOOL_SCOPE_TASK_KEY]: {
                      ...currentSelections,
                      [integrationId]: nextIntegrationSelections,
                    },
                  },
                };
              })}
            />
          </div>
        ) : null}

        {currentStep === 4 ? (
          <StepWorkflowRules
            workflow={workflow}
            capabilities={fields.setupState.capabilities}
            businessInstructions={{
              tasks: fields.setupState.businessInstructions.tasks,
              restrictions: fields.setupState.businessInstructions.restrictions,
              handoffCriteria: fields.setupState.businessInstructions.handoffCriteria,
            }}
            instanceConfig={fields.setupState.instanceConfig}
            successMetrics={fields.setupState.successMetrics}
            onToggleCapability={(capability: AgentCapability) => updateSetupState((setupState) => ({
              ...setupState,
              capabilities: toggleInList(setupState.capabilities, capability),
            }))}
            onBusinessInstructionsChange={(patch) => updateSetupState((setupState) => ({
              ...setupState,
              businessInstructions: {
                ...setupState.businessInstructions,
                ...patch,
              },
            }))}
            onInstanceConfigChange={(patch) => updateSetupState((setupState) => ({
              ...setupState,
              instanceConfig: {
                ...setupState.instanceConfig,
                ...patch,
              },
            }))}
            onToggleSuccessMetric={(metric) => updateSetupState((setupState) => ({
              ...setupState,
              successMetrics: toggleInList(setupState.successMetrics, metric),
            }))}
          />
        ) : null}

        {currentStep === 5 ? (
          <StepModelSelect
            workflow={workflow}
            description={fields.description}
            llmModel={fields.llmModel}
            llmTemperature={fields.llmTemperature}
            systemPrompt={fields.systemPrompt}
            promptBuilder={{
              tone: fields.setupState.builder_draft.tone,
              openingMessage: fields.setupState.builder_draft.openingMessage,
            }}
            errors={errors}
            onDescriptionChange={(value) => setFields((prev) => ({ ...prev, description: value }))}
            onModelChange={(value) => setFields((prev) => ({ ...prev, llmModel: value }))}
            onTemperatureChange={(value) => setFields((prev) => ({ ...prev, llmTemperature: value }))}
            onToneChange={(value) => updateSetupState((setupState) => ({
              ...setupState,
              builder_draft: {
                ...setupState.builder_draft,
                tone: value,
              },
            }))}
            onOpeningMessageChange={(value) => updateSetupState((setupState) => ({
              ...setupState,
              builder_draft: {
                ...setupState.builder_draft,
                openingMessage: value,
              },
            }))}
          />
        ) : null}

        {currentStep === 6 ? (
          <StepReview
            name={fields.name}
            description={fields.description}
            llmModel={fields.llmModel}
            llmTemperature={fields.llmTemperature}
            systemPrompt={fields.systemPrompt}
            setupState={fields.setupState}
            workflow={workflow}
          />
        ) : null}
      </div>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800" role="alert">{submitError}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.push("/agents")}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          Cancelar
        </button>

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Volver
            </button>
          ) : null}

          {currentStep < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? "Creando borrador..." : "Crear agente"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function getClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
