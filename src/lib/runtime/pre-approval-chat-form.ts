import type { PendingChatFormState } from "@/lib/chat/chat-form-state";
import type { ParamValueV1, RuntimeActionV1 } from "@/lib/runtime/types";
import { buildPendingChatFormForTool } from "@/lib/tools/tool-call-forms";
import { parseToolName } from "@/lib/tools/tool-name-registry";

export const SEND_EMAIL_PREVIEW_FORM_ID = "runtime:gmail:send_email:preview";
export const SEND_EMAIL_PREVIEW_SUBMIT_KEY = "preview_submit_mode";
export const SEND_EMAIL_PREVIEW_SUBMIT_VALUE = "ready_for_approval";

function serializeRuntimeParamValue(param: ParamValueV1): unknown {
  if (param.kind === "primitive") {
    return param.value;
  }

  if (param.kind === "entity" || param.kind === "reference") {
    return param.label ?? param.value;
  }

  if (param.kind === "time") {
    return param.value;
  }

  if (param.kind === "computed") {
    return param.value;
  }

  return undefined;
}

function buildSendEmailArgs(action: RuntimeActionV1): Record<string, unknown> {
  return {
    action: "send_email",
    ...Object.fromEntries(
    Object.entries(action.params)
      .map(([key, value]) => [key, serializeRuntimeParamValue(value)])
      .filter((entry) => entry[1] !== undefined)
    ),
  };
}

export function buildRuntimeSendEmailPreviewForm(
  action: RuntimeActionV1
): PendingChatFormState | null {
  if (action.type !== "send_email" || action.approvalMode !== "required") {
    return null;
  }

  const parsedTool = parseToolName("gmail_send_email");
  if (!parsedTool) {
    return null;
  }

  const baseForm = buildPendingChatFormForTool({
    toolName: "gmail_send_email",
    parsed: parsedTool,
    args: buildSendEmailArgs(action),
  });

  if (!baseForm) {
    return null;
  }

  return {
    ...baseForm,
    formId: SEND_EMAIL_PREVIEW_FORM_ID,
    message:
      "Revise la previsualizacion del email aqui. Puedes editar el asunto, el cuerpo o agregar mas destinatarios antes de enviarlo a approvals.",
    definition: {
      ...baseForm.definition,
      fields: [
        {
          key: SEND_EMAIL_PREVIEW_SUBMIT_KEY,
          type: "text",
          label: "Modo preview",
          required: true,
        },
        ...baseForm.definition.fields,
      ],
    },
    initialValues: {
      ...baseForm.initialValues,
      [SEND_EMAIL_PREVIEW_SUBMIT_KEY]: SEND_EMAIL_PREVIEW_SUBMIT_VALUE,
    },
    fieldUi: {
      ...baseForm.fieldUi,
      [SEND_EMAIL_PREVIEW_SUBMIT_KEY]: {
        hidden: true,
        readOnly: true,
      },
    },
    sourceMessageId: null,
  };
}

export function isRuntimeSendEmailPreviewSubmission(content: string): boolean {
  return (
    new RegExp(
      `(^|\\n)${SEND_EMAIL_PREVIEW_SUBMIT_KEY}:\\s*${SEND_EMAIL_PREVIEW_SUBMIT_VALUE}(\\n|$)`,
      "i"
    ).test(content) && /(^|\n)action:\s*send_email(\n|$)/i.test(content)
  );
}
