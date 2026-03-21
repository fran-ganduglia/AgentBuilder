import assert from "node:assert/strict";
import { shapeAgentTurnRequest } from "./request-shaping";
import type { ChatMessage, ToolDefinition } from "@/lib/llm/litellm-types";

function createTool(name: string): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: name,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  };
}

function runSingleSurfaceChecks(): void {
  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt con mas contexto operativo para representar el variant full",
    promptVariant: "full",
    compactPromptCandidate: "Prompt compacto",
    latestUserMessage: "Busca el ultimo mail de ana@example.com y resumelo",
    messages: [{ role: "user", content: "Busca el ultimo mail de ana@example.com y resumelo" }],
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("gmail_read_thread"),
      createTool("google_sheets_append_rows"),
      createTool("salesforce_lookup_records"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: true,
  });

  assert.deepEqual(result.selectedSurfaces, ["gmail"]);
  assert.equal(result.toolSelectionReason, "single_surface");
  assert.equal(result.ragMode, "off");
  assert.equal(result.effectiveMaxTokens, 600);
  assert.ok(result.selectedToolDefinitions.every((tool) => tool.function.name.startsWith("gmail_")));
  assert.ok(result.systemPrompt.includes("INTERACTIVE_MARKERS"));
  assert.ok(result.systemPrompt.includes("FORM_DATA"));
  assert.equal(result.observability.promptVariant, "full");
  assert.equal(result.observability.systemPromptProfile, "full");
  assert.ok((result.observability.compactCandidateTokensApprox ?? 0) > 0);
  assert.ok((result.observability.promptTokenDeltaApprox ?? 0) > 0);
}

function runKnowledgeChecks(): void {
  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt",
    promptVariant: "compact",
    latestUserMessage: "Segun la documentacion interna, cual es la policy de aprobaciones?",
    messages: [{ role: "user", content: "Segun la documentacion interna, cual es la policy de aprobaciones?" }],
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("google_calendar_list_events"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: true,
  });

  assert.equal(result.selectedToolDefinitions.length, 0);
  assert.equal(result.toolSelectionReason, "knowledge_only");
  assert.equal(result.ragMode, "on");
  assert.equal(result.observability.promptVariant, "compact");
  assert.equal(result.observability.systemPromptProfile, "compact_v2");
  assert.equal(result.observability.compactCandidateTokensApprox, null);
  assert.equal(result.observability.promptTokenDeltaApprox, null);
}

function runCompactGuidanceChecks(): void {
  const result = shapeAgentTurnRequest({
    effectivePrompt: "Prompt compacto",
    promptVariant: "compact",
    systemPromptProfile: "compact_v2",
    latestUserMessage: "Busca el ultimo mail y si falta algo pedime los datos",
    messages: [{ role: "user", content: "Busca el ultimo mail y si falta algo pedime los datos" }],
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("gmail_read_thread"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: false,
  });

  assert.match(result.systemPrompt, /INTERACTIVE_POLICY/);
  assert.match(result.systemPrompt, /Conserva los markers existentes/i);
  assert.match(result.systemPrompt, /unico FORM_DATA/i);
}

function runAmbiguousChecks(): void {
  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt",
    latestUserMessage: "Revisa si tengo un mail o una reunion pendiente con Juan",
    messages: [{ role: "user", content: "Revisa si tengo un mail o una reunion pendiente con Juan" }],
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("google_calendar_list_events"),
      createTool("google_sheets_read_table"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: false,
  });

  assert.equal(result.ragMode, "off");
  assert.ok(result.selectedSurfaces.includes("gmail"));
  assert.ok(result.selectedSurfaces.includes("google_calendar"));
  assert.ok(result.selectedToolDefinitions.length >= 2);
}

function runHistoryTrimChecks(): void {
  const messages: ChatMessage[] = Array.from({ length: 30 }, (_, index) => ({
    role: "user" as const,
    content: `Mensaje ${index} `.repeat(60),
  }));

  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt",
    latestUserMessage: "Actualiza la hoja con una fila nueva",
    messages,
    toolDefinitions: [
      createTool("google_sheets_append_rows"),
      createTool("google_sheets_update_range"),
      createTool("google_sheets_read_table"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: false,
  });

  assert.ok(result.messages.length < messages.length);
  assert.ok(result.messages.at(-1));
}

function runLowComplexityReadHistoryCapChecks(): void {
  const messages: ChatMessage[] = Array.from({ length: 20 }, (_, index) => ({
    role: "user" as const,
    content: `Mensaje Gmail ${index} `.repeat(50),
  }));

  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt",
    promptVariant: "compact",
    systemPromptProfile: "compact_v2",
    latestUserMessage: "Busca el ultimo mail de ana@example.com y resumelo",
    messages,
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("gmail_read_thread"),
      createTool("gmail_create_draft_reply"),
      createTool("gmail_create_draft_email"),
      createTool("gmail_archive_thread"),
      createTool("gmail_apply_label"),
      createTool("gmail_send_reply"),
      createTool("gmail_send_email"),
    ],
    conversationMetadata: {},
    defaultMaxTokens: 1000,
    hasReadyDocuments: false,
  });

  assert.ok(result.messages.length <= 8);
  assert.equal(result.selectedSurfaces[0], "gmail");
  assert.equal(result.intent, "tool_clear");
  assert.deepEqual(
    result.selectedToolDefinitions.map((tool) => tool.function.name),
    ["gmail_search_threads", "gmail_read_thread"]
  );
}

function runReferentialFollowUpChecks(): void {
  const result = shapeAgentTurnRequest({
    effectivePrompt: "Base prompt",
    latestUserMessage: "El ultimo que me enviaron",
    messages: [
      { role: "user", content: "Lee mi ultimo mail" },
      { role: "assistant", content: "Necesito que me indiques exactamente que hilo de Gmail quieres leer." },
      { role: "user", content: "El ultimo que me enviaron" },
    ],
    toolDefinitions: [
      createTool("gmail_search_threads"),
      createTool("gmail_read_thread"),
      createTool("google_sheets_read_table"),
      createTool("google_sheets_append_rows"),
    ],
    conversationMetadata: {
      pending_chat_form: {
        surface: "google_sheets",
        missingFields: ["spreadsheetId"],
      },
    },
    defaultMaxTokens: 1000,
    hasReadyDocuments: false,
  });

  assert.deepEqual(result.selectedSurfaces, ["gmail"]);
  assert.equal(result.toolSelectionReason, "single_surface");
  assert.deepEqual(
    result.selectedToolDefinitions.map((tool) => tool.function.name),
    ["gmail_search_threads", "gmail_read_thread"]
  );
}

function run(): void {
  runSingleSurfaceChecks();
  runKnowledgeChecks();
  runCompactGuidanceChecks();
  runAmbiguousChecks();
  runHistoryTrimChecks();
  runLowComplexityReadHistoryCapChecks();
  runReferentialFollowUpChecks();
  console.log("request-shaping checks passed");
}

run();
