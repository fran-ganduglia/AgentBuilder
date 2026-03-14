import Link from "next/link";
import { IntegrationStatusBadge } from "@/components/settings/integration-status-badge";
import type { IntegrationOperationalView } from "@/lib/integrations/metadata";
import type {
  WizardEcosystem,
  WizardEcosystemTheme,
  WizardTutorialLink,
} from "@/lib/agents/wizard-ecosystems";
import type { Role } from "@/types/app";

const THEME_STYLES: Record<
  WizardEcosystemTheme,
  {
    shell: string;
    badge: string;
    eyebrow: string;
    card: string;
  }
> = {
  emerald: {
    shell: "border-emerald-200 bg-emerald-50/70",
    badge: "bg-emerald-600 text-white",
    eyebrow: "text-emerald-700",
    card: "border-emerald-100 bg-white/80",
  },
  sky: {
    shell: "border-sky-200 bg-sky-50/70",
    badge: "bg-sky-600 text-white",
    eyebrow: "text-sky-700",
    card: "border-sky-100 bg-white/85",
  },
  orange: {
    shell: "border-orange-200 bg-orange-50/70",
    badge: "bg-orange-600 text-white",
    eyebrow: "text-orange-700",
    card: "border-orange-100 bg-white/85",
  },
  rose: {
    shell: "border-rose-200 bg-rose-50/70",
    badge: "bg-rose-600 text-white",
    eyebrow: "text-rose-700",
    card: "border-rose-100 bg-white/85",
  },
  violet: {
    shell: "border-violet-200 bg-violet-50/70",
    badge: "bg-violet-600 text-white",
    eyebrow: "text-violet-700",
    card: "border-violet-100 bg-white/85",
  },
};

type WizardEcosystemTutorialProps = {
  ecosystem: WizardEcosystem;
  role: Role;
  salesforceOperationalView?: IntegrationOperationalView;
  hubspotOperationalView?: IntegrationOperationalView;
};

export function WizardEcosystemTutorial({
  ecosystem,
  role,
  salesforceOperationalView,
  hubspotOperationalView,
}: WizardEcosystemTutorialProps) {
  const styles = THEME_STYLES[ecosystem.theme];
  const hidePrimaryAction = ecosystem.id === "whatsapp" && role !== "admin";
  const providerOperationalView = ecosystem.id === "salesforce"
    ? salesforceOperationalView
    : ecosystem.id === "hubspot"
      ? hubspotOperationalView
      : undefined;

  return (
    <article className={`rounded-[2rem] border p-6 shadow-sm sm:p-7 ${styles.shell}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${styles.eyebrow}`}>
            Tutorial de integracion
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {ecosystem.tutorialTitle}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {ecosystem.tutorialDescription}
          </p>
        </div>
        <span
          className={`inline-flex h-fit items-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] ${styles.badge}`}
        >
          {ecosystem.availabilityLabel}
        </span>
      </div>

      {providerOperationalView ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Estado real en esta organizacion
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {providerOperationalView.status === "connected" ||
                providerOperationalView.status === "expiring_soon"
                  ? ecosystem.id === "salesforce"
                    ? "Si eliges un template Salesforce, el agente se guardara con la tool CRM ya vinculada."
                    : "Si eliges un template HubSpot, el agente se guardara con la tool CRM ya vinculada."
                  : ecosystem.id === "salesforce"
                    ? "Si eliges un template Salesforce, el agente se guardara en borrador pero quedara bloqueado hasta completar la conexion y la tool CRM."
                    : "Si eliges un template HubSpot, el agente se guardara en borrador pero quedara bloqueado hasta completar la conexion y la tool CRM."}
              </p>
            </div>
            <IntegrationStatusBadge view={providerOperationalView} />
          </div>
        </div>
      ) : null}

      {hidePrimaryAction ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La conexion real de WhatsApp se hace desde <span className="font-semibold">Settings &gt; Integraciones</span> y requiere un usuario admin. Puedes seguir viendo templates y preparando el onboarding desde aqui.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={`rounded-3xl border p-5 ${styles.card}`}>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Prerequisitos
          </h4>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            {ecosystem.prerequisites.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${styles.badge}`}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`rounded-3xl border p-5 ${styles.card}`}>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
            Acciones
          </h4>
          <div className="mt-4 flex flex-col gap-3">
            {!hidePrimaryAction ? <ActionLink link={ecosystem.primaryAction} primary /> : null}
            <ActionLink link={ecosystem.secondaryAction} />
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h5 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Recursos oficiales
            </h5>
            <div className="mt-3 flex flex-wrap gap-2">
              {ecosystem.resourceLinks.map((link) => (
                <ActionLink key={`${ecosystem.id}-${link.href}`} link={link} compact />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {ecosystem.steps.map((step, index) => (
          <div key={step.title} className={`rounded-3xl border p-5 ${styles.card}`}>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${styles.badge}`}
              >
                {index + 1}
              </span>
              <p className="text-base font-bold tracking-tight text-slate-900">{step.title}</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{step.description}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

type ActionLinkProps = {
  link: WizardTutorialLink;
  primary?: boolean;
  compact?: boolean;
};

function ActionLink({ link, primary = false, compact = false }: ActionLinkProps) {
  const className = compact
    ? "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
    : primary
      ? "inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
      : "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100";

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {link.label}
      </a>
    );
  }

  if (link.href.startsWith("/")) {
    return (
      <Link href={link.href} className={className}>
        {link.label}
      </Link>
    );
  }

  return (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  );
}

