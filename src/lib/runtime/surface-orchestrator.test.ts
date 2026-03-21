import assert from "node:assert/strict";

import { resolveRuntimeModelRoutePolicy } from "@/lib/llm/model-routing";

import { resolveRuntimeChatRoutingDecision } from "./chat-route";
import {
  executeRuntimeSurfacePlan,
  resolveGmailThreadReferenceLookup,
  type RuntimeSurfaceAvailability,
  type RuntimeSurfacePlanningResult,
} from "./surface-orchestrator";
import type { ActionPlanV1 } from "./types";

function createPlan(actionTypes: ActionPlanV1["actions"][number]["type"][]): ActionPlanV1 {
  return {
    version: 1,
    intent: "test",
    confidence: 0.9,
    missingFields: [],
    actions: actionTypes.map((type, index) => ({
      id: `action-${index + 1}`,
      type,
      params: {},
      approvalMode:
        type === "search_email" ||
        type === "summarize_thread" ||
        type === "list_events" ||
        type === "read_sheet_range" ||
        type === "search_records"
          ? "auto"
          : "required",
    })),
  };
}

function createRuntimes(): RuntimeSurfaceAvailability {
  return {
    gmail: {
      actionPolicies: [{ action: "send_email" }],
    } as never,
    google_calendar: null,
    google_sheets: {
      actionPolicies: [{ action: "append_rows" }],
    } as never,
    salesforce: null,
  };
}

function createPlanning(input: {
  selectedSurfaces: string[];
  runtimes: RuntimeSurfaceAvailability;
  plan: ActionPlanV1 | null;
  plannerErrorType?: string | null;
}): RuntimeSurfacePlanningResult {
  return {
    plannerAttempted: true,
    plannerErrorType: input.plannerErrorType ?? null,
    plannerPlan: input.plan,
    plannerDraft: input.plan,
    plannerModel: "gpt-4o-mini",
    plannerProvider: "openai",
    plannerTokensInput: 12,
    plannerTokensOutput: 6,
    plannerMetadata: input.plan
      ? {
          intent: input.plan.intent,
          confidence: input.plan.confidence,
          missingFields: input.plan.missingFields,
          actions: input.plan.actions.map((action) => ({
            id: action.id,
            type: action.type,
            approvalMode: action.approvalMode,
          })),
        }
      : null,
    routingDecision: resolveRuntimeChatRoutingDecision({
      selectedSurfaces: input.selectedSurfaces,
      runtimes: input.runtimes,
      plan: input.plan,
      plannerErrorType: input.plannerErrorType ?? null,
    }),
  };
}

async function plannerEmptyReturnsNeedsUserTest(): Promise<void> {
  const runtimes = createRuntimes();
  const planning = createPlanning({
    selectedSurfaces: ["gmail"],
    runtimes,
    plan: {
      ...createPlan([]),
      confidence: 0.41,
      missingFields: ["to"],
    },
  });

  const result = await executeRuntimeSurfacePlan({
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    latestUserMessage: "Mandale un mail a Juan",
    requestedModel: "gpt-4o-mini",
    llmTemperature: 0.7,
    effectiveMaxTokens: 1000,
    systemPrompt: "system",
    routePolicy: resolveRuntimeModelRoutePolicy("gpt-4o-mini"),
    conversationMetadata: {},
    planning,
    runtimes,
  });

  assert.equal(result?.outcome, "needs_user");
  assert.match(result?.content ?? "", /email exacto del destinatario/i);
}

async function plannerInvalidOutputReturnsFailedTest(): Promise<void> {
  const runtimes = createRuntimes();
  const planning = createPlanning({
    selectedSurfaces: ["gmail"],
    runtimes,
    plan: {
      ...createPlan([]),
      missingFields: ["planner_invalid_output"],
    },
  });

  const result = await executeRuntimeSurfacePlan({
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    latestUserMessage: "Archivame ese thread",
    requestedModel: "gpt-4o-mini",
    llmTemperature: 0.7,
    effectiveMaxTokens: 1000,
    systemPrompt: "system",
    routePolicy: resolveRuntimeModelRoutePolicy("gpt-4o-mini"),
    conversationMetadata: {},
    planning,
    runtimes,
  });

  assert.equal(result?.outcome, "failed");
  assert.match(result?.content ?? "", /no pude interpretar el pedido/i);
}

async function unavailableActionReturnsBlockedTest(): Promise<void> {
  const runtimes = {
    ...createRuntimes(),
    google_sheets: null,
  };
  const planning = createPlanning({
    selectedSurfaces: ["gmail", "google_sheets"],
    runtimes,
    plan: createPlan(["append_sheet_rows"]),
  });

  const result = await executeRuntimeSurfacePlan({
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    latestUserMessage: "Agrega una fila",
    requestedModel: "gpt-4o-mini",
    llmTemperature: 0.7,
    effectiveMaxTokens: 1000,
    systemPrompt: "system",
    routePolicy: resolveRuntimeModelRoutePolicy("gpt-4o-mini"),
    conversationMetadata: {},
    planning,
    runtimes,
  });

  assert.equal(result?.outcome, "blocked");
  assert.match(result?.content ?? "", /no esta disponible|bloqueada/i);
}

async function threadClarificationReturnsNeedsUserTest(): Promise<void> {
  const runtimes = createRuntimes();
  const planning = createPlanning({
    selectedSurfaces: ["gmail"],
    runtimes,
    plan: {
      ...createPlan([]),
      confidence: 0.39,
      missingFields: ["ambiguous_thread"],
    },
  });

  const result = await executeRuntimeSurfacePlan({
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    latestUserMessage: "Archivame ese hilo",
    requestedModel: "gpt-4o-mini",
    llmTemperature: 0.7,
    effectiveMaxTokens: 1000,
    systemPrompt: "system",
    routePolicy: resolveRuntimeModelRoutePolicy("gpt-4o-mini"),
    conversationMetadata: {},
    planning,
    runtimes,
  });

  assert.equal(result?.outcome, "needs_user");
  assert.match(result?.content ?? "", /que hilo quieres usar/i);
}

async function eventClarificationReturnsNeedsUserTest(): Promise<void> {
  const runtimes = createRuntimes();
  const planning = createPlanning({
    selectedSurfaces: ["google_calendar"],
    runtimes,
    plan: {
      ...createPlan([]),
      confidence: 0.38,
      missingFields: ["missing_eventRef"],
    },
  });

  const result = await executeRuntimeSurfacePlan({
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conversation-1",
    latestUserMessage: "Cancela esa reunion",
    requestedModel: "gpt-4o-mini",
    llmTemperature: 0.7,
    effectiveMaxTokens: 1000,
    systemPrompt: "system",
    routePolicy: resolveRuntimeModelRoutePolicy("gpt-4o-mini"),
    conversationMetadata: {},
    planning,
    runtimes,
  });

  assert.equal(result?.outcome, "needs_user");
  assert.match(result?.content ?? "", /que evento quieres usar/i);
}

async function latestThreadAliasLookupTest(): Promise<void> {
  const runtimes = {
    ...createRuntimes(),
    gmail: {
      integration: {
        id: "integration-1",
      },
      actionPolicies: [{ action: "read_thread" }],
    } as never,
  };

  const result = await resolveGmailThreadReferenceLookup(
    {
      organizationId: "org-1",
      paramKey: "threadRef",
      param: {
        kind: "reference",
        refType: "thread",
        value: "ultimo hilo",
      },
      runtimes,
    },
    {
      getGoogleIntegrationConfig: async () => ({
        data: {
          accessToken: "token-1",
        } as never,
        error: null,
      }),
      requestGoogleGmail: async (_accessToken, path) => {
        if (path.includes("/threads?")) {
          return {
            data: {
              threads: [{ id: "thread-123" }],
            },
          } as never;
        }

        return {
          data: {
            messages: [
              {
                payload: {
                  headers: [{ name: "Subject", value: "Factura marzo" }],
                },
              },
            ],
          },
        } as never;
      },
    }
  );

  assert.deepEqual(result, {
    status: "resolved",
    resolvedParam: {
      kind: "reference",
      refType: "thread",
      value: "thread-123",
      label: "Factura marzo",
    },
  });
}

async function main(): Promise<void> {
  await plannerEmptyReturnsNeedsUserTest();
  await plannerInvalidOutputReturnsFailedTest();
  await unavailableActionReturnsBlockedTest();
  await threadClarificationReturnsNeedsUserTest();
  await eventClarificationReturnsNeedsUserTest();
  await latestThreadAliasLookupTest();
  console.log("runtime surface orchestrator checks passed");
}

void main();
