import assert from "node:assert/strict";

import { buildDynamicFormSubmissionMessage } from "@/lib/chat/interactive-markers";

import {
  buildRuntimeSendEmailPreviewForm,
  isRuntimeSendEmailPreviewSubmission,
  SEND_EMAIL_PREVIEW_FORM_ID,
  SEND_EMAIL_PREVIEW_SUBMIT_KEY,
  SEND_EMAIL_PREVIEW_SUBMIT_VALUE,
} from "./pre-approval-chat-form";
import type { RuntimeActionV1 } from "./types";

function createSendEmailAction(): RuntimeActionV1 {
  return {
    id: "action-1",
    type: "send_email",
    approvalMode: "required",
    params: {
      to: { kind: "primitive", value: ["jspansecchi@gmail.com"] },
      subject: {
        kind: "primitive",
        value: "Oportunidad exclusiva: Producto innovador para tu negocio",
      },
      body: {
        kind: "primitive",
        value: "Hola Juan,\nTengo una propuesta que puede ayudarte a vender mas.",
      },
    },
  };
}

async function buildPreviewFormTest(): Promise<void> {
  const form = buildRuntimeSendEmailPreviewForm(createSendEmailAction());

  assert.ok(form);
  assert.equal(form?.formId, SEND_EMAIL_PREVIEW_FORM_ID);
  assert.equal(form?.action, "send_email");
  assert.equal(form?.initialValues.to, "jspansecchi@gmail.com");
  assert.equal(
    form?.initialValues.subject,
    "Oportunidad exclusiva: Producto innovador para tu negocio"
  );
  assert.equal(form?.fieldUi[SEND_EMAIL_PREVIEW_SUBMIT_KEY]?.hidden, true);
  assert.equal(
    form?.initialValues[SEND_EMAIL_PREVIEW_SUBMIT_KEY],
    SEND_EMAIL_PREVIEW_SUBMIT_VALUE
  );
}

async function previewSubmissionDetectionTest(): Promise<void> {
  const form = buildRuntimeSendEmailPreviewForm(createSendEmailAction());
  assert.ok(form);

  const serialized = buildDynamicFormSubmissionMessage(
    form!.definition,
    form!.initialValues
  );

  assert.match(serialized, /action: send_email/i);
  assert.match(
    serialized,
    new RegExp(`${SEND_EMAIL_PREVIEW_SUBMIT_KEY}: ${SEND_EMAIL_PREVIEW_SUBMIT_VALUE}`, "i")
  );
  assert.equal(isRuntimeSendEmailPreviewSubmission(serialized), true);
  assert.equal(
    isRuntimeSendEmailPreviewSubmission("action: send_email\nsubject: demo"),
    false
  );
}

async function main(): Promise<void> {
  await buildPreviewFormTest();
  await previewSubmissionDetectionTest();
  console.log("runtime pre-approval chat form checks passed");
}

void main();
