import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  parsePendingChatFormState,
  type ActiveChatUiState,
} from "@/lib/chat/chat-form-state";
import {
  buildDynamicFormSubmissionMessage,
} from "@/lib/chat/interactive-markers";
import {
  mapClarificationValueToParam,
  parseRuntimeClarificationSpec,
  readPlannerDraftPlan,
} from "@/lib/chat/runtime-clarification";
import {
  readConversationMetadata,
  readPendingChatForm,
  readPendingRuntimeClarification,
  type ConversationMetadata,
} from "@/lib/chat/conversation-metadata";
import { resolveChatFormContext } from "@/lib/chat/chat-form-server";
import { checkSessionLimitForConversation } from "@/lib/db/session-usage";
import { getRuntimeRunById } from "@/lib/db/runtime-runs";
import { updateConversationMetadata } from "@/lib/db/conversations";
import { insertMessageWithServiceRole } from "@/lib/db/messages";
import { recordUsage } from "@/lib/db/usage-writer";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";
import type { GoogleAgentRuntimeSuccess } from "@/lib/integrations/google-agent-runtime";
import {
  assertSalesforceRuntimeUsable,
  getSalesforceAgentToolRuntime,
  type SalesforceAgentToolRuntime,
} from "@/lib/integrations/salesforce-agent-runtime";
import {
  executeRuntimeSurfacePlan,
  getRuntimeActionSurface,
  planRuntimeSurfaceTurn,
  resolveRuntimeChatRoutingDecision,
  type RuntimeSurfaceAvailability,
  type RuntimeSurfacePlanningResult,
} from "@/lib/runtime";
import type { ActionPlanV1, ExecutionCheckpointV1, RuntimeActionType } from "@/lib/runtime/types";
import type { ChatMessage } from "@/lib/llm/litellm-types";
import { buildStructuredSemanticSystemPrompt } from "@/lib/chat/semantic-turns";
import { resolveRuntimeModelRoutePolicy } from "@/lib/llm/model-routing";
import { listMessages } from "@/lib/db/messages";
import { getOrganizationRuntimeKillSwitchConfig } from "@/lib/db/runtime-migration";
import {
  parseJsonRequestBody,
  validateJsonMutationRequest,
} from "@/lib/utils/request-security";
import type { Message } from "@/types/app";
import type { Json } from "@/types/database";

const submitRuntimeClarificationSchema = z.object({
  agentId: z.string().uuid("agentId invalido"),
  conversationId: z.string().uuid("conversationId invalido"),
  clarificationId: z.string().trim().min(1).max(120),
  values: z.record(z.string(), z.string().max(4000)).default({}),
});

function isActionPlan(value: unknown): value is ActionPlanV1 {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Record<string, unknown>).version === 1 &&
    Array.isArray((value as Record<string, unknown>).actions)
  );
}

function isCheckpoint(value: unknown): value is ExecutionCheckpointV1 {
  return Boolean(value) && typeof value === "object" && "actionId" in (value as Record<string, unknown>);
}

function updateActionPlanWithAction(input: {
  actionPlan: ActionPlanV1;
  actionId: string;
  params: ActionPlanV1["actions"][number]["params"];
}): ActionPlanV1 | null {
  let found = false;
  const actions = input.actionPlan.actions.map((action) => {
    if (action.id !== input.actionId) {
      return action;
    }

    found = true;
    return {
      ...action,
      params: input.params,
    };
  });

  return found
    ? {
        ...input.actionPlan,
        actions,
      }
    : null;
}

function asParamRecord(value: Record<string, unknown> | undefined): Record<string, ActionPlanV1["actions"][number]["params"][string]> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, ActionPlanV1["actions"][number]["params"][string]] => {
      const candidate = entry[1];
      return candidate !== null && typeof candidate === "object" && "kind" in candidate;
    })
  );
}

function normalizeChannel(value: string | null | undefined): "web" | "whatsapp" | "email" | "api" | undefined {
  return value === "web" || value === "whatsapp" || value === "email" || value === "api"
    ? value
    : undefined;
}

function buildPlanningFromActionPlan(input: {
  actionPlan: ActionPlanV1;
  runtimes: RuntimeSurfaceAvailability;
}): RuntimeSurfacePlanningResult {
  const selectedSurface = getRuntimeActionSurface(input.actionPlan.actions[0]?.type ?? "search_email");

  return {
    plannerAttempted: true,
    plannerErrorType: null,
    plannerPlan: input.actionPlan,
    plannerDraft: input.actionPlan,
    plannerModel: null,
    plannerProvider: null,
    plannerTokensInput: 0,
    plannerTokensOutput: 0,
    plannerMetadata: {
      intent: input.actionPlan.intent,
      confidence: input.actionPlan.confidence,
      missingFields: input.actionPlan.missingFields,
      actions: input.actionPlan.actions.map((action) => ({
        id: action.id,
        type: action.type,
        approvalMode: action.approvalMode,
      })),
    },
    routingDecision: resolveRuntimeChatRoutingDecision({
      selectedSurfaces: [selectedSurface],
      runtimes: input.runtimes,
      plan: input.actionPlan,
      plannerErrorType: null,
    }),
  };
}

async function resolveGoogleRuntime(
  agentId: string,
  organizationId: string,
  surface: "gmail" | "google_calendar" | "google_sheets"
): Promise<GoogleAgentRuntimeSuccess | null> {
  const result = await getGoogleAgentToolRuntimeWithServiceRole(agentId, organizationId, surface);
  return result.data?.ok ? result.data : null;
}

async function resolveSalesforceRuntime(
  agentId: string,
  organizationId: string
): Promise<SalesforceAgentToolRuntime | null> {
  const result = await getSalesforceAgentToolRuntime(agentId, organizationId);
  if (!result.data || result.error) {
    return null;
  }

  return assertSalesforceRuntimeUsable(result.data).data ?? null;
}

async function resolveRuntimesForAction(
  agentId: string,
  organizationId: string,
  actionType: RuntimeActionType
): Promise<RuntimeSurfaceAvailability> {
  const surface = getRuntimeActionSurface(actionType);

  return {
    gmail: surface === "gmail" ? await resolveGoogleRuntime(agentId, organizationId, "gmail") : null,
    google_calendar:
      surface === "google_calendar"
        ? await resolveGoogleRuntime(agentId, organizationId, "google_calendar")
        : null,
    google_sheets:
      surface === "google_sheets"
        ? await resolveGoogleRuntime(agentId, organizationId, "google_sheets")
        : null,
    salesforce: surface === "salesforce" ? await resolveSalesforceRuntime(agentId, organizationId) : null,
  };
}

function buildAssistantMetadata(runtimeExecution: Awaited<ReturnType<typeof executeRuntimeSurfacePlan>>) {
  if (!runtimeExecution) {
    return null;
  }

  return ({
    ...runtimeExecution.assistantMetadataPatch,
    runtime_outcome: runtimeExecution.outcome,
  }) as Json;
}

function createUiMessage(conversationId: string, role: "user" | "assistant", content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    organization_id: "",
    role,
    content,
    created_at: new Date().toISOString(),
    llm_model: null,
    response_time_ms: null,
    tokens_input: null,
    tokens_output: null,
    metadata: null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsedBody = await parseJsonRequestBody(request, submitRuntimeClarificationSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const context = await resolveChatFormContext({
    session,
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
  });

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const planCheck = await checkSessionLimitForConversation({
    organizationId: session.organizationId,
    conversationId: context.conversation.id,
  });
  if (!planCheck.allowed) {
    return NextResponse.json(
      { error: planCheck.message ?? "Limite del plan alcanzado" },
      { status: 429 }
    );
  }

  const metadata = readConversationMetadata(context.conversation.metadata);
  const formValues = parsedBody.data.values ?? {};
  const pendingSpec = parseRuntimeClarificationSpec(
    readPendingRuntimeClarification(context.conversation.metadata) as Record<string, unknown> | null
  );
  const pendingForm = parsePendingChatFormState(readPendingChatForm(context.conversation.metadata));

  if (!pendingSpec || !pendingForm || pendingSpec.clarificationId !== parsedBody.data.clarificationId) {
    return NextResponse.json(
      { error: "No hay una aclaracion runtime activa para este chat." },
      { status: 409 }
    );
  }

  const allowedFields = new Set([...pendingSpec.requiredFields, ...pendingSpec.optionalFields]);
  const extraField = Object.keys(formValues).find((key) => !allowedFields.has(key));
  if (extraField) {
    return NextResponse.json(
      { error: `Campo no permitido: ${extraField}` },
      { status: 400 }
    );
  }

  const missingRequiredField = pendingSpec.requiredFields.find((fieldKey) => {
    const value = formValues[fieldKey];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingRequiredField) {
    return NextResponse.json(
      { error: `Falta completar ${missingRequiredField}` },
      { status: 400 }
    );
  }

  for (const [fieldKey, options] of Object.entries(pendingSpec.candidateOptionsByField)) {
    const submittedValue = formValues[fieldKey];
    if (!submittedValue) {
      continue;
    }

    if (options.length > 0 && !options.some((option) => option.value === submittedValue)) {
      return NextResponse.json(
        { error: `Valor invalido para ${fieldKey}` },
        { status: 400 }
      );
    }
  }

  const submittedParams = Object.fromEntries(
    Object.entries(formValues)
      .filter(([, value]) => value.trim().length > 0)
      .map(([fieldKey, value]) => [
        fieldKey,
        mapClarificationValueToParam({
          actionType: pendingSpec.actionType as RuntimeActionType,
          fieldKey,
          rawValue: value,
          timezone: null,
        }),
      ])
  );
  const userMessageContent = buildDynamicFormSubmissionMessage(
    pendingForm.definition,
    formValues
  );
  const knownParams = asParamRecord(pendingSpec.knownParams);

  const runtimes = await resolveRuntimesForAction(
    parsedBody.data.agentId,
    session.organizationId,
    pendingSpec.actionType as RuntimeActionType
  );

  let preparedActionPlan: ActionPlanV1 | null = null;
  let preparedCheckpoint: ExecutionCheckpointV1 | null = null;
  let preparedExistingRuntimeRun: Awaited<ReturnType<typeof getRuntimeRunById>>["data"] | null = null;
  let rePlanningResult: RuntimeSurfacePlanningResult | null = null;

  if (pendingSpec.source === "planner") {
    // Save user message first so it appears in conversation history
    const userMsgResult = await insertMessageWithServiceRole({
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
      organizationId: session.organizationId,
      role: "user",
      content: userMessageContent || "Aclaracion runtime enviada.",
      metadata: {
        runtime_clarification_submit: {
          clarificationId: pendingSpec.clarificationId,
          source: pendingSpec.source,
        },
      },
    });
    if (userMsgResult.error) {
      return NextResponse.json({ error: "No se pudo guardar la aclaracion." }, { status: 500 });
    }

    // Fetch recent messages for re-planning with full context
    const messagesResult = await listMessages(
      parsedBody.data.conversationId,
      session.organizationId,
      20
    );
    const chatMessages: ChatMessage[] = (messagesResult.data ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) =>
        m.role === "user"
          ? { role: "user" as const, content: m.content }
          : { role: "assistant" as const, content: m.content }
      );

    // Re-plan: let the planner interpret the user's response with conversation context
    const selectedSurface = getRuntimeActionSurface(pendingSpec.actionType as RuntimeActionType);
    rePlanningResult = await planRuntimeSurfaceTurn({
      requestedModel: context.agent.llm_model,
      organizationId: session.organizationId,
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
      latestUserMessage: userMessageContent || "Aclaracion runtime enviada.",
      messages: chatMessages,
      selectedSurfaces: [selectedSurface],
      runtimes,
      killSwitch: (await getOrganizationRuntimeKillSwitchConfig(session.organizationId)).data ?? undefined,
      recentActionContext: metadata.recent_action_context ?? null,
    });

    // The planner decides: execute, clarify again, or reject
    preparedActionPlan = rePlanningResult.plannerPlan;

    // Execute using the re-planned result
    const runtimeExecution = await executeRuntimeSurfacePlan({
      organizationId: session.organizationId,
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
      channel: normalizeChannel(context.conversation.channel),
      userId: session.user.id,
      messageId: userMsgResult.data?.id ?? undefined,
      latestUserMessage: userMessageContent || "Aclaracion runtime enviada.",
      requestedModel: context.agent.llm_model,
      llmTemperature: context.agent.llm_temperature ?? 0.7,
      effectiveMaxTokens: context.agent.max_tokens ?? 1000,
      systemPrompt: buildStructuredSemanticSystemPrompt(context.agent.system_prompt ?? ""),
      routePolicy: resolveRuntimeModelRoutePolicy(context.agent.llm_model),
      conversationMetadata: metadata as Record<string, unknown>,
      planning: rePlanningResult,
      runtimes,
    });

    if (!runtimeExecution) {
      return NextResponse.json({ error: "No se pudo reanudar el runtime." }, { status: 500 });
    }

    const conversationMetadataPatch: ConversationMetadata = {
      pending_chat_form: null,
      pending_runtime_clarification: null,
      ...runtimeExecution.conversationMetadataPatch,
    };
    const updateResult = await updateConversationMetadata(
      parsedBody.data.conversationId,
      parsedBody.data.agentId,
      session.organizationId,
      conversationMetadataPatch,
      { useServiceRole: true }
    );

    if (updateResult.error) {
      return NextResponse.json({ error: "No se pudo actualizar la conversacion." }, { status: 500 });
    }

    const assistantMessageResult = await insertMessageWithServiceRole({
      agentId: parsedBody.data.agentId,
      conversationId: parsedBody.data.conversationId,
      organizationId: session.organizationId,
      role: "assistant",
      content: runtimeExecution.content,
      llmModel: runtimeExecution.llmModel ?? undefined,
      responseTimeMs: runtimeExecution.responseTimeMs ?? undefined,
      tokensInput: runtimeExecution.tokensInput || undefined,
      tokensOutput: runtimeExecution.tokensOutput || undefined,
      metadata: buildAssistantMetadata(runtimeExecution),
    });

    if (assistantMessageResult.error) {
      return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 });
    }

    if (
      runtimeExecution.llmProvider &&
      (runtimeExecution.tokensInput > 0 || runtimeExecution.tokensOutput > 0)
    ) {
      await recordUsage({
        organizationId: session.organizationId,
        agentId: parsedBody.data.agentId,
        tokensInput: runtimeExecution.tokensInput,
        tokensOutput: runtimeExecution.tokensOutput,
        llmProvider: runtimeExecution.llmProvider,
      });
    }

    const nextMetadata = readConversationMetadata(updateResult.data?.metadata ?? null);
    const activeUiState: ActiveChatUiState =
      nextMetadata.pending_chat_form && updateResult.data
        ? parsePendingChatFormState(nextMetadata.pending_chat_form) ?? { kind: "none" }
        : { kind: "none" };

    return NextResponse.json({
      data: {
        conversationId: parsedBody.data.conversationId,
        userMessage:
          userMsgResult.data ??
          createUiMessage(parsedBody.data.conversationId, "user", userMessageContent),
        assistantMessage:
          assistantMessageResult.data ??
          createUiMessage(parsedBody.data.conversationId, "assistant", runtimeExecution.content),
        activeUiState,
      },
    });
  }

  // source === "runtime": checkpoint resume — direct execution with merged params
  {
    if (!pendingSpec.runtimeRunId) {
      return NextResponse.json({ error: "Falta runtimeRunId para reanudar." }, { status: 409 });
    }

    const runtimeRunResult = await getRuntimeRunById(session.organizationId, pendingSpec.runtimeRunId);
    if (runtimeRunResult.error || !runtimeRunResult.data) {
      return NextResponse.json({ error: "Runtime run no encontrado." }, { status: 404 });
    }

    if (
      runtimeRunResult.data.agent_id !== parsedBody.data.agentId ||
      runtimeRunResult.data.conversation_id !== parsedBody.data.conversationId
    ) {
      return NextResponse.json({ error: "El runtime no coincide con este chat." }, { status: 409 });
    }

    if (!isActionPlan(runtimeRunResult.data.action_plan)) {
      return NextResponse.json({ error: "El runtime run no tiene action_plan valido." }, { status: 409 });
    }

    const checkpoint = metadata.runtime_checkpoint;
    if (!isCheckpoint(checkpoint) || checkpoint.actionId !== pendingSpec.actionId) {
      return NextResponse.json({ error: "El checkpoint actual no coincide con la aclaracion." }, { status: 409 });
    }

    const resumedActionParams = {
      ...knownParams,
      ...checkpoint.actionSnapshot.params,
      ...submittedParams,
    };
    const updatedCheckpoint: ExecutionCheckpointV1 = {
      ...checkpoint,
      actionSnapshot: {
        ...checkpoint.actionSnapshot,
        params: resumedActionParams,
      },
      reason: "resume_after_user_input",
    };
    const actionPlan = updateActionPlanWithAction({
      actionPlan: runtimeRunResult.data.action_plan,
      actionId: checkpoint.actionId,
      params: resumedActionParams,
    });

    if (!actionPlan) {
      return NextResponse.json({ error: "No se pudo rehidratar la accion del runtime." }, { status: 409 });
    }
    preparedActionPlan = actionPlan;
    preparedCheckpoint = updatedCheckpoint;
    preparedExistingRuntimeRun = runtimeRunResult.data;
  }

  if (!preparedActionPlan) {
    return NextResponse.json({ error: "No se pudo preparar la reanudacion." }, { status: 409 });
  }

  const userMessageResult = await insertMessageWithServiceRole({
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
    organizationId: session.organizationId,
    role: "user",
    content: userMessageContent || "Aclaracion runtime enviada.",
    metadata: {
      runtime_clarification_submit: {
        clarificationId: pendingSpec.clarificationId,
        source: pendingSpec.source,
      },
    },
  });

  if (userMessageResult.error) {
    return NextResponse.json({ error: "No se pudo guardar la aclaracion." }, { status: 500 });
  }

  const runtimeExecution = await executeRuntimeSurfacePlan({
    organizationId: session.organizationId,
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
    channel: normalizeChannel(context.conversation.channel),
    userId: session.user.id,
    messageId: userMessageResult.data?.id ?? undefined,
    latestUserMessage: userMessageContent || "Aclaracion runtime enviada.",
    requestedModel: context.agent.llm_model,
    llmTemperature: context.agent.llm_temperature ?? 0.7,
    effectiveMaxTokens: context.agent.max_tokens ?? 1000,
    systemPrompt: buildStructuredSemanticSystemPrompt(context.agent.system_prompt ?? ""),
    routePolicy: resolveRuntimeModelRoutePolicy(context.agent.llm_model),
    conversationMetadata: metadata as Record<string, unknown>,
    planning: buildPlanningFromActionPlan({
      actionPlan: preparedActionPlan,
      runtimes,
    }),
    runtimes,
    actionPlanOverride: preparedActionPlan,
    resumeFromCheckpoint: preparedCheckpoint,
    existingRuntimeRun: preparedExistingRuntimeRun,
  });

  if (!runtimeExecution) {
    return NextResponse.json({ error: "No se pudo reanudar el runtime." }, { status: 500 });
  }

  const conversationMetadataPatch: ConversationMetadata = {
    pending_chat_form: null,
    pending_runtime_clarification: null,
    ...runtimeExecution.conversationMetadataPatch,
  };
  const updateResult = await updateConversationMetadata(
    parsedBody.data.conversationId,
    parsedBody.data.agentId,
    session.organizationId,
    conversationMetadataPatch,
    { useServiceRole: true }
  );

  if (updateResult.error) {
    return NextResponse.json({ error: "No se pudo actualizar la conversacion." }, { status: 500 });
  }

  const assistantMessageResult = await insertMessageWithServiceRole({
    agentId: parsedBody.data.agentId,
    conversationId: parsedBody.data.conversationId,
    organizationId: session.organizationId,
    role: "assistant",
    content: runtimeExecution.content,
    llmModel: runtimeExecution.llmModel ?? undefined,
    responseTimeMs: runtimeExecution.responseTimeMs ?? undefined,
    tokensInput: runtimeExecution.tokensInput || undefined,
    tokensOutput: runtimeExecution.tokensOutput || undefined,
    metadata: buildAssistantMetadata(runtimeExecution),
  });

  if (assistantMessageResult.error) {
    return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 });
  }

  if (
    runtimeExecution.llmProvider &&
    (runtimeExecution.tokensInput > 0 || runtimeExecution.tokensOutput > 0)
  ) {
    await recordUsage({
      organizationId: session.organizationId,
      agentId: parsedBody.data.agentId,
      tokensInput: runtimeExecution.tokensInput,
      tokensOutput: runtimeExecution.tokensOutput,
      llmProvider: runtimeExecution.llmProvider,
    });
  }

  const nextMetadata = readConversationMetadata(updateResult.data?.metadata ?? null);
  const activeUiState: ActiveChatUiState =
    nextMetadata.pending_chat_form && updateResult.data
      ? parsePendingChatFormState(nextMetadata.pending_chat_form) ?? { kind: "none" }
      : { kind: "none" };

  return NextResponse.json({
    data: {
      conversationId: parsedBody.data.conversationId,
      userMessage:
        userMessageResult.data ??
        createUiMessage(parsedBody.data.conversationId, "user", userMessageContent),
      assistantMessage:
        assistantMessageResult.data ??
        createUiMessage(parsedBody.data.conversationId, "assistant", runtimeExecution.content),
      activeUiState,
    },
  });
}
