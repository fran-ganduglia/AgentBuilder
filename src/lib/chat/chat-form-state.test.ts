import assert from "node:assert/strict";
import { buildActiveChatUiState } from "./chat-form-server";
import type { Conversation } from "@/types/app";

function buildConversationWithPendingForm(): Conversation {
  return {
    id: "df90fe30-5288-4798-b2cf-7228297647f2",
    agent_id: "agent-1",
    organization_id: "org-1",
    initiated_by: "user-1",
    channel: "web",
    status: "active",
    metadata: {
      pending_chat_form: {
        kind: "dynamic_form",
        formId: "gmail:send_email",
        provider: "google",
        surface: "gmail",
        action: "send_email",
        toolName: "gmail_send_email",
        message: "Completa los datos faltantes.",
        definition: {
          title: "Enviar email nuevo",
          fields: [
            { key: "action", type: "text", label: "Accion", required: true },
            { key: "to", type: "textarea", label: "Para", required: true },
            { key: "body", type: "textarea", label: "Mensaje", required: true },
          ],
        },
        initialValues: {
          action: "send_email",
        },
        fieldUi: {
          action: {
            hidden: true,
            readOnly: true,
          },
        },
        sourceMessageId: "1ca1b5e2-69b6-44b8-9182-1cb33d02895b",
        createdAt: new Date().toISOString(),
      },
    },
    external_id: null,
    message_count: 0,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as Conversation;
}

function run(): void {
  const state = buildActiveChatUiState(buildConversationWithPendingForm());
  assert.equal(state.kind, "dynamic_form");
  assert.equal(state.action, "send_email");
  assert.equal(state.definition.title, "Enviar email nuevo");
  console.log("chat-form-state checks passed");
}

run();
