import type { Tables } from "./database";

// ---------------------------------------------------------------------------
// Alias de fila por tabla — usar estos en toda la app
// ---------------------------------------------------------------------------
export type Agent = Tables<"agents">;
export type AgentConnection = Tables<"agent_connections">;
export type ApprovalItem = Tables<"approval_items">;
export type Conversation = Tables<"conversations">;
export type Integration = Tables<"integrations">;
export type Message = Tables<"messages">;
export type Notification = Tables<"notifications">;
export type Organization = Tables<"organizations">;
export type Plan = Tables<"plans">;
export type ProviderBudgetAllocation = Tables<"provider_budget_allocations">;
export type UserProfile = Tables<"users">;
export type WorkflowRun = Tables<"workflow_runs">;
export type WorkflowStep = Tables<"workflow_steps">;

// ---------------------------------------------------------------------------
// Tipos de dominio propios (no mapeados 1:1 a la DB)
// ---------------------------------------------------------------------------
export type Role = "admin" | "editor" | "viewer" | "operador";

export type AgentStatus = "draft" | "active" | "paused" | "archived";

export type AgentConnectionSyncStatus =
  | "connected"
  | "syncing"
  | "error"
  | "disconnected";

export type ConversationStatus = "active" | "closed" | "error";

export type Channel = "web" | "whatsapp" | "email" | "api";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: Role;
};

