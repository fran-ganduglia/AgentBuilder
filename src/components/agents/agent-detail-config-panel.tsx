"use client";

import Link from "next/link";
import { AgentConnectionPanel } from "@/components/agents/agent-connection-panel";
import { AgentForm } from "@/components/agents/agent-form";
import type { AgentFormErrors, AgentFormFields } from "@/components/agents/agent-form-shared";
import { AgentToolsPanel } from "@/components/agents/agent-tools-panel";
import { GmailAgentToolsPanel } from "@/components/agents/gmail-agent-tools-panel";
import { GoogleCalendarAgentToolsPanel } from "@/components/agents/google-calendar-agent-tools-panel";
import { HubSpotAgentToolsPanel } from "@/components/agents/hubspot-agent-tools-panel";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";
import type { AgentConnection, Role } from "@/types/app";

type IntegrationNotice = {
  title: string;
  message: string;
  tone: "emerald" | "amber" | "rose" | "slate";
  href: string;
  label: string;
};

type AgentDetailConfigPanelProps = {
  agentId: string;
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  fields: AgentFormFields;
  errors: AgentFormErrors;
  userRole: Role;
  qaProposalSummary: string | null;
  qaRecommendations: string[];
  salesforceIntegrationNotice: IntegrationNotice | null;
  hubspotIntegrationNotice: IntegrationNotice | null;
  gmailIntegrationNotice: IntegrationNotice | null;
  googleCalendarIntegrationNotice: IntegrationNotice | null;
  onChange: <K extends keyof AgentFormFields>(field: K, value: AgentFormFields[K]) => void;
};

function IntegrationNoticeCard(input: {
  eyebrow: string;
  notice: IntegrationNotice;
}) {
  const toneClassName =
    input.notice.tone === "rose"
      ? "border-rose-200 bg-rose-50"
      : input.notice.tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : input.notice.tone === "emerald"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-[1.75rem] border p-6 shadow-sm ${toneClassName}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{input.eyebrow}</p>
      <h3 className="mt-2 text-lg font-bold text-slate-900">{input.notice.title}</h3>
      <p className="mt-2 text-sm text-slate-600">{input.notice.message}</p>
      {input.notice.href.startsWith("/") ? (
        <Link
          href={input.notice.href}
          className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          {input.notice.label}
        </Link>
      ) : (
        <a
          href={input.notice.href}
          className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          {input.notice.label}
        </a>
      )}
    </div>
  );
}

export function AgentDetailConfigPanel({
  agentId,
  connection,
  connectionSummary,
  fields,
  errors,
  userRole,
  qaProposalSummary,
  qaRecommendations,
  salesforceIntegrationNotice,
  hubspotIntegrationNotice,
  gmailIntegrationNotice,
  googleCalendarIntegrationNotice,
  onChange,
}: AgentDetailConfigPanelProps) {
  const canEditTools = userRole === "admin" || userRole === "editor";

  return (
    <section className="space-y-6">
      {salesforceIntegrationNotice ? (
        <IntegrationNoticeCard
          eyebrow="Integracion Salesforce pendiente"
          notice={salesforceIntegrationNotice}
        />
      ) : null}

      {hubspotIntegrationNotice ? (
        <IntegrationNoticeCard
          eyebrow="Integracion HubSpot pendiente"
          notice={hubspotIntegrationNotice}
        />
      ) : null}

      {gmailIntegrationNotice ? (
        <IntegrationNoticeCard
          eyebrow="Integracion Gmail pendiente"
          notice={gmailIntegrationNotice}
        />
      ) : null}

      {googleCalendarIntegrationNotice ? (
        <IntegrationNoticeCard
          eyebrow="Google Calendar en chat web"
          notice={googleCalendarIntegrationNotice}
        />
      ) : null}

      {connection ? (
        <AgentConnectionPanel
          agentId={agentId}
          connection={connection}
          connectionSummary={connectionSummary}
          canResync={userRole === "admin" && connectionSummary.classification === "remote_managed"}
          showSensitiveDetails={userRole === "admin"}
        />
      ) : null}

      <AgentToolsPanel agentId={agentId} canEdit={canEditTools} />
      <HubSpotAgentToolsPanel agentId={agentId} canEdit={canEditTools} />
      <GmailAgentToolsPanel agentId={agentId} canEdit={canEditTools} />
      <GoogleCalendarAgentToolsPanel agentId={agentId} canEdit={canEditTools} />

      {qaProposalSummary ? (
        <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Propuesta QA cargada en sesion</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{qaProposalSummary}</p>
          {qaRecommendations.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {qaRecommendations.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700 ring-1 ring-inset ring-sky-200"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <AgentForm
        fields={fields}
        errors={errors}
        connection={connection}
        connectionSummary={connectionSummary}
        userRole={userRole}
        onChange={onChange}
      />
    </section>
  );
}
