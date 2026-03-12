import { z } from "zod";

const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

export const chatPreviewConfigSchema = z.object({
  systemPrompt: z.string().min(1, "El system prompt es requerido").max(20000, "El system prompt es demasiado largo"),
  llmModel: z.string().min(1, "El modelo es requerido").max(100, "El modelo es demasiado largo"),
  llmTemperature: z.number().min(0, "Temperatura invalida").max(1, "Temperatura invalida"),
  maxTokens: z.number().int().min(1, "maxTokens invalido").max(4000, "maxTokens invalido").optional(),
});

export const qaDraftProposalSchema = z.object({
  summary: z.string().min(1, "El resumen es requerido").max(2000, "El resumen es demasiado largo"),
  suggestedSystemPrompt: z.string().min(1, "El prompt sugerido es requerido").max(20000, "El prompt sugerido es demasiado largo"),
  recommendations: z.array(z.string().min(1).max(300)).max(8).default([]),
  conversationId: z.string().uuid("conversationId invalido"),
  createdAt: z.string().datetime(),
});

const chatPreviewSessionSchema = z.object({
  config: chatPreviewConfigSchema,
  createdAt: z.string().datetime(),
  label: z.string().max(120).optional(),
});

export type ChatPreviewConfig = z.infer<typeof chatPreviewConfigSchema>;
export type QaDraftProposal = z.infer<typeof qaDraftProposalSchema>;
export type ChatPreviewSession = z.infer<typeof chatPreviewSessionSchema>;

function getPreviewKey(agentId: string): string {
  return `agentbuilder:chat-preview:${agentId}`;
}

function getProposalKey(agentId: string): string {
  return `agentbuilder:qa-proposal:${agentId}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isFresh(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= MAX_SESSION_AGE_MS;
}

export function saveChatPreviewSession(agentId: string, config: ChatPreviewConfig, label?: string): void {
  if (!isBrowser()) {
    return;
  }

  const payload: ChatPreviewSession = {
    config,
    createdAt: new Date().toISOString(),
    ...(label ? { label } : {}),
  };

  window.sessionStorage.setItem(getPreviewKey(agentId), JSON.stringify(payload));
}

export function loadChatPreviewSession(agentId: string): ChatPreviewSession | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(getPreviewKey(agentId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = chatPreviewSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !isFresh(parsed.data.createdAt)) {
      window.sessionStorage.removeItem(getPreviewKey(agentId));
      return null;
    }

    return parsed.data;
  } catch {
    window.sessionStorage.removeItem(getPreviewKey(agentId));
    return null;
  }
}

export function clearChatPreviewSession(agentId: string): void {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(getPreviewKey(agentId));
}

export function saveQaDraftProposal(agentId: string, proposal: QaDraftProposal): void {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(getProposalKey(agentId), JSON.stringify(proposal));
}

export function consumeQaDraftProposal(agentId: string): QaDraftProposal | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(getProposalKey(agentId));
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(getProposalKey(agentId));

  try {
    const parsed = qaDraftProposalSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !isFresh(parsed.data.createdAt)) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}
