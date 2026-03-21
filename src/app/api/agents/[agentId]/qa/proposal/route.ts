import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { readConversationMetadata } from "@/lib/chat/conversation-metadata";
import { insertAuditLog } from "@/lib/db/audit";
import { getConversationById } from "@/lib/db/conversations";
import { listMessages } from "@/lib/db/messages";
import { LiteLLMError } from "@/lib/llm/litellm";
import { resolveRuntimeModelRoutePolicy } from "@/lib/llm/model-routing";
import { sendSemanticCompletion } from "@/lib/llm/semantic-generation";
import { parseJsonRequestBody, validateJsonMutationRequest } from "@/lib/utils/request-security";
import { getQaAvailabilityError } from "@/lib/agents/qa-access";

const createQaProposalSchema = z.object({
  conversationId: z.string().uuid("conversationId invalido"),
});

const qaProposalResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  suggestedSystemPrompt: z.string().min(1).max(20000),
  recommendations: z.array(z.string().min(1).max(300)).max(8),
});

const QA_PROPOSAL_MAX_TOKENS = 2400;

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

type QaProposalPayload = {
  agent: {
    name: string;
    currentSystemPrompt: string;
    llmModel: string;
    llmTemperature: number;
  };
  review: ReturnType<typeof readConversationMetadata>["qa_review"] | null;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
};

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return raw.slice(start, end + 1);
}

function parseProposalCandidate(candidate: string): z.infer<typeof qaProposalResultSchema> | null {
  try {
    const parsed = qaProposalResultSchema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseQaProposal(raw: string): z.infer<typeof qaProposalResultSchema> | null {
  const candidates = new Set<string>();
  const trimmed = raw.trim();

  if (trimmed) {
    candidates.add(trimmed);
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const objectCandidate = extractJsonObject(raw);
  if (objectCandidate) {
    candidates.add(objectCandidate);
  }

  for (const candidate of candidates) {
    const parsed = parseProposalCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

async function repairQaProposal(
  rawOutput: string,
  payload: QaProposalPayload,
  model: string,
  organizationId: string,
  agentId: string,
  conversationId: string
): Promise<z.infer<typeof qaProposalResultSchema> | null> {
  const repairCompletion = (
    await sendSemanticCompletion({
      usageKind: "qa_prompt_proposal",
      requestedModel: model,
      policy: resolveRuntimeModelRoutePolicy(model),
      chatInput: {
        systemPrompt: [
          "Eres un normalizador de salidas para QA de prompts.",
          "Debes devolver solo JSON valido con las claves summary, suggestedSystemPrompt y recommendations.",
          "No inventes alcance nuevo para el agente.",
          "Si el texto original no sirve, reconstruye la mejor propuesta posible usando el contexto recibido.",
          "No incluyas markdown ni texto adicional.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              originalOutput: rawOutput,
              context: payload,
            }),
          },
        ],
        temperature: 0,
        maxTokens: QA_PROPOSAL_MAX_TOKENS,
        organizationId,
        agentId,
        conversationId,
      },
      evaluateStructuredOutput: (output) => ({ parseValid: parseQaProposal(output.content) !== null }),
    })
  ).output;

  return parseQaProposal(repairCompletion.content);
}

function buildProposalPayload(
  agent: {
    name: string;
    system_prompt: string;
    llm_model: string;
    llm_temperature: number | null;
  },
  review: ReturnType<typeof readConversationMetadata>["qa_review"] | null,
  messages: Array<{ role: string; content: string; created_at: string }>
): QaProposalPayload {
  return {
    agent: {
      name: agent.name,
      currentSystemPrompt: agent.system_prompt,
      llmModel: agent.llm_model,
      llmTemperature: agent.llm_temperature ?? 0.7,
    },
    review,
    conversation: messages
      .filter(
        (message): message is { role: "user" | "assistant"; content: string; created_at: string } =>
          message.role === "user" || message.role === "assistant"
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      })),
  };
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestError = validateJsonMutationRequest(request);
  if (requestError) {
    return requestError;
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { agentId } = await context.params;
  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "edit",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const qaAvailabilityError = getQaAvailabilityError(
    access.connectionSummary.classification,
    access.agent.status
  );
  if (qaAvailabilityError) {
    return NextResponse.json({ error: qaAvailabilityError }, { status: 403 });
  }

  const parsedBody = await parseJsonRequestBody(request, createQaProposalSchema);
  if (parsedBody.errorResponse) {
    return parsedBody.errorResponse;
  }

  const conversationResult = await getConversationById(
    parsedBody.data.conversationId,
    agentId,
    session.organizationId
  );
  if (conversationResult.error || !conversationResult.data) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  const messagesResult = await listMessages(parsedBody.data.conversationId, session.organizationId, 80);
  if (messagesResult.error || !messagesResult.data || messagesResult.data.length === 0) {
    return NextResponse.json({ error: "No se pudo cargar la conversacion QA" }, { status: 500 });
  }

  const qaReview = readConversationMetadata(conversationResult.data.metadata).qa_review ?? null;
  const proposalPayload = buildProposalPayload(access.agent, qaReview, messagesResult.data);

  try {
    const completion = (
      await sendSemanticCompletion({
        usageKind: "qa_prompt_proposal",
        requestedModel: access.agent.llm_model,
        policy: resolveRuntimeModelRoutePolicy(access.agent.llm_model),
        chatInput: {
          systemPrompt: [
            "Eres un revisor de prompts para agentes conversacionales B2B.",
            "Debes proponer una mejora concreta del system prompt sin ampliar el alcance del agente.",
            "Devuelve obligatoriamente un unico objeto JSON valido.",
            "Las claves permitidas son summary, suggestedSystemPrompt y recommendations.",
            "summary debe resumir el problema y la mejora sugerida.",
            "suggestedSystemPrompt debe contener el prompt completo propuesto.",
            "recommendations debe ser un array corto de cambios concretos.",
            "No incluyas markdown ni texto fuera del JSON.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: JSON.stringify(proposalPayload),
            },
          ],
          temperature: 0.1,
          maxTokens: QA_PROPOSAL_MAX_TOKENS,
          organizationId: session.organizationId,
          agentId: access.agent.id,
          conversationId: parsedBody.data.conversationId,
        },
        evaluateStructuredOutput: (output) => ({ parseValid: parseQaProposal(output.content) !== null }),
      })
    ).output;

    let parsedProposal = parseQaProposal(completion.content);

    if (!parsedProposal) {
      console.warn("qa.proposal.parse_failed", {
        agentId,
        conversationId: parsedBody.data.conversationId,
        tokensOutput: completion.tokensOutput,
        contentLength: completion.content.length,
      });

      parsedProposal = await repairQaProposal(
        completion.content,
        proposalPayload,
        access.agent.llm_model,
        session.organizationId,
        access.agent.id,
        parsedBody.data.conversationId
      );
    }

    if (!parsedProposal) {
      return NextResponse.json({ error: "No se pudo interpretar la propuesta generada" }, { status: 502 });
    }

    void insertAuditLog({
      organizationId: session.organizationId,
      userId: session.user.id,
      action: "agent.qa_proposal_created",
      resourceType: "agent",
      resourceId: agentId,
      newValue: {
        conversation_id: parsedBody.data.conversationId,
      },
    });

    return NextResponse.json({
      data: {
        ...parsedProposal,
        conversationId: parsedBody.data.conversationId,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof LiteLLMError) {
      return NextResponse.json({ error: "No se pudo generar la propuesta QA en este momento" }, { status: 502 });
    }

    return NextResponse.json({ error: "No se pudo generar la propuesta QA" }, { status: 500 });
  }
}


