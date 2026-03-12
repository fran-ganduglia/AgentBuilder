"use client";

import Link from "next/link";
import { AgentConnectionPanel } from "@/components/agents/agent-connection-panel";
import { AgentForm } from "@/components/agents/agent-form";
import { AgentToolsPanel } from "@/components/agents/agent-tools-panel";
import type { AgentFormErrors, AgentFormFields } from "@/components/agents/agent-form-shared";
import type { AgentConnectionSummary } from "@/lib/agents/connection-policy";
import type { AgentConnection, Role } from "@/types/app";

type AgentDetailConfigPanelProps = {
  agentId: string;
  connection: AgentConnection | null;
  connectionSummary: AgentConnectionSummary;
  fields: AgentFormFields;
  errors: AgentFormErrors;
  userRole: Role;
  qaProposalSummary: string | null;
  qaRecommendations: string[];
  salesforceIntegrationNotice: {
    title: string;
    message: string;
    tone: "emerald" | "amber" | "rose" | "slate";
    href: string;
    label: string;
  } | null;
  onChange: <K extends keyof AgentFormFields>(field: K, value: AgentFormFields[K]) => void;
};

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
  onChange,
}: AgentDetailConfigPanelProps) {
  return (
    <section className="space-y-6">
      {salesforceIntegrationNotice ? (
        <div className={`rounded-[1.75rem] border p-6 shadow-sm ${salesforceIntegrationNotice.tone === "rose" ? "border-rose-200 bg-rose-50" : salesforceIntegrationNotice.tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Integracion Salesforce pendiente</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{salesforceIntegrationNotice.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{salesforceIntegrationNotice.message}</p>
          {salesforceIntegrationNotice.href.startsWith("/") ? (
            <Link
              href={salesforceIntegrationNotice.href}
              className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              {salesforceIntegrationNotice.label}
            </Link>
          ) : (
            <a
              href={salesforceIntegrationNotice.href}
              className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              {salesforceIntegrationNotice.label}
            </a>
          )}
        </div>
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

      <AgentToolsPanel agentId={agentId} canEdit={userRole === "admin" || userRole === "editor"} />

      {qaProposalSummary ? (
        <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Propuesta QA cargada en sesion</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{qaProposalSummary}</p>
          {qaRecommendations.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {qaRecommendations.map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700 ring-1 ring-inset ring-sky-200">{item}</span>
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




