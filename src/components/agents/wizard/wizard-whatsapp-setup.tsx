import { WhatsAppConnectionForm } from "@/components/settings/whatsapp-connection-form";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import {
  WHATSAPP_WIZARD_BENEFITS,
  WHATSAPP_WIZARD_SUMMARY,
  WHATSAPP_WIZARD_TUTORIAL_STEPS,
} from "@/lib/agents/wizard-whatsapp";
import type { Role } from "@/types/app";

type WizardWhatsAppSetupProps = {
  role: Role;
  connection: WhatsAppConnectionView;
};

export function WizardWhatsAppSetup({ role, connection }: WizardWhatsAppSetupProps) {
  return (
    <div className="space-y-5">
      <article className="rounded-[2rem] border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Conexion real de WhatsApp</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Tutorial corto + conexion embebida</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{WHATSAPP_WIZARD_SUMMARY}</p>
          </div>
          <span className="inline-flex h-fit items-center rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white">
            Conexion real disponible
          </span>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-emerald-100 bg-white/85 p-5">
            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Que habilita</h4>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
              {WHATSAPP_WIZARD_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white/85 p-5">
            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Checklist rapido</h4>
            <ol className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
              {WHATSAPP_WIZARD_TUTORIAL_STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{step.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                      {step.link ? (
                        <a
                          href={step.link.href}
                          target={step.link.external ? "_blank" : undefined}
                          rel={step.link.external ? "noreferrer" : undefined}
                          className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          {step.link.label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </article>

      <WhatsAppConnectionForm
        initialName={connection.initialName}
        initialWabaId={connection.initialWabaId}
        isConnected={connection.isConnected}
        accessTokenHint={connection.accessTokenHint}
        context="wizard"
        canSubmit={role === "admin"}
        showTutorialLinks
      />
    </div>
  );
}
