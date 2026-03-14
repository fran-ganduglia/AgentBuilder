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
  type AgentArea,
  type AgentSetupState,
  type ChannelIntent,
  type PromptBuilderDraft,
} from "@/lib/agents/agent-setup";
import type { OrganizationPlanName } from "@/lib/agents/agent-integration-limits";
import {
  buildRecommendedSystemPrompt,
  syncSystemPromptWithSetup,
  type RecommendedPromptEnvironment,
} from "@/lib/agents/agent-templates";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import type { WizardIntegrationId } from "@/lib/agents/wizard-integrations";
import { getWizardIntegrationById } from "@/lib/agents/wizard-integrations";
import {
  getWorkflowTemplateById,
  type SuccessMetricId,
  type WorkflowInstanceConfig,
  type WorkflowTemplate,
} from "@/lib/agents/workflow-templates";
import {
  isIntegrationOperationalViewUsable,
  type IntegrationOperationalView,
} from "@/lib/integrations/metadata";
import type { GoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";

const stepOneSchema = z.object({
  workflowTemplateId: z.string().min(1, "Selecciona un workflow template"),
});

const stepTwoSchema = z.object({
  name: z.string().min(1, "El nombre de la instancia es requerido").max(100, "El nombre no puede superar 100 caracteres"),
});

const stepFiveSchema = z.object({
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
});

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type WizardErrors = Partial<Record<
  "workflowTemplateId" | "name" | "description" | "systemPrompt" | "llmModel" | "llmTemperature" | "integrations",
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
  hubspotOperationalView: IntegrationOperationalView;
  gmailOperationalView: GoogleSurfaceOperationalView;
  googleCalendarOperationalView: GoogleSurfaceOperationalView;
  planName: OrganizationPlanName;
};

function getInitialWizardFields(): WizardFields {
  const setupState = applySuggestedSetupState(createDefaultAgentSetupState({ currentStep: 1 }), "");

  return {
    name: "",
    description: "",
    llmModel: resolveRecommendedModelForSetup(setupState),
    llmTemperature: 0.7,
    systemPrompt: buildRecommendedSystemPrompt(setupState, {}),
    setupState,
  };
}

function getWorkflowTemplate(setupState: AgentSetupState): WorkflowTemplate | null {
  return setupState.workflowTemplateId
    ? getWorkflowTemplateById(setupState.workflowTemplateId)
    : null;
}

function resolveRecommendedModelForAreas(areas: AgentArea[]): string {
  return AGENT_MODEL_OPTIONS.find((option) => areas.some((area) => option.recommendedAreas.includes(area)))?.value ?? "gpt-4o";
}

function resolveRecommendedModelForSetup(setupState: AgentSetupState): string {
  const workflowTemplate = getWorkflowTemplate(setupState);
  return workflowTemplate?.recommendedModels.find((item) => item.isPrimary)?.model
    ?? resolveRecommendedModelForAreas(setupState.areas);
}

function resolvePromptEnvironment(
  setupState: AgentSetupState,
  salesforceOperationalView: IntegrationOperationalView,
  hubspotOperationalView: IntegrationOperationalView,
  gmailOperationalView: GoogleSurfaceOperationalView,
  googleCalendarOperationalView: GoogleSurfaceOperationalView
): RecommendedPromptEnvironment {
  return {
    salesforceUsable: setupState.integrations.includes("salesforce")
      ? isIntegrationOperationalViewUsable(salesforceOperationalView)
      : false,
    hubspotUsable: setupState.integrations.includes("hubspot")
      ? isIntegrationOperationalViewUsable(hubspotOperationalView)
      : false,
    gmailConfigured: setupState.integrations.includes("gmail"),
    gmailRuntimeAvailable: gmailOperationalView.tone === "emerald",
    googleCalendarConfigured: setupState.integrations.includes("google_calendar"),
    googleCalendarRuntimeAvailable: googleCalendarOperationalView.tone === "emerald",
  };
}

function resolveChannelFromSetup(setupState: AgentSetupState): ChannelIntent {
  return setupState.integrations.includes("whatsapp") || setupState.requiredIntegrations.includes("whatsapp")
    ? "whatsapp"
    : "web";
}

function toggleInList<T extends string>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function buildSuggestedBuilderDraft(input: {
  workflowTemplate: WorkflowTemplate | null;
  name: string;
  integrations: WizardIntegrationId[];
  channel: ChannelIntent;
  instanceConfig: WorkflowInstanceConfig;
  previous: PromptBuilderDraft;
}): PromptBuilderDraft {
  const integrationLabels = input.integrations.map((integrationId) => getWizardIntegrationById(integrationId).name);
  const workflowName = input.workflowTemplate?.name ?? "workflow";
  const role = input.name.trim() || `Instancia de ${workflowName}`;

  return {
    objective: `Operar la instancia ${role} del workflow ${workflowName} con reglas claras, trazabilidad y sin inventar resultados.`,
    role,
    audience: input.instanceConfig.ownerLabel.trim() || "Equipos internos y usuarios finales de la organizacion",
    allowedTasks: [
      `Seguir el workflow ${workflowName} respetando integraciones requeridas y opcionales.`,
      integrationLabels.length > 0 ? `Usar el contexto de ${integrationLabels.join(", ")} cuando este realmente disponible.` : null,
      input.instanceConfig.routingMode.trim() || null,
    ].filter((value): value is string => Boolean(value)).join(" "),
    tone: input.previous.tone,
    restrictions: [
      "No inventar datos, accesos, resultados ni side effects.",
      "Si una integracion requerida falla, frenar y dar una salida segura y accionable.",
      "Si una integracion opcional falla, continuar aclarando que el resultado es parcial.",
    ].join(" "),
    humanHandoff: input.instanceConfig.handoffThreshold.trim()
      || "Escalar a una persona cuando falte contexto, aprobacion o disponibilidad real de una integracion requerida.",
    openingMessage: input.previous.openingMessage.trim()
      || `Hola, soy ${role}. Te acompano dentro de este workflow y te dire con claridad que puedo hacer en este turno.`,
    channel: input.channel,
  };
}

function applySuggestedSetupState(setupState: AgentSetupState, name: string): AgentSetupState {
  const workflowTemplate = getWorkflowTemplate(setupState);
  const channel = resolveChannelFromSetup(setupState);

  return resolveSetupState({
    ...setupState,
    channel,
    builder_draft: buildSuggestedBuilderDraft({
      workflowTemplate,
      name,
      integrations: setupState.integrations,
      channel,
      instanceConfig: setupState.instanceConfig,
      previous: setupState.builder_draft,
    }),
  });
}

function buildConnectionStates(input: {
  whatsappConnection: WhatsAppConnectionView;
  salesforceOperationalView: IntegrationOperationalView;
  hubspotOperationalView: IntegrationOperationalView;
  gmailOperationalView: GoogleSurfaceOperationalView;
  googleCalendarOperationalView: GoogleSurfaceOperationalView;
}): Partial<Record<WizardIntegrationId, WizardIntegrationConnectionState>> {
  return {
    whatsapp: input.whatsappConnection.isConnected
      ? { label: "Conectado", summary: "Cuenta lista para usar en el canal real", tone: "emerald" }
      : { label: "Sin conectar", summary: "Conecta el numero antes de crear una instancia que lo requiera", tone: "slate" },
    salesforce: {
      label: input.salesforceOperationalView.label,
      summary: input.salesforceOperationalView.summary,
      tone: input.salesforceOperationalView.tone,
    },
    hubspot: {
      label: input.hubspotOperationalView.label,
      summary: input.hubspotOperationalView.summary,
      tone: input.hubspotOperationalView.tone,
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
  hubspotOperationalView,
  gmailOperationalView,
  googleCalendarOperationalView,
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
    hubspotOperationalView,
    gmailOperationalView,
    googleCalendarOperationalView,
  });
  const customSelections = getCustomToolScopeSelections(fields.setupState.task_data);
  const workflowTemplate = getWorkflowTemplate(fields.setupState);

  function updateSetupState(
    updater: (setupState: AgentSetupState) => AgentSetupState,
    options: { nextName?: string; nextModel?: string } = {}
  ) {
    setFields((prev) => {
      const nextName = options.nextName ?? prev.name;
      const nextRawSetupState = updater(prev.setupState);
      const nextSetupState = applySuggestedSetupState(nextRawSetupState, nextName);
      const previousEnvironment = resolvePromptEnvironment(
        prev.setupState,
        salesforceOperationalView,
        hubspotOperationalView,
        gmailOperationalView,
        googleCalendarOperationalView
      );
      const nextEnvironment = resolvePromptEnvironment(
        nextSetupState,
        salesforceOperationalView,
        hubspotOperationalView,
        gmailOperationalView,
        googleCalendarOperationalView
      );

      return {
        ...prev,
        name: nextName,
        llmModel: options.nextModel ?? prev.llmModel,
        setupState: nextSetupState,
        systemPrompt: syncSystemPromptWithSetup(
          prev.systemPrompt,
          prev.setupState,
          nextSetupState,
          previousEnvironment,
          nextEnvironment
        ),
      };
    });
    setSubmitError(null);
  }

  function validateStepOne(): boolean {
    const parsed = stepOneSchema.safeParse({
      workflowTemplateId: fields.setupState.workflowTemplateId,
    });

    if (parsed.success) {
      setErrors((prev) => ({ ...prev, workflowTemplateId: undefined }));
      return true;
    }

    setErrors((prev) => ({ ...prev, workflowTemplateId: parsed.error.errors[0]?.message ?? "Selecciona un workflow template" }));
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
      integrations: `Falta conectar ${missingRequired.join(", ")}. Las integraciones requeridas bloquean la creacion de la instancia.`,
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
          systemPrompt: fields.systemPrompt,
          llmModel: fields.llmModel,
          llmTemperature: fields.llmTemperature,
          setupState,
        }),
      });

      const result = (await response.json()) as {
        data?: { id: string };
        error?: string;
      };

      if (!response.ok || !result.data) {
        setSubmitError(result.error ?? "No se pudo crear la workflow instance");
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
            selectedWorkflowTemplateId={fields.setupState.workflowTemplateId}
            error={errors.workflowTemplateId}
            onSelectWorkflow={(workflowTemplateId) => updateSetupState(
              () => {
                const template = getWorkflowTemplateById(workflowTemplateId);

                return {
                  ...createDefaultAgentSetupState({
                    currentStep: 1,
                    workflowTemplateId,
                    templateId: workflowTemplateId === "advanced_builder" ? "from_scratch" : null,
                    toolScopePreset: "conservative",
                  }),
                  workflowTemplateId,
                  template_id: workflowTemplateId === "advanced_builder" ? "from_scratch" : null,
                  automationPreset: template.defaultAutomationPreset,
                  successMetrics: [...template.successMetrics],
                  instanceConfig: { ...template.defaultInstanceConfig },
                  integrations: [...template.requiredIntegrations],
                };
              },
              { nextModel: getWorkflowTemplateById(workflowTemplateId).recommendedModels.find((item) => item.isPrimary)?.model ?? "gpt-4o" }
            )}
          />
        ) : null}

        {currentStep === 2 ? (
          <StepInstanceConfig
            workflowTemplate={workflowTemplate}
            name={fields.name}
            description={fields.description}
            instanceConfig={fields.setupState.instanceConfig}
            error={errors.name}
            onNameChange={(value) => updateSetupState((setupState) => setupState, { nextName: value })}
            onDescriptionChange={(value) => setFields((prev) => ({ ...prev, description: value }))}
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
            workflowTemplate={workflowTemplate}
            automationPreset={fields.setupState.automationPreset}
            instanceConfig={fields.setupState.instanceConfig}
            successMetrics={fields.setupState.successMetrics}
            onAutomationPresetChange={(value) => updateSetupState((setupState) => ({
              ...setupState,
              automationPreset: value,
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
              successMetrics: toggleInList(setupState.successMetrics, metric as SuccessMetricId),
            }))}
          />
        ) : null}

        {currentStep === 5 ? (
          <StepModelSelect
            workflowTemplate={workflowTemplate}
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
            onSystemPromptChange={(value) => setFields((prev) => ({ ...prev, systemPrompt: value }))}
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
            workflowTemplate={workflowTemplate}
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
              {loading ? "Creando borrador..." : "Crear workflow instance"}
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
