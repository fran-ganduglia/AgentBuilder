import assert from "node:assert/strict";

import { planAction, planActionWithUsage } from "./planner";
import type { ChatCompletionInput, ChatCompletionOutput } from "@/lib/llm/litellm-types";

function buildOutput(content: string, model = "gpt-4o-mini"): ChatCompletionOutput {
  return {
    content,
    tokensInput: 120,
    tokensOutput: 80,
    responseTimeMs: 150,
    model,
    status: "success",
    finishReason: "stop",
  };
}

function createSender(output: ChatCompletionOutput) {
  return async (input: ChatCompletionInput): Promise<ChatCompletionOutput> => {
    assert.equal(input.temperature, 0);
    assert.equal(input.maxTokens, 500);
    assert.equal(input.toolChoice, "none");
    return output;
  };
}

async function runSearchEmailTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Busca mis ultimos emails sobre facturas de marzo",
    messages: [{ role: "user", content: "Busca mis ultimos emails sobre facturas de marzo" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "buscar email",
          actions: [
            {
              type: "search_email",
              params: {
                query: { kind: "primitive", value: "facturas de marzo" },
                maxResults: { kind: "primitive", value: 10 },
              },
              approvalMode: "auto",
            },
          ],
          confidence: 0.91,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "search_email");
  assert.equal(plan.actions[0]?.approvalMode, "auto");
  assert.deepEqual(plan.actions[0]?.params.query, {
    kind: "primitive",
    value: "facturas de marzo",
  });
}

async function runSendEmailTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Envia un email a ana@example.com con asunto Seguimiento y cuerpo Gracias por la reunion",
    messages: [{ role: "user", content: "Envia un email a ana@example.com con asunto Seguimiento y cuerpo Gracias por la reunion" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "enviar email",
          actions: [
            {
              type: "send_email",
              params: {
                to: { kind: "primitive", value: ["ana@example.com"] },
                subject: { kind: "primitive", value: "Seguimiento" },
                body: { kind: "primitive", value: "Gracias por la reunion" },
              },
              approvalMode: "auto",
            },
          ],
          confidence: 0.89,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "send_email");
  assert.equal(plan.actions[0]?.approvalMode, "required");
  assert.deepEqual(plan.actions[0]?.params.to, {
    kind: "primitive",
    value: ["ana@example.com"],
  });
}

async function runSendEmailAliasPlanTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Mandale un mail a jspansecchi con asunto Seguimiento y cuerpo Gracias por la reunion",
    messages: [{ role: "user", content: "Mandale un mail a jspansecchi con asunto Seguimiento y cuerpo Gracias por la reunion" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "enviar email",
          actions: [
            {
              type: "send_email",
              params: {
                to: {
                  kind: "entity",
                  entityType: "recipient",
                  value: "jspansecchi",
                  label: "jspansecchi",
                },
                subject: { kind: "primitive", value: "Seguimiento" },
                body: { kind: "primitive", value: "Gracias por la reunion" },
              },
              approvalMode: "required",
            },
          ],
          confidence: 0.82,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "send_email");
  assert.equal(plan.confidence, 0.82);
  assert.deepEqual(plan.actions[0]?.params.to, {
    kind: "entity",
    entityType: "recipient",
    value: "jspansecchi",
    label: "jspansecchi",
  });
}

async function runCreateEventTest(): Promise<void> {
  const result = await planActionWithUsage({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Crea una reunion manana de 15 a 16 con titulo Demo",
    messages: [{ role: "user", content: "Crea una reunion manana de 15 a 16 con titulo Demo" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "crear evento",
          actions: [
            {
              type: "create_event",
              params: {
                title: { kind: "primitive", value: "Demo" },
                start: { kind: "time", value: "manana 15:00", granularity: "datetime" },
                end: { kind: "time", value: "manana 16:00", granularity: "datetime" },
              },
              approvalMode: "required",
            },
          ],
          confidence: 0.86,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(result.plan.actions[0]?.type, "create_event");
  assert.equal(result.plan.actions[0]?.approvalMode, "required");
  assert.equal(result.usage.provider, "openai");
}

async function runRescheduleFollowUpPromptTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Reprograma el ultimo evento que listaste para manana de 18:00 a 18:30",
    messages: [
      { role: "assistant", content: "1. Kickoff | 2026-03-18T16:00:00-03:00 -> 2026-03-18T16:30:00-03:00" },
      { role: "assistant", content: "2. Demo final | 2026-03-18T17:00:00-03:00 -> 2026-03-18T17:30:00-03:00" },
      { role: "user", content: "Reprograma el ultimo evento que listaste para manana de 18:00 a 18:30" },
    ],
    sender: async (input: ChatCompletionInput): Promise<ChatCompletionOutput> => {
      assert.match(input.systemPrompt ?? "", /ultimo evento que listaste/i);
      assert.match(input.systemPrompt ?? "", /reschedule_event/i);
      return buildOutput(
        JSON.stringify({
          version: 1,
          intent: "reprogramar evento",
          actions: [
            {
              type: "reschedule_event",
              params: {
                eventRef: {
                  kind: "reference",
                  refType: "event",
                  value: "ultimo evento",
                  label: "ultimo evento",
                },
                start: { kind: "time", value: "manana 18:00", granularity: "datetime" },
                end: { kind: "time", value: "manana 18:30", granularity: "datetime" },
              },
              approvalMode: "required",
            },
          ],
          confidence: 0.86,
          missingFields: [],
        })
      );
    },
  });

  assert.equal(plan.actions[0]?.type, "reschedule_event");
}

async function runWrappedJsonParsingTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Reprograma el ultimo evento para manana de 18:00 a 18:30",
    messages: [{ role: "user", content: "Reprograma el ultimo evento para manana de 18:00 a 18:30" }],
    sender: createSender(
      buildOutput(
        `Claro, va el JSON:\n${JSON.stringify({
          version: 1,
          intent: "reprogramar evento",
          actions: [
            {
              type: "reschedule_event",
              params: {
                eventRef: {
                  kind: "reference",
                  refType: "event",
                  value: "ultimo evento",
                },
                start: { kind: "time", value: "manana 18:00", granularity: "datetime" },
                end: { kind: "time", value: "manana 18:30", granularity: "datetime" },
              },
              approvalMode: "required",
            },
          ],
          confidence: 0.86,
          missingFields: [],
        })}`
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "reschedule_event");
}

async function runReadSheetRangeTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Lee la hoja Leads en el rango A1:C5",
    messages: [{ role: "user", content: "Lee la hoja Leads en el rango A1:C5" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "leer hoja",
          actions: [
            {
              type: "read_sheet_range",
              params: {
                sheetRef: {
                  kind: "reference",
                  refType: "sheet",
                  value: "spreadsheet-1",
                  label: "Leads",
                },
                rangeRef: {
                  kind: "reference",
                  refType: "range",
                  value: "A1:C5",
                  label: "A1:C5",
                },
              },
              approvalMode: "auto",
            },
          ],
          confidence: 0.84,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "read_sheet_range");
  assert.equal(plan.actions[0]?.approvalMode, "auto");
}

async function runSearchRecordsTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Busca leads de Acme en Salesforce",
    messages: [{ role: "user", content: "Busca leads de Acme en Salesforce" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "buscar crm",
          actions: [
            {
              type: "search_records",
              params: {
                objectType: { kind: "primitive", value: "leads" },
                query: { kind: "primitive", value: "Acme" },
                maxResults: { kind: "primitive", value: 5 },
              },
              approvalMode: "auto",
            },
          ],
          confidence: 0.87,
          missingFields: [],
        })
      )
    ),
  });

  assert.equal(plan.actions[0]?.type, "search_records");
  assert.equal(plan.actions[0]?.approvalMode, "auto");
}

async function runAmbiguousTurnTest(): Promise<void> {
  const result = await planActionWithUsage({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Mandale un mail",
    messages: [{ role: "user", content: "Mandale un mail" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "enviar email",
          actions: [
            {
              type: "send_email",
              params: {
                to: { kind: "unknown", reason: "missing_recipient" },
                subject: { kind: "unknown", reason: "missing_subject" },
                body: { kind: "unknown", reason: "missing_body" },
              },
              approvalMode: "required",
            },
          ],
          confidence: 0.41,
          missingFields: ["to", "subject", "body"],
        })
      )
    ),
  });

  // plan (thresholded) strips actions because confidence < 0.75
  assert.deepEqual(result.plan.actions, []);
  assert.deepEqual(result.plan.missingFields, ["to", "subject", "body"]);
  assert.equal(result.plan.confidence, 0.41);

  // plannerDraft preserves the action type for the form builder
  assert.equal(result.plannerDraft.actions[0]?.type, "send_email");
  assert.equal(result.plannerDraft.actions.length, 1);
}

async function runFencedJsonWithTrailingTextTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Quiero agendar una reunion para manana",
    messages: [{ role: "user", content: "Quiero agendar una reunion para manana" }],
    sender: createSender(
      buildOutput(
        "```json\n" +
        JSON.stringify({
          version: 1,
          intent: "crear evento",
          actions: [],
          confidence: 0.42,
          missingFields: ["title", "start_time", "end_time", "attendees"],
        }) +
        "\n```\n\nNecesito más información para continuar."
      )
    ),
  });

  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.missingFields, ["title", "start_time", "end_time", "attendees"]);
  assert.equal(plan.confidence, 0.42);
}

async function runPlainJsonWithTrailingTextTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Manda un mail",
    messages: [{ role: "user", content: "Manda un mail" }],
    sender: createSender(
      buildOutput(
        JSON.stringify({
          version: 1,
          intent: "enviar email",
          actions: [],
          confidence: 0.35,
          missingFields: ["to", "subject", "body"],
        }) + "\n\nPor favor provee más detalles."
      )
    ),
  });

  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.missingFields, ["to", "subject", "body"]);
  assert.equal(plan.confidence, 0.35);
}

async function runFallbackFieldExtractionTest(): Promise<void> {
  const plan = await planAction({
    requestedModel: "gpt-4o",
    organizationId: "org-1",
    agentId: "agent-1",
    conversationId: "conv-1",
    latestUserMessage: "Crea un evento",
    messages: [{ role: "user", content: "Crea un evento" }],
    sender: createSender(
      buildOutput(
        // Intentionally malformed JSON that still contains missingFields readable via regex
        '{"version":1,"intent":"crear evento","actions":[],"confidence":0.3,"missingFields":["title","start_time"'
        // Missing closing brackets — JSON.parse will fail, fallback regex should extract
      )
    ),
  });

  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.missingFields, ["title", "start_time"]);
  assert.equal(plan.intent, "crear evento");
}

async function main(): Promise<void> {
  process.env.LLM_ROUTER_ENABLED = "true";
  process.env.LLM_ROUTER_ROLLOUT_PERCENT = "100";
  process.env.LITELLM_ROUTER_CHEAP_MODEL = "gpt-4o-mini";
  process.env.LITELLM_ROUTER_STRONG_MODEL = "gpt-4o";

  await runSearchEmailTest();
  await runSendEmailTest();
  await runSendEmailAliasPlanTest();
  await runCreateEventTest();
  await runRescheduleFollowUpPromptTest();
  await runWrappedJsonParsingTest();
  await runReadSheetRangeTest();
  await runSearchRecordsTest();
  await runAmbiguousTurnTest();
  await runFencedJsonWithTrailingTextTest();
  await runPlainJsonWithTrailingTextTest();
  await runFallbackFieldExtractionTest();

  console.log("runtime planner checks passed");
}

void main();
