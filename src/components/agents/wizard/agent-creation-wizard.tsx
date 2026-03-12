"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { StepBehaviorBuilder } from "@/components/agents/wizard/step-behavior-builder";
import { StepChannelSetup } from "@/components/agents/wizard/step-channel-setup";
import { StepReview } from "@/components/agents/wizard/step-review";
import { StepTemplateSelect } from "@/components/agents/wizard/step-template-select";
import { WizardStepIndicator } from "@/components/agents/wizard/wizard-step-indicator";
import { agentModelSchema } from "@/lib/agents/agent-config";
import {
  mergeSetupProgress,
  type AgentSetupChecklistItemStatus,
  type AgentTemplateId,
  type PromptBuilderDraft,
  type PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import {
  buildRecommendedSystemPrompt,
  createSetupStateForTemplate,
  getAgentTemplateById,
  syncSystemPromptWithSetup,
} from "@/lib/agents/agent-templates";
import type { WizardEcosystemId } from "@/lib/agents/wizard-ecosystems";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import type { Role } from "@/types/app";

const stepTwoSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres"),
  description: z.string().max(500, "La descripcion no puede superar 500 caracteres").optional(),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: agentModelSchema,
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
});

type WizardStep = 1 | 2 | 3 | 4;

type WizardErrors = Partial<Record<"name" | "description" | "systemPrompt" | "llmModel" | "llmTemperature" | "template", string>>;

type WizardFields = {
  name: string;
  description: string;
  llmModel: string;
  llmTemperature: number;
  systemPrompt: string;
  setupState: ReturnType<typeof createSetupStateForTemplate>;
};

type AgentCreationWizardProps = {
  role: Role;
  whatsappConnection: WhatsAppConnectionView;
  salesforceOperationalView: IntegrationOperationalView;
};

function getFieldsFromTemplate(templateId: AgentTemplateId, fallbackTimezone: string): WizardFields {
  const template = getAgentTemplateById(templateId);
  const setupState = createSetupStateForTemplate(templateId, { fallbackTimezone });

  return {
    name: templateId === "from_scratch" ? "" : template.name,
    description: templateId === "from_scratch" ? "" : template.description,
    llmModel: template.recommendedModel,
    llmTemperature: template.recommendedTemperature,
    systemPrompt: buildRecommendedSystemPrompt(setupState),
    setupState,
  };
}

export function AgentCreationWizard({ role, whatsappConnection, salesforceOperationalView }: AgentCreationWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [selectedEcosystemId, setSelectedEcosystemId] = useState<WizardEcosystemId | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<AgentTemplateId | null>(null);
  const [fields, setFields] = useState<WizardFields>(() => getFieldsFromTemplate("from_scratch", getClientTimeZone()));
  const [errors, setErrors] = useState<WizardErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeTemplate = getAgentTemplateById(selectedTemplateId ?? "from_scratch");
  const recommendedPrompt = buildRecommendedSystemPrompt(fields.setupState);

  function resetStepOneSelection(ecosystemId: WizardEcosystemId | null, templateId: AgentTemplateId | null) {
    setSelectedEcosystemId(ecosystemId);
    setSelectedTemplateId(templateId);
    setErrors({});
    setSubmitError(null);
  }

  function handleEcosystemSelect(ecosystemId: WizardEcosystemId) {
    resetStepOneSelection(ecosystemId, null);
    setFields(getFieldsFromTemplate("from_scratch", getClientTimeZone()));
  }

  function handleTemplateSelect(templateId: AgentTemplateId) {
    const template = getAgentTemplateById(templateId);
    resetStepOneSelection(template.ecosystem, templateId);
    setFields(getFieldsFromTemplate(templateId, getClientTimeZone()));
  }

  function applySetupStateChange(
    updater: (
      setupState: WizardFields["setupState"],
      fallbackTimezone: string
    ) => WizardFields["setupState"]
  ) {
    const fallbackTimezone = getClientTimeZone();

    setFields((prev) => {
      const nextSetupState = updater(prev.setupState, fallbackTimezone);

      return {
        ...prev,
        setupState: nextSetupState,
        systemPrompt: syncSystemPromptWithSetup(prev.systemPrompt, prev.setupState, nextSetupState),
      };
    });
    setSubmitError(null);
  }

  function handlePromptBuilderChange<K extends keyof PromptBuilderDraft>(field: K, value: PromptBuilderDraft[K]) {
    applySetupStateChange((setupState, fallbackTimezone) =>
      mergeSetupProgress(
        setupState,
        {
          builderDraft: { [field]: value } as Partial<PromptBuilderDraft>,
        },
        { fallbackTimezone }
      )
    );
  }

  function handleTaskDataChange(itemId: string, value: unknown) {
    applySetupStateChange((setupState, fallbackTimezone) =>
      mergeSetupProgress(
        setupState,
        {
          currentStep: 3,
          taskData: { [itemId]: value },
        },
        { fallbackTimezone }
      )
    );
  }

  function handleChecklistStatusChange(itemId: string, status: AgentSetupChecklistItemStatus) {
    applySetupStateChange((setupState, fallbackTimezone) =>
      mergeSetupProgress(
        setupState,
        {
          currentStep: 3,
          manualChecklist: [{ id: itemId, status }],
        },
        { fallbackTimezone }
      )
    );
  }

  function handleBuilderFieldReviewChange(field: PromptBuilderTextField, value: string) {
    handlePromptBuilderChange(field, value);
  }

  function validateStepTwo(): boolean {
    const parsed = stepTwoSchema.safeParse({
      name: fields.name,
      description: fields.description || undefined,
      systemPrompt: fields.systemPrompt,
      llmModel: fields.llmModel,
      llmTemperature: fields.llmTemperature,
    });

    if (parsed.success) {
      setErrors({});
      return true;
    }

    const nextErrors: WizardErrors = {};
    for (const issue of parsed.error.errors) {
      const key = issue.path[0] as keyof WizardErrors | undefined;
      if (key && !nextErrors[key]) {
        nextErrors[key] = issue.message;
      }
    }
    setErrors(nextErrors);
    return false;
  }

  function goToStep(nextStep: WizardStep) {
    setCurrentStep(nextStep);
    setFields((prev) => ({
      ...prev,
      setupState: mergeSetupProgress(prev.setupState, { currentStep: nextStep }, { fallbackTimezone: getClientTimeZone() }),
    }));
  }

  function handleNext() {
    if (currentStep === 1) {
      if (!selectedTemplateId) {
        setErrors({ template: "Elige una integracion con template o empieza desde cero para continuar" });
        return;
      }
      setErrors({});
      goToStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!validateStepTwo()) {
        return;
      }
      goToStep(3);
      return;
    }

    if (currentStep === 3) {
      goToStep(4);
    }
  }

  function handleBack() {
    if (currentStep === 1) {
      return;
    }

    goToStep((currentStep - 1) as WizardStep);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateStepTwo()) {
      setCurrentStep(2);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      const setupState = mergeSetupProgress(fields.setupState, { currentStep: 4 }, { fallbackTimezone: getClientTimeZone() });
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
          <>
            <StepTemplateSelect
              role={role}
              selectedEcosystemId={selectedEcosystemId}
              selectedTemplateId={selectedTemplateId}
              whatsappConnection={whatsappConnection}
              salesforceOperationalView={salesforceOperationalView}
              onSelectEcosystem={handleEcosystemSelect}
              onSelectTemplate={handleTemplateSelect}
            />
            {errors.template ? (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">{errors.template}</p>
              </div>
            ) : null}
          </>
        ) : null}

        {currentStep === 2 ? (
          <StepBehaviorBuilder
            templateName={activeTemplate.name}
            name={fields.name}
            description={fields.description}
            llmModel={fields.llmModel}
            llmTemperature={fields.llmTemperature}
            systemPrompt={fields.systemPrompt}
            recommendedPrompt={recommendedPrompt}
            promptBuilder={fields.setupState.builder_draft}
            errors={errors}
            onNameChange={(value) => setFields((prev) => ({ ...prev, name: value }))}
            onDescriptionChange={(value) => setFields((prev) => ({ ...prev, description: value }))}
            onModelChange={(value) => setFields((prev) => ({ ...prev, llmModel: value }))}
            onTemperatureChange={(value) => setFields((prev) => ({ ...prev, llmTemperature: value }))}
            onSystemPromptChange={(value) => setFields((prev) => ({ ...prev, systemPrompt: value }))}
            onPromptBuilderChange={handlePromptBuilderChange}
            onUseRecommendedPrompt={() => setFields((prev) => ({ ...prev, systemPrompt: recommendedPrompt }))}
          />
        ) : null}

        {currentStep === 3 ? (
          <StepChannelSetup
            templateName={activeTemplate.name}
            setupState={fields.setupState}
            onTaskDataChange={handleTaskDataChange}
            onManualStatusChange={handleChecklistStatusChange}
            onBuilderDraftChange={handleBuilderFieldReviewChange}
          />
        ) : null}

        {currentStep === 4 ? (
          <StepReview
            templateName={activeTemplate.name}
            name={fields.name}
            description={fields.description}
            llmModel={fields.llmModel}
            llmTemperature={fields.llmTemperature}
            systemPrompt={fields.systemPrompt}
            setupState={fields.setupState}
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

          {currentStep < 4 ? (
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
              {loading ? "Creando borrador..." : "Crear borrador guiado"}
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







