import assert from "node:assert/strict";

import {
  executeWorkflowAction,
  isWorkflowActionExecutionError,
} from "@/lib/engine/workflow-action-runtime";
import type { GoogleGmailAgentRuntime } from "@/lib/integrations/google-gmail-agent-runtime";
import {
  executeGoogleCalendarWriteToolAction,
  type GoogleCalendarWriteToolExecutionResult,
} from "@/lib/integrations/google-calendar-agent-runtime";
import {
  executeGoogleGmailWriteToolAction,
  type GoogleGmailWriteToolExecutionResult,
} from "@/lib/integrations/google-gmail-agent-runtime";
import {
  executeGoogleSheetsWriteToolAction,
  type GoogleSheetsWriteToolExecutionResult,
} from "@/lib/integrations/google-sheets-agent-runtime";
import {
  executeSalesforceToolAction,
  type SalesforceToolExecutionResult,
} from "@/lib/integrations/salesforce-agent-runtime";
import { getGoogleAgentToolRuntimeWithServiceRole } from "@/lib/integrations/google-agent-runtime";

function createGmailRuntime(): GoogleGmailAgentRuntime {
  return {
    ok: true,
    surface: "gmail",
    tool: {
      id: "tool-1",
    },
    integration: {
      id: "integration-1",
      provider: "google",
      status: "active",
      metadata: {
        auth_status: "connected",
      },
    },
    grantedScopes: [],
    actionPolicies: [
      {
        action: "send_email",
        access: "write",
        requiresConfirmation: true,
      },
    ],
    config: {
      allowed_actions: ["send_email"],
    },
  } as unknown as GoogleGmailAgentRuntime;
}

function createDeps() {
  const calls: Array<string> = [];
  const deps: NonNullable<Parameters<typeof executeWorkflowAction>[1]> = {
    getGoogleRuntime: async (...args: Parameters<typeof getGoogleAgentToolRuntimeWithServiceRole>) => {
      calls.push(`runtime:${args[2]}`);
      return {
        data: createGmailRuntime(),
        error: null,
      };
    },
    executeSalesforce: async (
      input: Parameters<typeof executeSalesforceToolAction>[0]
    ) => {
      calls.push(`salesforce:${input.actionInput.action}`);
      return {
        data: {
          action: input.actionInput.action,
          isWrite: true,
          requestId: "req-salesforce",
          providerObjectId: "contact-1",
          providerObjectType: "contact",
          data: { ok: true },
        } as unknown as SalesforceToolExecutionResult,
        error: null,
      };
    },
    executeGmail: async (input: Parameters<typeof executeGoogleGmailWriteToolAction>[0]) => {
      calls.push(`gmail:${input.actionInput.action}`);
      return {
        data: {
          action: "send_email",
          requestId: "req-gmail",
          providerObjectId: "msg-1",
          providerObjectType: "message",
          data: {
            messageId: "msg-1",
            threadId: null,
            rfcMessageId: null,
            subject: "Hola",
            to: ["ana@example.com"],
            attachmentCount: 0,
            attachmentFileNames: [],
            status: "sent",
          },
          summary: "Mail enviado",
        } as GoogleGmailWriteToolExecutionResult,
        error: null,
      };
    },
    executeCalendar: async (
      input: Parameters<typeof executeGoogleCalendarWriteToolAction>[0]
    ) => {
      calls.push(`calendar:${input.actionInput.action}`);
      return {
        data: {
          action: "create_event",
          requestId: "req-calendar",
          providerObjectId: "event-1",
          providerObjectType: "event",
          data: {
            id: "event-1",
            status: "confirmed",
            title: "Demo",
            startIso: "2026-03-17T10:00:00.000Z",
            endIso: "2026-03-17T11:00:00.000Z",
            timezone: "UTC",
            htmlLink: null,
            location: null,
          },
          summary: "Evento creado",
        } as GoogleCalendarWriteToolExecutionResult,
        error: null,
      };
    },
    executeSheets: async (
      input: Parameters<typeof executeGoogleSheetsWriteToolAction>[0]
    ) => {
      calls.push(`sheets:${input.actionInput.action}`);
      return {
        data: {
          action: input.actionInput.action,
          requestId: "req-sheets",
          providerObjectId: "sheet-1",
          providerObjectType: "sheet",
          data: { ok: true },
          summary: "Sheet actualizada",
        } as GoogleSheetsWriteToolExecutionResult,
        error: null,
      };
    },
  };

  return { deps, calls };
}

async function runSalesforceExecutionTest(): Promise<void> {
  const { deps, calls } = createDeps();
  const result = await executeWorkflowAction(
    {
      organizationId: "org-1",
      userId: "user-1",
      agentId: "agent-1",
      integrationId: "integration-1",
      workflowRunId: "run-1",
      workflowStepId: "step-1",
      provider: "salesforce",
      action: "create_contact",
      rawActionInput: {
        action: "create_contact",
        firstName: "Ana",
        lastName: "Perez",
        email: "ana@example.com",
      },
    },
    deps
  );

  assert.equal(result.providerRequestKey, "req-salesforce");
  assert.equal(result.operationalMetrics.actionClass, "workflow_async");
  assert.equal(result.operationalMetrics.actionsExecuted, 1);
  assert.deepEqual(calls, ["salesforce:create_contact"]);
}

async function runGmailExecutionTest(): Promise<void> {
  const { deps, calls } = createDeps();
  const result = await executeWorkflowAction(
    {
      organizationId: "org-1",
      userId: "user-1",
      agentId: "agent-1",
      integrationId: "integration-1",
      workflowRunId: "run-1",
      workflowStepId: "step-1",
      provider: "gmail",
      action: "send_email",
      rawActionInput: {
        action: "send_email",
        to: ["ana@example.com"],
        subject: "Hola",
        body: "Mundo",
      },
    },
    deps
  );

  assert.equal(result.providerRequestKey, "req-gmail");
  assert.equal(result.operationalMetrics.actionUsage[0]?.action, "send_email");
  assert.deepEqual(calls, ["runtime:gmail", "gmail:send_email"]);
}

async function runValidationFailureTest(): Promise<void> {
  const { deps } = createDeps();

  try {
    await executeWorkflowAction(
      {
        organizationId: "org-1",
        userId: "user-1",
        agentId: "agent-1",
        integrationId: "integration-1",
        workflowRunId: "run-1",
        workflowStepId: "step-1",
        provider: "gmail",
        action: "send_email",
        rawActionInput: {
          action: "send_email",
          subject: "Hola",
        },
      },
      deps
    );
    assert.fail("Expected workflow action validation error");
  } catch (error) {
    assert.equal(isWorkflowActionExecutionError(error), true);
    if (!isWorkflowActionExecutionError(error)) {
      throw error;
    }

    assert.equal(error.workflowError.code, "validation_error");
    assert.equal(error.policyDecision, "fail_closed");
  }
}

async function main(): Promise<void> {
  await runSalesforceExecutionTest();
  await runGmailExecutionTest();
  await runValidationFailureTest();
  console.log("workflow action runtime checks passed");
}

void main();
