"use client";

import { useState } from "react";
import type { GoogleSurface } from "@/lib/integrations/google-scopes";
import type { GoogleSurfaceOperationalView } from "@/lib/integrations/google-workspace";
import { getMetadataString, type IntegrationOperationalView } from "@/lib/integrations/metadata";
import type { Integration } from "@/types/app";
import type { WhatsAppConnectionView } from "@/lib/agents/whatsapp-connection";
import { WhatsAppConnectionForm } from "@/components/settings/whatsapp-connection-form";
import { SalesforceConnectionForm } from "@/components/settings/salesforce-connection-form";
import { GoogleWorkspaceConnectionForm } from "@/components/settings/google-workspace-connection-form";
import {
  AccordionItem,
  IconComunicacion,
  IconCRM,
  IconGoogle,
  type EcosystemId,
  type EcosystemStatus,
} from "@/components/settings/integrations-accordion-primitives";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntegrationsAccordionProps = {
  whatsappConnection: WhatsAppConnectionView;
  whatsappIntegration: Integration | null;
  whatsappOperationalView: IntegrationOperationalView;
  salesforceIntegration: Integration | null;
  salesforceOperationalView: IntegrationOperationalView;
  salesforceMessage: string | null;
  salesforceStatus: "connected" | "error" | null;
  googleIntegration: Integration | null;
  gmailView: GoogleSurfaceOperationalView;
  calendarView: GoogleSurfaceOperationalView;
  sheetsView: GoogleSurfaceOperationalView;
  googleMessage: string | null;
  googleStatus: "connected" | "error" | null;
  googleSurface: GoogleSurface | null;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function resolveStatus(views: IntegrationOperationalView[]): EcosystemStatus {
  const connected = views.filter(
    (v) => v.status === "connected" || v.status === "expiring_soon"
  ).length;
  if (connected === views.length) return "conectado";
  if (connected > 0) return "parcial";
  return "sin_conexion";
}

function resolveGoogleStatus(views: GoogleSurfaceOperationalView[]): EcosystemStatus {
  const connected = views.filter((v) => v.isUsable).length;
  if (connected === views.length) return "conectado";
  if (connected > 0) return "parcial";
  return "sin_conexion";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntegrationsAccordion({
  whatsappConnection,
  whatsappIntegration,
  whatsappOperationalView,
  salesforceIntegration,
  salesforceOperationalView,
  salesforceMessage,
  salesforceStatus,
  googleIntegration,
  gmailView,
  calendarView,
  sheetsView,
  googleMessage,
  googleStatus,
  googleSurface,
}: IntegrationsAccordionProps) {
  const [openSections, setOpenSections] = useState<Set<EcosystemId>>(new Set());

  function toggle(id: EcosystemId) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <AccordionItem
        id="comunicacion"
        icon={<IconComunicacion />}
        title="Comunicacion"
        description="Canales de mensajeria para agentes conversacionales"
        status={resolveStatus([whatsappOperationalView])}
        isOpen={openSections.has("comunicacion")}
        onToggle={toggle}
      >
        <WhatsAppConnectionForm
          initialName={whatsappConnection.initialName}
          initialWabaId={whatsappConnection.initialWabaId}
          isConnected={Boolean(whatsappIntegration?.is_active)}
          accessTokenHint={whatsappConnection.accessTokenHint}
          integrationId={whatsappIntegration?.id ?? null}
          operationalView={whatsappOperationalView}
        />
      </AccordionItem>

      <AccordionItem
        id="crm"
        icon={<IconCRM />}
        title="CRM"
        description="Gestion de contactos, oportunidades y pipeline de ventas"
        status={resolveStatus([salesforceOperationalView])}
        isOpen={openSections.has("crm")}
        onToggle={toggle}
      >
        <SalesforceConnectionForm
          initialName={salesforceIntegration?.name ?? "Salesforce CRM"}
          integrationId={salesforceIntegration?.id ?? null}
          isConnected={Boolean(salesforceIntegration?.is_active)}
          operationalView={salesforceOperationalView}
          instanceUrl={getMetadataString(salesforceIntegration?.metadata ?? null, "instance_url")}
          grantedScopes={salesforceOperationalView.grantedScopes}
          callbackMessage={salesforceMessage}
          callbackStatus={salesforceStatus}
        />
      </AccordionItem>

      <AccordionItem
        id="google"
        icon={<IconGoogle />}
        title="Google Workspace"
        description="Gmail, Google Calendar y Google Sheets en una sola integracion"
        status={resolveGoogleStatus([gmailView, calendarView, sheetsView])}
        isOpen={openSections.has("google")}
        onToggle={toggle}
      >
        <GoogleWorkspaceConnectionForm
          integrationId={googleIntegration?.id ?? null}
          gmailView={gmailView}
          calendarView={calendarView}
          sheetsView={sheetsView}
          callbackMessage={googleMessage}
          callbackStatus={googleStatus}
          callbackSurface={googleSurface}
        />
      </AccordionItem>
    </div>
  );
}
