import { CHANNEL_LABELS, type AgentTemplateId } from "@/lib/agents/agent-setup";
import {
  getAgentTemplateById,
  getAgentTemplatesForEcosystem,
} from "@/lib/agents/agent-templates";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import {
  WIZARD_ECOSYSTEMS,
  getWizardEcosystemById,
  type WizardEcosystemId,
  type WizardEcosystemTheme,
} from "@/lib/agents/wizard-ecosystems";
import { WizardEcosystemIcon } from "@/components/agents/wizard/wizard-ecosystem-icons";
import { WizardEcosystemTutorial } from "@/components/agents/wizard/wizard-ecosystem-tutorial";
import { WizardWhatsAppSetup } from "@/components/agents/wizard/wizard-whatsapp-setup";
import type { Role } from "@/types/app";

const THEME_STYLES: Record<WizardEcosystemTheme, { badge: string; ring: string; icon: string }> = {
  emerald: {
    badge: "bg-emerald-50 text-emerald-700",
    ring: "border-emerald-300 bg-emerald-50/80",
    icon: "bg-emerald-100 text-emerald-600",
  },
  sky: {
    badge: "bg-sky-50 text-sky-700",
    ring: "border-sky-300 bg-sky-50/80",
    icon: "bg-sky-100 text-sky-600",
  },
  orange: {
    badge: "bg-orange-50 text-orange-700",
    ring: "border-orange-300 bg-orange-50/80",
    icon: "bg-orange-100 text-orange-600",
  },
  rose: {
    badge: "bg-rose-50 text-rose-700",
    ring: "border-rose-300 bg-rose-50/80",
    icon: "bg-rose-100 text-rose-600",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700",
    ring: "border-violet-300 bg-violet-50/80",
    icon: "bg-violet-100 text-violet-600",
  },
};

type StepTemplateSelectProps = {
  role: Role;
  selectedEcosystemId: WizardEcosystemId | null;
  selectedTemplateId: AgentTemplateId | null;
  whatsappConnection: WhatsAppConnectionView;
  salesforceOperationalView: IntegrationOperationalView;
  onSelectEcosystem: (ecosystemId: WizardEcosystemId) => void;
  onSelectTemplate: (templateId: AgentTemplateId) => void;
};

export function StepTemplateSelect({
  role,
  selectedEcosystemId,
  selectedTemplateId,
  whatsappConnection,
  salesforceOperationalView,
  onSelectEcosystem,
  onSelectTemplate,
}: StepTemplateSelectProps) {
  const activeEcosystem = selectedEcosystemId ? getWizardEcosystemById(selectedEcosystemId) : null;
  const visibleTemplates = selectedEcosystemId ? getAgentTemplatesForEcosystem(selectedEcosystemId) : [];
  const whatsappUnifiedTemplate = getAgentTemplateById("whatsapp_unified");
  const isFromScratchSelected = selectedTemplateId === "from_scratch";
  const galleryDescription =
    activeEcosystem?.id === "whatsapp"
      ? "Puedes validar la conexion arriba sin salir del wizard. Este flujo crea un unico agente inteligente por numero de WhatsApp."
      : activeEcosystem?.id === "salesforce"
        ? salesforceOperationalView.status === "connected" || salesforceOperationalView.status === "expiring_soon"
          ? "Salesforce ya esta conectado para esta organizacion. Si eliges un template Salesforce, el borrador se crea con la tool CRM autoasignada."
          : "Salesforce todavia no esta listo para esta organizacion. El borrador se crea igual, pero quedara bloqueado hasta conectar Salesforce y guardar la tool CRM."
        : "Estos templates vienen hardcodeados para acelerar onboarding. La conexion real todavia depende del estado del ecosistema elegido.";

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Paso 1</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Elige la integracion base</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Primero elegimos el ecosistema. Despues te mostramos un tutorial corto y el punto de partida recomendado para arrancar con un borrador guiado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {WIZARD_ECOSYSTEMS.map((ecosystem) => {
          const styles = THEME_STYLES[ecosystem.theme];
          const isSelected = selectedEcosystemId === ecosystem.id;

          return (
            <button
              key={ecosystem.id}
              type="button"
              onClick={() => onSelectEcosystem(ecosystem.id)}
              className={`group rounded-[2rem] border p-5 text-left transition-all ${
                isSelected
                  ? `${styles.ring} -translate-y-0.5 shadow-lg`
                  : "border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? styles.icon : "bg-slate-100 text-slate-700"}`}>
                  <WizardEcosystemIcon ecosystemId={ecosystem.id} className="h-7 w-7" />
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${isSelected ? "bg-slate-900 text-white" : styles.badge}`}>
                  {ecosystem.availabilityLabel}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-900">{ecosystem.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ecosystem.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {isSelected ? "Seleccionado" : "Abrir tutorial y flujo guiado"}
              </p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onSelectTemplate("from_scratch")}
        className={`w-full rounded-[2rem] border border-dashed px-5 py-5 text-left transition-all ${
          isFromScratchSelected
            ? "border-slate-900 bg-slate-900 text-white shadow-lg"
            : "border-slate-300 bg-slate-50 text-slate-900 hover:border-slate-400 hover:bg-white"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isFromScratchSelected ? "text-slate-200" : "text-slate-500"}`}>
              O empieza sin integracion
            </p>
            <h3 className="mt-2 text-lg font-bold tracking-tight">Desde cero</h3>
            <p className={`mt-2 text-sm leading-relaxed ${isFromScratchSelected ? "text-slate-100" : "text-slate-600"}`}>
              Usa una base flexible, sin tutorial previo ni templates de ecosistema. Ideal para un borrador exploratorio o un caso todavia no estandarizado.
            </p>
          </div>
          <span className={`inline-flex h-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${isFromScratchSelected ? "bg-white/10 text-white" : "bg-white text-slate-700"}`}>
            Construccion libre
          </span>
        </div>
      </button>

      {activeEcosystem ? (
        activeEcosystem.id === "whatsapp" ? (
          <WizardWhatsAppSetup role={role} connection={whatsappConnection} />
        ) : (
          <WizardEcosystemTutorial
            ecosystem={activeEcosystem}
            role={role}
            salesforceOperationalView={activeEcosystem.id === "salesforce" ? salesforceOperationalView : undefined}
          />
        )
      ) : null}

      {activeEcosystem ? (
        activeEcosystem.id === "whatsapp" ? (
          <div id="wizard-template-gallery" className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Modo recomendado</p>
                <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Un solo agente inteligente por numero</h3>
              </div>
              <p className="max-w-xl text-sm text-slate-600">{galleryDescription}</p>
            </div>

            <button
              type="button"
              onClick={() => onSelectTemplate(whatsappUnifiedTemplate.id)}
              className={`w-full rounded-[2rem] border p-6 text-left transition-all ${
                selectedTemplateId === whatsappUnifiedTemplate.id
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                  : "border-emerald-200 bg-white text-slate-900 shadow-sm hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                    selectedTemplateId === whatsappUnifiedTemplate.id ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {CHANNEL_LABELS[whatsappUnifiedTemplate.channel]}
                  </span>
                  <h4 className="mt-4 text-2xl font-bold tracking-tight">{whatsappUnifiedTemplate.name}</h4>
                  <p className={`mt-3 text-sm leading-relaxed ${
                    selectedTemplateId === whatsappUnifiedTemplate.id ? "text-slate-100" : "text-slate-600"
                  }`}>
                    {whatsappUnifiedTemplate.description}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  selectedTemplateId === whatsappUnifiedTemplate.id ? "bg-white/10 text-slate-100" : "bg-slate-100 text-slate-700"
                }`}>
                  {whatsappUnifiedTemplate.objectiveLabel}
                </span>
              </div>

              <div className={`mt-5 grid gap-3 md:grid-cols-3 ${
                selectedTemplateId === whatsappUnifiedTemplate.id ? "text-slate-100" : "text-slate-700"
              }`}>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Router de intencion</p>
                  <p className="mt-2 text-sm">Soporte, ventas, turnos y seguimiento viven dentro del mismo agente sin mezclar playbooks.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Auto-reply real</p>
                  <p className="mt-2 text-sm">Los mensajes del numero conectado se responden por webhook + worker, no desde preview ni live local.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Compatibilidad</p>
                  <p className="mt-2 text-sm">Los templates legacy siguen existiendo en codigo para playbooks internos y agentes ya creados.</p>
                </div>
              </div>

              <div className={`mt-5 flex flex-wrap items-center gap-2 text-xs ${
                selectedTemplateId === whatsappUnifiedTemplate.id ? "text-slate-200" : "text-slate-500"
              }`}>
                <span>Modelo sugerido: {whatsappUnifiedTemplate.recommendedModel}</span>
                <span aria-hidden="true">&middot;</span>
                <span>Temp. {whatsappUnifiedTemplate.recommendedTemperature.toFixed(2)}</span>
              </div>
            </button>
          </div>
        ) : (
          <div id="wizard-template-gallery" className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Templates sugeridos</p>
                <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Casos comunes para {activeEcosystem.name}</h3>
              </div>
              <p className="max-w-xl text-sm text-slate-600">{galleryDescription}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {visibleTemplates.map((template) => {
                const isSelected = selectedTemplateId === template.id;
                const styles = THEME_STYLES[activeEcosystem.theme];

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onSelectTemplate(template.id)}
                    className={`rounded-[2rem] border p-5 text-left transition-all ${
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                        : "border-slate-200 bg-white text-slate-900 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${isSelected ? "bg-white/10 text-white" : styles.badge}`}>
                          {CHANNEL_LABELS[template.channel]}
                        </span>
                        <h4 className="mt-4 text-lg font-bold tracking-tight">{template.name}</h4>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${isSelected ? "bg-white/10 text-slate-100" : "bg-slate-100 text-slate-700"}`}>
                        {template.objectiveLabel}
                      </span>
                    </div>
                    <p className={`mt-3 text-sm leading-relaxed ${isSelected ? "text-slate-100" : "text-slate-600"}`}>
                      {template.description}
                    </p>
                    <div className={`mt-5 flex flex-wrap items-center gap-2 text-xs ${isSelected ? "text-slate-200" : "text-slate-500"}`}>
                      <span>Modelo sugerido: {template.recommendedModel}</span>
                      <span aria-hidden="true">&middot;</span>
                      <span>Temp. {template.recommendedTemperature.toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : null}

      {!activeEcosystem && !isFromScratchSelected ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          Elige una de las cinco integraciones para ver su tutorial y el punto de partida sugerido, o arranca directo <span className="font-semibold text-slate-900">desde cero</span>.
        </div>
      ) : null}

      {isFromScratchSelected ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          Crearemos un borrador flexible sin tutorial previo. Aun asi, seguiras teniendo el mismo prompt builder, setup guiado y guardado en draft del resto del wizard.
        </div>
      ) : null}
    </section>
  );
}
