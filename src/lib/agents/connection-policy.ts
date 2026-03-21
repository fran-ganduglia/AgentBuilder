import type { AgentConnection, AgentStatus } from "@/types/app";

export type AgentConnectionClassification =
  | "local"
  | "channel_connected";

export type AgentConnectionSummary = {
  hasConnection: boolean;
  providerType: string | null;
  classification: AgentConnectionClassification;
  label: string;
};

type ProviderTypeCarrier = Pick<AgentConnection, "provider_type"> | null;

export function classifyAgentConnection(
  connection: ProviderTypeCarrier
): AgentConnectionClassification {
  if (!connection) {
    return "local";
  }

  if (connection.provider_type === "openai") {
    return "local";
  }

  if (connection.provider_type === "whatsapp") {
    return "channel_connected";
  }

  return "local";
}

export function buildAgentConnectionSummary(
  connection: ProviderTypeCarrier
): AgentConnectionSummary {
  const classification = classifyAgentConnection(connection);

  if (classification === "channel_connected") {
    return {
      hasConnection: true,
      providerType: connection?.provider_type ?? null,
      classification,
      label: "WhatsApp conectado",
    };
  }

  return {
    hasConnection: false,
    providerType: null,
    classification,
    label: "Modo local",
  };
}

export function canUseSandboxForConnection(
  _summary: AgentConnectionSummary
): boolean {
  void _summary;
  return true;
}

export function canUseLiveLocalChat(
  summary: AgentConnectionSummary,
  status: AgentStatus
): boolean {
  return summary.classification === "local" && status === "active";
}

export function canAccessQaPanel(
  summary: AgentConnectionSummary,
  status: AgentStatus
): boolean {
  return summary.classification === "channel_connected" || status === "active";
}

export function isRemoteManagedConnection(
  _summary: AgentConnectionSummary
): boolean {
  void _summary;
  return false;
}

export function isChannelConnectedAgent(
  summary: AgentConnectionSummary
): boolean {
  return summary.classification === "channel_connected";
}
