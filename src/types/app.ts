import type { Tables } from "./database";

// ---------------------------------------------------------------------------
// Alias de fila por tabla — usar estos en toda la app
// ---------------------------------------------------------------------------
export type Agent = Tables<"agents">;
export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Organization = Tables<"organizations">;
export type UserProfile = Tables<"users">;
export type Plan = Tables<"plans">;
export type Notification = Tables<"notifications">;

// ---------------------------------------------------------------------------
// Tipos de dominio propios (no mapeados 1:1 a la DB)
// ---------------------------------------------------------------------------
export type Role = "admin" | "editor" | "viewer" | "operador";

export type AgentStatus = "draft" | "active" | "paused" | "archived";

export type ConversationStatus = "active" | "closed" | "error";

export type Channel = "web" | "whatsapp" | "email" | "api";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: Role;
};
