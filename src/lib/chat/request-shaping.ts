import type { ChatMessage, ToolDefinition } from "@/lib/llm/litellm-types";
import type { ConversationMetadata } from "@/lib/chat/conversation-metadata";
import { buildInteractiveMarkersGuidance } from "@/lib/chat/interactive-markers";
import type { ChatQuickActionProvider } from "@/lib/chat/quick-actions";
import type { PromptVariant } from "@/lib/agents/prompt-compiler";
import type { SystemPromptProfile } from "@/lib/agents/effective-prompt";
import { generateEmbedding } from "@/lib/llm/embeddings";
import { searchChunks, type RetrievedChunk } from "@/lib/db/rag";

const MAX_PROMPT_TOKENS = 8000;
const AMBIGUOUS_TOOL_RESPONSE_MAX_TOKENS = 700;
const KNOWLEDGE_RESPONSE_MAX_TOKENS = 1000;
const TOOL_HISTORY_BUDGET_TOKENS = 2200;
const KNOWLEDGE_HISTORY_BUDGET_TOKENS = 3200;
const TOOL_RAG_CHUNKS = 2;
const KNOWLEDGE_RAG_CHUNKS = 3;
const TOOL_RAG_MAX_CHARS = 500;
const KNOWLEDGE_RAG_MAX_CHARS = 700;
const RAG_SIMILARITY_THRESHOLD = 0.7;

type ToolSurface = "gmail" | "google_calendar" | "google_sheets" | "salesforce";
type ToolSelectionReason = "knowledge_only" | "single_surface" | "multi_surface" | "fallback_all";
type TurnIntent = "knowledge" | "tool_ambiguous" | "general";

export type RagMode = "off" | "on";

export type RequestShapingResult = {
  systemPrompt: string;
  messages: ChatMessage[];
  selectedToolDefinitions: ToolDefinition[];
  selectedSurfaces: ToolSurface[];
  toolSelectionReason: ToolSelectionReason;
  ragMode: RagMode;
  ragMaxChunks: number;
  ragMaxCharsPerChunk: number;
  effectiveMaxTokens: number;
  intent: TurnIntent;
  observability: {
    promptVariant: PromptVariant;
    systemPromptProfile: SystemPromptProfile;
    totalToolDefinitions: number;
    selectedToolDefinitions: number;
    selectedSurfaces: ToolSurface[];
    toolSelectionReason: ToolSelectionReason;
    ragMode: RagMode;
    effectiveMaxTokens: number;
    systemPromptChars: number;
    systemPromptTokensApprox: number;
    compactCandidateTokensApprox: number | null;
    promptTokenDeltaApprox: number | null;
    historyMessages: number;
    historyTokensApprox: number;
    matchedCapabilityId?: string | null;
    candidateCapabilityIds?: string[];
    graphTrace?: Array<{ stage: string; transition: string; detail: string }>;
    slotResolution?: {
      capabilityId: string;
      confidence: number;
      missingFields: string[];
      resolvedFromContext: string[];
    } | null;
    transitionPath?: string[];
    exitReason?: string | null;
  };
};

export type ShapedRagContextResult = {
  context?: string;
  chunksUsed: number;
  charsUsed: number;
};

function estimateTokens(value: string): number {
  return Math.ceil(value.trim().length / 4);
}

function estimateMessageTokens(message: ChatMessage): number {
  const base =
    "content" in message && typeof message.content === "string"
      ? estimateTokens(message.content)
      : 0;
  const toolCalls =
    "tool_calls" in message && Array.isArray(message.tool_calls)
      ? message.tool_calls.reduce(
          (sum, toolCall) =>
            sum +
            estimateTokens(toolCall.function.name) +
            estimateTokens(toolCall.function.arguments),
          0
        )
      : 0;
  return base + toolCalls + 12;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function detectKnowledgeIntent(normalizedMessage: string): boolean {
  return includesAny(normalizedMessage, [
    "documento",
    "documentacion",
    "docs",
    "manual",
    "politica",
    "policy",
    "procedimiento",
    "contrato",
    "pdf",
    "archivo",
    "contexto interno",
    "segun",
    "según",
    "base de conocimiento",
  ]);
}

function detectLongFormIntent(normalizedMessage: string): boolean {
  return includesAny(normalizedMessage, [
    "resume",
    "resumi",
    "sintesis",
    "analiza",
    "explica",
    "paso a paso",
    "propuesta",
    "borrador largo",
    "redacta",
    "genera un plan",
  ]);
}

function detectOperationalCue(normalizedMessage: string): boolean {
  return includesAny(normalizedMessage, [
    "busca",
    "buscar",
    "encuentra",
    "listar",
    "muestra",
    "ver",
    "leer",
    "consulta",
    "trae",
    "crea",
    "crear",
    "envia",
    "manda",
    "actualiza",
    "edita",
    "modifica",
    "reprograma",
    "mueve",
    "agrega",
    "append",
    "borra",
    "elimina",
    "limpia",
    "archiva",
    "cancela",
  ]);
}

function buildCompactInteractionGuidance(selectedSurfaces: ToolSurface[]): string | null {
  if (selectedSurfaces.length === 0) {
    return null;
  }

  const markerGuidance = buildInteractiveMarkersGuidance(
    selectedSurfaces as ChatQuickActionProvider[]
  );
  const compactPolicy = [
    "INTERACTIVE_POLICY",
    "- Conserva los markers existentes y usalos tambien para formularios y chips.",
    "- Si la accion esta clara pero faltan datos, termina con un unico FORM_DATA y no pidas esos datos en texto libre.",
    "- Conserva cualquier valor ya conocido y pide solo lo minimo que falta.",
    "- Si la accion sigue ambigua, pide una aclaracion breve sin formulario.",
  ].join("\n");

  return [markerGuidance, compactPolicy]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function trimMessagesToBudgetWithLimit(
  messages: ChatMessage[],
  budgetTokens: number,
  maxMessages?: number
): ChatMessage[] {
  const reversed = [...messages].reverse();
  const selected: ChatMessage[] = [];
  let usedTokens = 0;

  for (const message of reversed) {
    if (typeof maxMessages === "number" && selected.length >= maxMessages) {
      break;
    }

    const messageTokens = estimateMessageTokens(message);
    if (selected.length > 0 && usedTokens + messageTokens > budgetTokens) {
      continue;
    }

    selected.push(message);
    usedTokens += messageTokens;
  }

  return selected.reverse();
}

function deriveSurfacesFromToolNames(toolDefinitions: ToolDefinition[]): ToolSurface[] {
  const surfaces = new Set<ToolSurface>();
  for (const tool of toolDefinitions) {
    const name = tool.function.name;
    if (name.startsWith("gmail_")) surfaces.add("gmail");
    else if (name.startsWith("google_calendar_")) surfaces.add("google_calendar");
    else if (name.startsWith("google_sheets_")) surfaces.add("google_sheets");
    else if (name.startsWith("salesforce_")) surfaces.add("salesforce");
  }
  return [...surfaces];
}

function selectOperationalSlice(input: {
  toolDefinitions: ToolDefinition[];
  latestUserMessage: string;
  hasReadyDocuments: boolean;
}) {
  const availableSurfaces = deriveSurfacesFromToolNames(input.toolDefinitions);
  const normalizedMessage = normalizeText(input.latestUserMessage);
  const knowledgeIntent = detectKnowledgeIntent(normalizedMessage);

  if (availableSurfaces.length === 0) {
    return {
      selectedToolDefinitions: [] as ToolDefinition[],
      selectedSurfaces: [] as ToolSurface[],
      reason: "knowledge_only" as const,
      intent: knowledgeIntent && input.hasReadyDocuments ? ("knowledge" as const) : ("general" as const),
    };
  }

  // Request claramente de conocimiento sin cue operacional → knowledge mode sin tools
  if (knowledgeIntent && input.hasReadyDocuments && !detectOperationalCue(normalizedMessage)) {
    return {
      selectedToolDefinitions: [] as ToolDefinition[],
      selectedSurfaces: [] as ToolSurface[],
      reason: "knowledge_only" as const,
      intent: "knowledge" as const,
    };
  }

  // Con tools disponibles, pasar todas al planner — el planner decide si la request
  // es operativa o no. Confiamos en el planner como árbitro (confidence threshold 0.75).
  return {
    selectedToolDefinitions: input.toolDefinitions,
    selectedSurfaces: availableSurfaces,
    reason: "fallback_all" as const,
    intent: "tool_ambiguous" as const,
  };
}


export function shapeAgentTurnRequest(input: {
  effectivePrompt: string;
  promptVariant?: PromptVariant;
  systemPromptProfile?: SystemPromptProfile;
  compactPromptCandidate?: string | null;
  latestUserMessage: string;
  messages: ChatMessage[];
  toolDefinitions: ToolDefinition[];
  conversationMetadata: ConversationMetadata;
  defaultMaxTokens: number;
  hasReadyDocuments: boolean;
}): RequestShapingResult {
  const normalizedLatestUserMessage = normalizeText(input.latestUserMessage);
  const selection = selectOperationalSlice({
    toolDefinitions: input.toolDefinitions,
    latestUserMessage: input.latestUserMessage,
    hasReadyDocuments: input.hasReadyDocuments,
  });

  const ragMode: RagMode =
    selection.intent === "tool_ambiguous"
      ? "off"
      : input.hasReadyDocuments
        ? "on"
        : "off";
  const ragMaxChunks = selection.intent === "knowledge" ? KNOWLEDGE_RAG_CHUNKS : TOOL_RAG_CHUNKS;
  const ragMaxCharsPerChunk =
    selection.intent === "knowledge" ? KNOWLEDGE_RAG_MAX_CHARS : TOOL_RAG_MAX_CHARS;
  const effectiveMaxTokens =
    selection.intent === "tool_ambiguous"
      ? Math.min(input.defaultMaxTokens, AMBIGUOUS_TOOL_RESPONSE_MAX_TOKENS)
      : selection.intent === "knowledge" || detectLongFormIntent(normalizedLatestUserMessage)
        ? Math.min(input.defaultMaxTokens, KNOWLEDGE_RESPONSE_MAX_TOKENS)
        : input.defaultMaxTokens;
  const guidance = buildCompactInteractionGuidance(selection.selectedSurfaces);
  const systemPrompt = [input.effectivePrompt, guidance]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  const compactCandidateSystemPrompt =
    input.promptVariant === "full" && input.compactPromptCandidate
      ? [input.compactPromptCandidate, guidance]
          .filter((value): value is string => Boolean(value))
          .join("\n\n")
      : null;
  const systemPromptTokens = estimateTokens(systemPrompt);
  const compactCandidateTokens = compactCandidateSystemPrompt
    ? estimateTokens(compactCandidateSystemPrompt)
    : null;
  const selectedToolDefinitions = selection.selectedToolDefinitions;
  const historyBudget = Math.max(
    400,
    Math.min(
      selection.intent === "tool_ambiguous"
        ? TOOL_HISTORY_BUDGET_TOKENS
        : KNOWLEDGE_HISTORY_BUDGET_TOKENS,
      MAX_PROMPT_TOKENS -
        systemPromptTokens -
        effectiveMaxTokens -
        (ragMode === "on" ? ragMaxChunks * Math.ceil(ragMaxCharsPerChunk / 4) : 0) -
        800
    )
  );
  const messages = trimMessagesToBudgetWithLimit(input.messages, historyBudget);
  const historyTokensApprox = messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0
  );

  return {
    systemPrompt,
    messages,
    selectedToolDefinitions,
    selectedSurfaces: selection.selectedSurfaces,
    toolSelectionReason: selection.reason,
    ragMode,
    ragMaxChunks,
    ragMaxCharsPerChunk,
    effectiveMaxTokens,
    intent: selection.intent,
    observability: {
      promptVariant: input.promptVariant ?? "full",
      systemPromptProfile:
        input.systemPromptProfile ??
        ((input.promptVariant ?? "full") === "compact" ? "compact_v2" : "full"),
      totalToolDefinitions: input.toolDefinitions.length,
      selectedToolDefinitions: selectedToolDefinitions.length,
      selectedSurfaces: selection.selectedSurfaces,
      toolSelectionReason: selection.reason,
      ragMode,
      effectiveMaxTokens,
      systemPromptChars: systemPrompt.length,
      systemPromptTokensApprox: systemPromptTokens,
      compactCandidateTokensApprox: compactCandidateTokens,
      promptTokenDeltaApprox:
        compactCandidateTokens === null ? null : systemPromptTokens - compactCandidateTokens,
      historyMessages: messages.length,
      historyTokensApprox,
    },
  };
}

function formatCompactRagContext(chunks: RetrievedChunk[], maxCharsPerChunk: number): string {
  return chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.content.trim().slice(0, maxCharsPerChunk)}`)
    .join("\n\n");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedio el tiempo maximo`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function buildShapedRagContext(input: {
  agentId: string;
  organizationId: string;
  latestUserMessage: string;
  ragMode: RagMode;
  hasReadyDocuments: boolean;
  maxChunks: number;
  maxCharsPerChunk: number;
  timeoutMs: number;
  logLabel: string;
}): Promise<ShapedRagContextResult> {
  if (input.ragMode === "off" || !input.hasReadyDocuments) {
    return { context: undefined, chunksUsed: 0, charsUsed: 0 };
  }

  try {
    return await withTimeout(
      (async () => {
        const embedding = await generateEmbedding(input.latestUserMessage);
        const chunks = await searchChunks(
          input.organizationId,
          input.agentId,
          embedding,
          input.maxChunks,
          RAG_SIMILARITY_THRESHOLD
        );

        if (chunks.length === 0) {
          return { context: undefined, chunksUsed: 0, charsUsed: 0 };
        }

        const context = formatCompactRagContext(chunks, input.maxCharsPerChunk);
        return {
          context,
          chunksUsed: chunks.length,
          charsUsed: chunks.reduce(
            (sum, chunk) =>
              sum + Math.min(chunk.content.trim().length, input.maxCharsPerChunk),
            0
          ),
        };
      })(),
      input.timeoutMs,
      input.logLabel
    );
  } catch (error) {
    console.error(`${input.logLabel}_error`, {
      agentId: input.agentId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { context: undefined, chunksUsed: 0, charsUsed: 0 };
  }
}
