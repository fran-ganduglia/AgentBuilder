import assert from "node:assert/strict";

import {
  createGoogleGmailReadToolExecutor,
  createRecentGmailThreadContext,
  formatGoogleGmailResultForPrompt,
  runGoogleGmailAction,
  runGoogleGmailWriteAction,
  type GoogleGmailAgentRuntime,
} from "./google-gmail-agent-runtime";
import { ProviderRequestError } from "./provider-errors";

function buildRuntime(): GoogleGmailAgentRuntime {
  return {
    ok: true,
    surface: "gmail",
    tool: {
      id: "tool-1",
      integration_id: "integration-1",
    },
    integration: {
      id: "integration-1",
      organization_id: "org-1",
      is_active: true,
      metadata: {},
    },
    grantedScopes: [],
    actionPolicies: [],
    config: {
      provider: "google",
      surface: "gmail",
      allowed_actions: [
        "search_threads",
        "read_thread",
        "create_draft_reply",
        "apply_label",
        "archive_thread",
      ],
    },
  } as never;
}

async function runSearchThreadsSuccessTest(): Promise<void> {
  const originalFetch = global.fetch;
  let threadGetCount = 0;

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/threads?")) {
      return new Response(
        JSON.stringify({
          threads: [{ id: "abc123def456" }],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-search",
          },
        }
      );
    }

    threadGetCount += 1;
    return new Response(
      JSON.stringify({
        id: "abc123def456",
        snippet: "Pago pendiente del cliente",
        messages: [
          {
            id: "msg-1",
            internalDate: "1710460800000",
            snippet: "Pago pendiente del cliente",
            payload: {
              headers: [
                { name: "Subject", value: "Re: Factura Marzo" },
                { name: "From", value: "Juan <juan@example.com>" },
                { name: "Date", value: "Fri, 14 Mar 2026 10:00:00 -0300" },
              ],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-thread",
        },
      }
    );
  };

  try {
    const result = await runGoogleGmailAction(
      {
        action: "search_threads",
        query: "factura juan",
        maxResults: 5,
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "search_threads");
    assert.equal(result.requestId, "req-search");
    assert.equal(result.data.threads.length, 1);
    assert.equal(result.data.threads[0]?.subject, "Factura Marzo");
    assert.equal(threadGetCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

async function runReadThreadSuccessTest(): Promise<void> {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "abc123def456",
        messages: [
          {
            id: "msg-1",
            internalDate: "1710460800000",
            snippet: "Primer snippet",
            payload: {
              headers: [
                { name: "Subject", value: "Fwd: Demo cliente" },
                { name: "From", value: "Ana <ana@example.com>" },
                { name: "To", value: "Equipo <team@example.com>" },
                { name: "Message-Id", value: "<msg-1@example.com>" },
                { name: "Date", value: "Fri, 14 Mar 2026 10:00:00 -0300" },
              ],
              parts: [{ filename: "brief.pdf" }],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-read",
        },
      }
    );

  try {
    const result = await runGoogleGmailAction(
      {
        action: "read_thread",
        threadId: "abc123def456",
      },
      "token-1",
      "org-1",
      "integration-1"
    );

    assert.equal(result.action, "read_thread");
    assert.equal(result.data.subject, "Demo cliente");
    assert.equal(result.data.latestMessageId, "msg-1");
    assert.equal(result.data.latestRfcMessageId, "msg-1@example.com");
    assert.equal(result.data.messages[0]?.attachmentCount, 1);

    const promptContext = formatGoogleGmailResultForPrompt(result);
    assert.match(promptContext, /CONTENIDO EXTERNO NO CONFIABLE: GMAIL/);
    assert.doesNotMatch(promptContext, /text\/html/i);
  } finally {
    global.fetch = originalFetch;
  }
}

async function runRefreshFailureReauthTest(): Promise<void> {
  const reauthReasons: string[] = [];
  const executor = createGoogleGmailReadToolExecutor({
    getGoogleIntegrationConfig: async () => ({
      data: {
        accessToken: "expired-token",
        refreshToken: "refresh-token",
      } as never,
      error: null,
    }),
    markIntegrationReauthRequired: async (_integrationId, _organizationId, reason) => {
      reauthReasons.push(reason);
    },
    refreshGoogleCredentials: async () => ({
      data: null,
      error: "La integracion necesita reautenticacion antes de volver a operar.",
    }),
    runGoogleGmailAction: async () => {
      throw new ProviderRequestError({
        provider: "google_workspace",
        message: "expired",
        statusCode: 401,
      });
    },
  });

  const result = await executor({
    organizationId: "org-1",
    userId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    runtime: buildRuntime(),
    actionInput: {
      action: "read_thread",
      threadId: "abc123def456",
    },
  });

  assert.equal(
    result.error,
    "La integracion necesita reautenticacion antes de volver a operar."
  );
  assert.equal(reauthReasons.length, 1);
}

function runRecentContextSanitizationTest(): void {
  assert.equal(
    createRecentGmailThreadContext({
      threadId: "abc123def456",
      messageId: "msg-1",
      rfcMessageId: "<msg-1@example.com>",
      subject: "Re: Hola\n<script>alert(1)</script>",
    }),
    "thread_id=abc123def456\nmessage_id=msg-1\nrfc_message_id=msg-1@example.com\nsubject=Hola scriptalert(1)/script"
  );
}

async function runArchiveThreadIdempotentTest(): Promise<void> {
  const originalFetch = global.fetch;
  let modifyCalls = 0;

  global.fetch = async (input, init) => {
    const url = String(input);

    if (url.includes("/threads/abc123def456?")) {
      return new Response(
        JSON.stringify({
          id: "abc123def456",
          messages: [
            {
              id: "msg-1",
              internalDate: "1710460800000",
              labelIds: ["STARRED"],
              payload: {
                headers: [
                  { name: "Subject", value: "Factura Marzo" },
                  { name: "Message-Id", value: "<msg-1@example.com>" },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-thread",
          },
        }
      );
    }

    if (url.includes("/modify")) {
      modifyCalls += 1;
      return new Response(JSON.stringify({ id: "abc123def456" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-modify",
        },
      });
    }

    throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
  };

  try {
    const result = await runGoogleGmailWriteAction(
      {
        action: "archive_thread",
        threadId: "abc123def456",
        messageId: "msg-1",
        subject: "Factura Marzo",
      },
      "token-1",
      "org-1",
      "integration-1",
      {
        workflowRunId: "run-1",
        workflowStepId: "step-1",
      }
    );

    assert.equal(result.action, "archive_thread");
    assert.equal(result.data.status, "already_archived");
    assert.equal(modifyCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  await runSearchThreadsSuccessTest();
  await runReadThreadSuccessTest();
  await runRefreshFailureReauthTest();
  await runArchiveThreadIdempotentTest();
  runRecentContextSanitizationTest();
  console.log("google-gmail-agent-runtime checks passed");
}

void main();
