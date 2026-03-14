import "server-only";

import { resolveEffectiveAgentPrompt } from "@/lib/agents/effective-prompt";
import { readAgentSetupState } from "@/lib/agents/agent-setup-state";
import {
  isPendingToolActionExpired,
  readPendingCrmAction,
  createRecentCrmToolContext,
  readRecentCrmToolContext,
} from "@/lib/chat/conversation-metadata";
import { createPendingCrmAction } from "@/lib/chat/crm-pending-action";
import {
  planGoogleCalendarToolAction,
} from "@/lib/chat/google-calendar-tool-planner";
import { updateConversationMetadata } from "@/lib/db/conversations";
import {
  assertGoogleCalendarActionEnabled,
  assertGoogleCalendarRuntimeUsable,
  executeGoogleCalendarReadTool,
  formatGoogleCalendarReadResultForPrompt,
  type GoogleCalendarReadToolExecutionResult,
  toGoogleCalendarRuntimeSafeError,
} from "@/lib/integrations/google-calendar-agent-runtime";
import { getGoogleAgentToolRuntime } from "@/lib/integrations/google-agent-runtime";
import {
  resolveGoogleCalendarAgentTimezone,
  resolveGoogleCalendarIntegrationTimezone,
} from "@/lib/integrations/google-calendar-timezone";
import type { GoogleAgentToolRuntime } from "@/lib/integrations/google-agent-runtime";
import type {
  ExecuteGoogleCalendarToolInput,
  ExecuteGoogleCalendarWriteToolInput,
} from "@/lib/integrations/google-agent-tools";
import { createApprovalRequest } from "@/lib/workflows/approval-request";
import type { Agent, Conversation } from "@/types/app";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GoogleCalendarChatOrchestrationResult =
  | {
      kind: "continue";
      toolContext?: string;
      hasUsableGoogleCalendarRuntime: boolean;
    }
  | { kind: "respond_now"; content: string };

type GoogleCalendarChatOrchestratorDeps = {
  readAgentSetupState: typeof readAgentSetupState;
  resolveEffectiveAgentPrompt: typeof resolveEffectiveAgentPrompt;
  getGoogleAgentToolRuntime: typeof getGoogleAgentToolRuntime;
  assertGoogleCalendarRuntimeUsable: typeof assertGoogleCalendarRuntimeUsable;
  readRecentCrmToolContext: typeof readRecentCrmToolContext;
  isPendingToolActionExpired: typeof isPendingToolActionExpired;
  updateConversationMetadata: typeof updateConversationMetadata;
  planGoogleCalendarToolAction: typeof planGoogleCalendarToolAction;
  resolveGoogleCalendarAgentTimezone: typeof resolveGoogleCalendarAgentTimezone;
  resolveGoogleCalendarIntegrationTimezone: typeof resolveGoogleCalendarIntegrationTimezone;
  assertGoogleCalendarActionEnabled: typeof assertGoogleCalendarActionEnabled;
  executeGoogleCalendarReadTool: typeof executeGoogleCalendarReadTool;
  toGoogleCalendarRuntimeSafeError: typeof toGoogleCalendarRuntimeSafeError;
  formatGoogleCalendarReadResultForPrompt: typeof formatGoogleCalendarReadResultForPrompt;
  createRecentCrmToolContext: typeof createRecentCrmToolContext;
  readPendingCrmAction: typeof readPendingCrmAction;
  createPendingCrmAction: typeof createPendingCrmAction;
  createApprovalRequest: typeof createApprovalRequest;
};

function formatGoogleCalendarIso(
  value: string | null,
  timezone: string
): string {
  if (!value) {
    return "sin hora";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatResolvedEventReference(
  input: Pick<
    Extract<
      ExecuteGoogleCalendarWriteToolInput,
      { action: "reschedule_event" | "cancel_event" }
    >,
    "eventId" | "eventTitle" | "eventStartIso" | "eventEndIso" | "eventTimezone"
  >
): string {
  const timezone = input.eventTimezone ?? "UTC";
  const title = input.eventTitle ? `"${input.eventTitle}"` : `evento ${input.eventId}`;
  const hasWindow = input.eventStartIso && input.eventEndIso;

  if (!hasWindow) {
    return `${title} [id ${input.eventId}]`;
  }

  return `${title} (${formatGoogleCalendarIso(input.eventStartIso ?? null, timezone)} a ${formatGoogleCalendarIso(input.eventEndIso ?? null, timezone)} ${timezone}) [id ${input.eventId}]`;
}

function buildGoogleCalendarApprovalPayloadSummary(
  input: ExecuteGoogleCalendarToolInput
): {
  action: ExecuteGoogleCalendarToolInput["action"];
  action_input: ExecuteGoogleCalendarToolInput;
  resolved_event?: {
    id: string;
    title?: string;
    startIso?: string;
    endIso?: string;
    timezone?: string;
  };
} {
  if (input.action === "reschedule_event" || input.action === "cancel_event") {
    return {
      action: input.action,
      action_input: input,
      resolved_event: {
        id: input.eventId,
        ...(input.eventTitle ? { title: input.eventTitle } : {}),
        ...(input.eventStartIso ? { startIso: input.eventStartIso } : {}),
        ...(input.eventEndIso ? { endIso: input.eventEndIso } : {}),
        ...(input.eventTimezone ? { timezone: input.eventTimezone } : {}),
      },
    };
  }

  return {
    action: input.action,
    action_input: input,
  };
}

function buildDirectGoogleCalendarResponse(
  result: GoogleCalendarReadToolExecutionResult
): string {
  if (result.action === "list_events") {
    if (result.data.events.length === 0) {
      return `No encontre eventos entre ${formatGoogleCalendarIso(result.data.startIso, result.data.timezone)} y ${formatGoogleCalendarIso(result.data.endIso, result.data.timezone)} (${result.data.timezone}).`;
    }

    const lines = result.data.events.slice(0, 10).map((event) => {
      const title = event.title ?? "Evento sin titulo";
      const start = formatGoogleCalendarIso(event.startIso, result.data.timezone);
      const end = formatGoogleCalendarIso(event.endIso, result.data.timezone);
      return `- ${title}: ${start} a ${end}`;
    });

    return [
      `Encontre ${result.data.events.length} evento(s) entre ${formatGoogleCalendarIso(result.data.startIso, result.data.timezone)} y ${formatGoogleCalendarIso(result.data.endIso, result.data.timezone)} (${result.data.timezone}).`,
      ...lines,
    ].join("\n");
  }

  if (result.data.freeSlots.length === 0) {
    return `No encontre huecos libres de al menos ${result.data.slotMinutes} minutos entre ${formatGoogleCalendarIso(result.data.startIso, result.data.timezone)} y ${formatGoogleCalendarIso(result.data.endIso, result.data.timezone)} (${result.data.timezone}).`;
  }

  const freeSlotLines = result.data.freeSlots.slice(0, 10).map((slot) =>
    `- ${formatGoogleCalendarIso(slot.startIso, result.data.timezone)} a ${formatGoogleCalendarIso(slot.endIso, result.data.timezone)}`
  );

  return [
    `Encontre ${result.data.freeSlots.length} hueco(s) libre(s) de al menos ${result.data.slotMinutes} minutos entre ${formatGoogleCalendarIso(result.data.startIso, result.data.timezone)} y ${formatGoogleCalendarIso(result.data.endIso, result.data.timezone)} (${result.data.timezone}).`,
    ...freeSlotLines,
  ].join("\n");
}

function buildGoogleCalendarRuntimeFailureMessage(
  runtime: GoogleAgentToolRuntime | null | undefined,
  fallbackError?: string | null
): string {
  if (runtime && !runtime.ok) {
    if (runtime.code === "integration_missing") {
      return "Google Calendar no esta conectado para esta organizacion. Ve a Configuracion > Integraciones para conectar Google Workspace y luego vuelve a intentar.";
    }

    if (runtime.code === "integration_unavailable" || runtime.code === "scope_missing") {
      return "Google Calendar necesita que Google Workspace se reconecte antes de volver a operar. Ve a Configuracion > Integraciones y reconecta la superficie de Calendar.";
    }

    if (
      runtime.code === "tool_missing" ||
      runtime.code === "tool_disabled" ||
      runtime.code === "tool_misaligned" ||
      runtime.code === "tool_invalid"
    ) {
      return "Google Calendar ya existe para la organizacion, pero este agente necesita revisar su tool. Abre la configuracion del agente y vuelve a guardar la tool Google Calendar.";
    }

    return runtime.message;
  }

  if (
    fallbackError?.includes("reautenticacion") ||
    fallbackError?.includes("reconexion") ||
    fallbackError?.includes("reconectar")
  ) {
    return "Google Calendar necesita que Google Workspace se reconecte antes de volver a operar. Ve a Configuracion > Integraciones y reconecta la superficie de Calendar.";
  }

  return fallbackError ?? "No se pudo cargar Google Calendar para este agente.";
}

export function createGoogleCalendarChatOrchestrator(
  deps: GoogleCalendarChatOrchestratorDeps = {
    readAgentSetupState,
    resolveEffectiveAgentPrompt,
    getGoogleAgentToolRuntime,
    assertGoogleCalendarRuntimeUsable,
    readRecentCrmToolContext,
    isPendingToolActionExpired,
    updateConversationMetadata,
    planGoogleCalendarToolAction,
    resolveGoogleCalendarAgentTimezone,
    resolveGoogleCalendarIntegrationTimezone,
    assertGoogleCalendarActionEnabled,
    executeGoogleCalendarReadTool,
    toGoogleCalendarRuntimeSafeError,
    formatGoogleCalendarReadResultForPrompt,
    createRecentCrmToolContext,
    readPendingCrmAction,
    createPendingCrmAction,
    createApprovalRequest,
  }
): (input: {
  agent: Agent;
  conversation: Conversation;
  organizationId: string;
  userId: string;
  latestUserMessage: string;
  recentMessages: ChatMessage[];
}) => Promise<GoogleCalendarChatOrchestrationResult> {
  return async function orchestrateGoogleCalendarForChatWithDeps(input) {
    const setupState = deps.readAgentSetupState(input.agent);
    const promptResolution = deps.resolveEffectiveAgentPrompt({
      savedPrompt: input.agent.system_prompt,
      setupState,
      promptEnvironment: { googleCalendarRuntimeAvailable: true },
      allowConflictCleanupForCustom: true,
    });

    if (promptResolution.hasPromptConflict) {
      console.warn("chat.google_calendar_prompt_conflict", {
        agentId: input.agent.id,
        organizationId: input.organizationId,
        snippet: promptResolution.promptConflictSnippet,
      });
    }

    const runtimeResult = await deps.getGoogleAgentToolRuntime(
      input.agent.id,
      input.organizationId,
      "google_calendar"
    );

    if (runtimeResult.error || !runtimeResult.data) {
      return {
        kind: "respond_now",
        content: buildGoogleCalendarRuntimeFailureMessage(
          runtimeResult.data ?? null,
          runtimeResult.error
        ),
      };
    }

    if (!runtimeResult.data.ok) {
      return {
        kind: "respond_now",
        content: buildGoogleCalendarRuntimeFailureMessage(runtimeResult.data),
      };
    }

    const usableRuntime = deps.assertGoogleCalendarRuntimeUsable(runtimeResult.data);
    if (usableRuntime.error || !usableRuntime.data) {
      return {
        kind: "respond_now",
        content: buildGoogleCalendarRuntimeFailureMessage(
          runtimeResult.data,
          usableRuntime.error
        ),
      };
    }

    const googleTimezoneResult = await deps.resolveGoogleCalendarIntegrationTimezone({
      integrationId: usableRuntime.data.integration.id,
      organizationId: input.organizationId,
    });

    const recentToolContext = deps.readRecentCrmToolContext(
      input.conversation.metadata,
      "google_calendar"
    );
    const pendingAction = deps.readPendingCrmAction<ExecuteGoogleCalendarToolInput>(
      input.conversation.metadata,
      "google_calendar"
    );

    if (
      pendingAction &&
      deps.isPendingToolActionExpired(pendingAction)
    ) {
      await deps.updateConversationMetadata(
        input.conversation.id,
        input.agent.id,
        input.organizationId,
        { pending_crm_action: null },
        {
          initiatedBy: input.userId,
          useServiceRole: true,
        }
      );
    } else if (
      pendingAction &&
      /\bconfirmo\b/i.test(input.latestUserMessage)
    ) {
      return {
        kind: "respond_now",
        content:
          "Esa accion de Google Calendar ya quedo enviada a la approval inbox. Revisala desde /approvals para aprobarla o rechazarla.",
      };
    }

    const decision = deps.planGoogleCalendarToolAction({
      config: usableRuntime.data.config,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      recentToolContext:
        recentToolContext ? recentToolContext.context : undefined,
      timezone: deps.resolveGoogleCalendarAgentTimezone({
        setupState,
        detectedTimezone: googleTimezoneResult.data?.detectedTimezone ?? null,
      }),
    });

    if (decision.kind === "missing_data") {
      return { kind: "respond_now", content: decision.message };
    }

    if (decision.kind === "respond") {
      return {
        kind: "continue",
        hasUsableGoogleCalendarRuntime: true,
      };
    }

    const enabledRuntime = deps.assertGoogleCalendarActionEnabled(
      usableRuntime.data,
      decision.input.action
    );
    if (enabledRuntime.error || !enabledRuntime.data) {
      return {
        kind: "respond_now",
        content:
          enabledRuntime.error ??
          "La accion de Google Calendar no esta disponible para este agente.",
      };
    }

    if (decision.requiresConfirmation) {
      const summary = buildGoogleCalendarConfirmationSummary(decision.input);
      const pendingCrmAction = deps.createPendingCrmAction({
        provider: "google_calendar",
        toolName: "google_calendar",
        integrationId: usableRuntime.data.integration.id,
        initiatedBy: input.userId,
        summary,
        actionInput: decision.input,
        ttlMs: 10 * 60 * 1000,
      });

      const approvalRequest = await deps.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agent.id,
        conversationId: input.conversation.id,
        userId: input.userId,
        provider: "google_calendar",
        action: decision.input.action,
        integrationId: usableRuntime.data.integration.id,
        toolName: "google_calendar",
        summary,
        payloadSummary: buildGoogleCalendarApprovalPayloadSummary(
          decision.input
        ) as never,
        context: {
          source: "chat",
        },
        workflowTemplateId: setupState?.workflowTemplateId ?? null,
        automationPreset: setupState?.automationPreset ?? null,
      });

      if (approvalRequest.error || !approvalRequest.data) {
        return {
          kind: "respond_now",
          content:
            approvalRequest.error ??
            "No se pudo preparar la aprobacion para Google Calendar.",
        };
      }

      await deps.updateConversationMetadata(
        input.conversation.id,
        input.agent.id,
        input.organizationId,
        {
          pending_crm_action: pendingCrmAction,
        },
        {
          initiatedBy: input.userId,
          useServiceRole: true,
        }
      );

      return {
        kind: "respond_now",
        content: [
          `Prepare una aprobacion para Google Calendar: ${summary}`,
          `Revisala en /approvals antes de ${new Date(
            approvalRequest.data.expiresAt
          ).toLocaleString("es-AR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}.`,
          "Esta accion ya no se confirma con `confirmo` dentro del chat.",
        ].join("\n"),
      };
    }

    if (
      decision.input.action !== "check_availability" &&
      decision.input.action !== "list_events"
    ) {
      return {
        kind: "respond_now",
        content:
          "La accion de Google Calendar requiere aprobacion y no puede ejecutarse como lectura directa.",
      };
    }

    const execution = await deps.executeGoogleCalendarReadTool({
      organizationId: input.organizationId,
      userId: input.userId,
      agentId: input.agent.id,
      runtime: enabledRuntime.data,
      actionInput: decision.input,
    });

    if (execution.error || !execution.data) {
      const safeError = deps.toGoogleCalendarRuntimeSafeError(
        execution.error ?? "No se pudo consultar Google Calendar.",
        decision.input.action
      );
      return { kind: "respond_now", content: safeError.message };
    }

    const toolContext = deps.formatGoogleCalendarReadResultForPrompt(
      execution.data
    );
    await deps.updateConversationMetadata(
      input.conversation.id,
      input.agent.id,
      input.organizationId,
      {
        recent_crm_tool_context: deps.createRecentCrmToolContext(
          "google_calendar",
          toolContext
        ),
      },
      {
        initiatedBy: input.userId,
        useServiceRole: true,
      }
    );

    return {
      kind: "respond_now",
      content: buildDirectGoogleCalendarResponse(execution.data),
    };
  };
}

function buildGoogleCalendarConfirmationSummary(
  input: ExecuteGoogleCalendarToolInput
): string {
  if (input.action === "create_event") {
    return `Crear el evento "${input.title}" entre ${input.startIso} y ${input.endIso} (${input.timezone}).`;
  }

  if (input.action === "reschedule_event") {
    return `Reprogramar ${formatResolvedEventReference(input)} para ${formatGoogleCalendarIso(input.startIso, input.timezone)} a ${formatGoogleCalendarIso(input.endIso, input.timezone)} (${input.timezone}).`;
  }

  if (input.action === "cancel_event") {
    return `Cancelar ${formatResolvedEventReference(input)} en Google Calendar.`;
  }

  if (input.action === "check_availability") {
    return `Consultar disponibilidad entre ${input.startIso} y ${input.endIso} (${input.timezone}).`;
  }

  return `Listar eventos entre ${input.startIso} y ${input.endIso} (${input.timezone}).`;
}

export const orchestrateGoogleCalendarForChat =
  createGoogleCalendarChatOrchestrator();
