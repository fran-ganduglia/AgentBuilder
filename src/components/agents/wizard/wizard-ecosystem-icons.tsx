import type { WizardEcosystemId } from "@/lib/agents/wizard-ecosystems";

type WizardEcosystemIconProps = {
  ecosystemId: WizardEcosystemId;
  className?: string;
};

export function WizardEcosystemIcon({ ecosystemId, className = "h-7 w-7" }: WizardEcosystemIconProps) {
  if (ecosystemId === "whatsapp") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 4.5c-6.2 0-11.2 5-11.2 11.1 0 2.2.6 4.2 1.8 6L5 27.5l6-1.6a11.3 11.3 0 0 0 5 .1c6.2 0 11.2-5 11.2-11.2S22.2 4.5 16 4.5Z" fill="currentColor" opacity="0.15" />
        <path d="M16 5.5c-5.7 0-10.2 4.5-10.2 10.1 0 2 .6 4 1.7 5.7L6.4 26l4.7-1.3c1.5.8 3.2 1.2 4.9 1.2 5.7 0 10.2-4.5 10.2-10.2S21.7 5.5 16 5.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12.4 11.8c.3-.7.6-.7.9-.7h.8c.2 0 .5.1.6.5l.8 2.3c.1.3 0 .5-.1.7l-.6.8c-.2.2-.2.5 0 .7.5.9 1.3 1.7 2.2 2.2.2.1.5.1.7 0l.8-.6c.2-.1.5-.2.7-.1l2.3.8c.4.1.5.4.5.6v.8c0 .3 0 .6-.7.9-.6.3-1.5.5-2.3.3-1.4-.3-2.8-1.2-4.4-2.7-1.7-1.6-2.6-3-2.9-4.5-.2-.8 0-1.7.3-2.3Z" fill="currentColor" />
      </svg>
    );
  }

  if (ecosystemId === "salesforce") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M11 22c-3 0-5.5-2.3-5.5-5.2S8 11.5 11 11.5c.4-3.2 3.2-5.7 6.6-5.7 2.8 0 5.2 1.6 6.2 4 2.2.2 4 2 4 4.3 0 2.5-2 4.4-4.6 4.4H11Z" fill="currentColor" opacity="0.18" />
        <path d="M10.7 21.8c-2.9 0-5.2-2.2-5.2-5 0-2.6 2.1-4.8 4.7-5 .8-3.4 3.9-5.8 7.4-5.8 2.8 0 5.3 1.5 6.7 4 2.1.3 3.7 2.1 3.7 4.2 0 2.3-1.9 4.2-4.3 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.7 21.8h12.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (ecosystemId === "hubspot") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="3.8" fill="currentColor" />
        <circle cx="24.2" cy="9" r="2.8" fill="currentColor" opacity="0.7" />
        <circle cx="24.8" cy="23.2" r="2.8" fill="currentColor" opacity="0.45" />
        <path d="M19.4 14l3.1-3.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M19.7 18.2 22.8 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M12.8 10.3v-2.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10.2 7.5h5.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12.8" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (ecosystemId === "google_workspace") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="5.5" y="8" width="21" height="15.5" rx="4" fill="currentColor" opacity="0.08" />
        <path d="M8.5 11.5h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
        <path d="m7.5 13.2 8.5 6 8.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 8V5.8M22 8V5.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19.5 7h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4.5" y="7" width="10.5" height="12" rx="3" fill="currentColor" opacity="0.18" />
      <rect x="17" y="13" width="10.5" height="12" rx="3" fill="currentColor" opacity="0.12" />
      <path d="M8.5 19.5v2.5l3-2.5h.8a2.7 2.7 0 0 0 2.7-2.7V10.7A2.7 2.7 0 0 0 12.3 8H7.2a2.7 2.7 0 0 0-2.7 2.7v6.1a2.7 2.7 0 0 0 2.7 2.7h1.3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.2 25v2.5l3-2.5h1.5a2.8 2.8 0 0 0 2.8-2.8v-5.4a2.8 2.8 0 0 0-2.8-2.8h-4.9a2.8 2.8 0 0 0-2.8 2.8v5.4a2.8 2.8 0 0 0 2.8 2.8h.4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
