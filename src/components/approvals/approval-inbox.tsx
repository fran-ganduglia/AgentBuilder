"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalItem } from "@/types/app";

type ApprovalInboxProps = {
  pendingItems: ApprovalItem[];
  recentItems: ApprovalItem[];
};

type MutationState = {
  itemId: string | null;
  action: "approve" | "reject" | null;
  error: string | null;
};

type JsonRecord = Record<string, unknown>;

type GoogleCalendarActionInput = {
  action?: string;
  title?: string;
  startIso?: string;
  endIso?: string;
  timezone?: string;
  description?: string;
  location?: string;
  attendeeEmails?: string[];
  eventId?: string;
  eventTitle?: string;
  eventStartIso?: string;
  eventEndIso?: string;
  eventTimezone?: string;
};

type GoogleCalendarResolvedEvent = {
  id?: string;
  title?: string;
  startIso?: string;
  endIso?: string;
  timezone?: string;
};

type GmailActionInput = {
  action?: string;
  threadId?: string;
  messageId?: string;
  rfcMessageId?: string;
  subject?: string;
  body?: string;
  labelName?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
};

function toRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatDateTimeParts(value: string | null, timezone?: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formatter = new Intl.DateTimeFormat("es-AR", {
    ...(timezone ? { timeZone: timezone } : {}),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";

  const dateLabel = [day, month, year].filter((part) => part.length > 0).join(" ");
  const timeLabel = [hour, minute].every((part) => part.length > 0)
    ? `${hour}:${minute}${dayPeriod ? ` ${dayPeriod.replace(/\s+/g, " ").trim()}` : ""}`
    : "";

  return [dateLabel, timeLabel].filter((part) => part.length > 0).join(", ");
}

function formatDateTime(value: string | null): string {
  return formatDateTimeParts(value);
}

function riskStyles(riskLevel: string): string {
  switch (riskLevel) {
    case "high":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    case "low":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    default:
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
  }
}

function statusStyles(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "rejected":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    case "expired":
      return "bg-slate-100 text-slate-700 ring-slate-600/20";
    default:
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
  }
}

async function resolveApproval(
  approvalItemId: string,
  action: "approve" | "reject",
  editedActionInput?: Record<string, unknown>
): Promise<{ error?: string }> {
  const response = await fetch("/api/approvals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approvalItemId,
      action,
      ...(editedActionInput ? { editedActionInput } : {}),
    }),
  });

  const json = (await response.json()) as { error?: string };

  if (!response.ok) {
    return { error: json.error ?? "No se pudo resolver la aprobacion." };
  }

  return {};
}

function formatDateTimeWithTimezone(
  value: string | null,
  timezone?: string | null
): string {
  return formatDateTimeParts(value, timezone);
}

function getActionLabel(action: string): string {
  switch (action) {
    case "create_event":
      return "Crear evento";
    case "reschedule_event":
      return "Reprogramar evento";
    case "cancel_event":
      return "Cancelar evento";
    default:
      return action;
  }
}

function renderKeyValue(label: string, value: string | null) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200">
      <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function GoogleCalendarApprovalDetails({ item }: { item: ApprovalItem }) {
  const payloadSummary = toRecord(item.payload_summary);
  const actionInput = toRecord(payloadSummary.action_input) as GoogleCalendarActionInput;
  const resolvedEvent = toRecord(payloadSummary.resolved_event) as GoogleCalendarResolvedEvent;

  const action = getString(actionInput.action) ?? item.action;
  const createTimezone = getString(actionInput.timezone);
  const resolvedTimezone =
    getString(actionInput.eventTimezone) ??
    getString(resolvedEvent.timezone) ??
    createTimezone;
  const targetTitle =
    getString(actionInput.eventTitle) ??
    getString(resolvedEvent.title) ??
    getString(actionInput.title);
  const targetEventId =
    getString(actionInput.eventId) ??
    getString(resolvedEvent.id);
  const targetStart =
    getString(actionInput.eventStartIso) ??
    getString(resolvedEvent.startIso);
  const targetEnd =
    getString(actionInput.eventEndIso) ??
    getString(resolvedEvent.endIso);

  const nextStart = getString(actionInput.startIso);
  const nextEnd = getString(actionInput.endIso);

  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">
        Detalle operativo
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {renderKeyValue("Accion", getActionLabel(action))}
        {renderKeyValue("Evento", targetTitle ?? targetEventId)}
        {renderKeyValue("Id evento", targetEventId)}
        {renderKeyValue("Timezone", resolvedTimezone ?? createTimezone)}
        {renderKeyValue("Ubicacion", getString(actionInput.location))}
        {renderKeyValue(
          "Invitados",
          Array.isArray(actionInput.attendeeEmails)
            ? actionInput.attendeeEmails
                .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                .join(", ")
            : null
        )}
        {action === "create_event"
          ? renderKeyValue(
              "Horario",
              nextStart && nextEnd
                ? `${formatDateTimeWithTimezone(nextStart, createTimezone)} a ${formatDateTimeWithTimezone(nextEnd, createTimezone)}`
                : null
            )
          : null}
        {action === "reschedule_event" || action === "cancel_event"
          ? renderKeyValue(
              "Horario actual",
              targetStart && targetEnd
                ? `${formatDateTimeWithTimezone(targetStart, resolvedTimezone)} a ${formatDateTimeWithTimezone(targetEnd, resolvedTimezone)}`
                : null
            )
          : null}
        {action === "reschedule_event"
          ? renderKeyValue(
              "Nuevo horario",
              nextStart && nextEnd
                ? `${formatDateTimeWithTimezone(nextStart, createTimezone)} a ${formatDateTimeWithTimezone(nextEnd, createTimezone)}`
                : null
            )
          : null}
        {renderKeyValue("Descripcion", getString(actionInput.description))}
      </div>
    </div>
  );
}

function getGmailActionLabel(action: string): string {
  switch (action) {
    case "create_draft_reply": return "Crear borrador de respuesta";
    case "create_draft_email": return "Crear borrador nuevo";
    case "send_reply": return "Enviar respuesta";
    case "send_email": return "Enviar email nuevo";
    case "archive_thread": return "Archivar thread";
    case "apply_label": return "Aplicar label";
    default: return action;
  }
}

function renderEditableField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  options?: { multiline?: boolean; readonly?: boolean }
) {
  return (
    <div className="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200">
      <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      {options?.multiline ? (
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={options?.readonly}
          rows={4}
        />
      ) : (
        <input
          type="text"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={options?.readonly}
        />
      )}
    </div>
  );
}

function GmailApprovalDetails({
  item,
  isPending,
  editState,
  onEditChange,
}: {
  item: ApprovalItem;
  isPending: boolean;
  editState: GmailActionInput;
  onEditChange: (state: GmailActionInput) => void;
}) {
  const payloadSummary = toRecord(item.payload_summary);
  const actionInput = toRecord(payloadSummary.action_input) as GmailActionInput;
  const action = getString(actionInput.action) ?? item.action;
  const isStandalone = action === "create_draft_email" || action === "send_email";
  const isReplyLike = action === "create_draft_reply" || action === "send_reply";
  const isEditable = isPending && (isStandalone || isReplyLike);

  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700">
        Detalle operativo
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {renderKeyValue("Accion", getGmailActionLabel(action))}
        {!isStandalone ? renderKeyValue("Thread", getString(actionInput.threadId)) : null}
        {!isStandalone ? renderKeyValue("Message", getString(actionInput.messageId)) : null}
        {!isStandalone ? renderKeyValue("RFC Message-Id", getString(actionInput.rfcMessageId)) : null}
        {renderKeyValue("Label", getString(actionInput.labelName))}
      </div>
      {isEditable ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Campos editables</p>
          {isStandalone ? (
            renderEditableField(
              "Destinatarios (to)",
              (editState.to ?? []).join(", "),
              (v) => onEditChange({ ...editState, to: v.split(",").map((e) => e.trim()).filter(Boolean) })
            )
          ) : null}
          {renderEditableField(
            "Asunto",
            editState.subject ?? "",
            (v) => onEditChange({ ...editState, subject: v })
          )}
          {renderEditableField(
            "CC",
            (editState.cc ?? []).join(", "),
            (v) => onEditChange({ ...editState, cc: v.split(",").map((e) => e.trim()).filter(Boolean) })
          )}
          {renderEditableField(
            "BCC",
            (editState.bcc ?? []).join(", "),
            (v) => onEditChange({ ...editState, bcc: v.split(",").map((e) => e.trim()).filter(Boolean) })
          )}
          {renderEditableField(
            action.includes("draft") ? "Borrador" : "Contenido",
            editState.body ?? "",
            (v) => onEditChange({ ...editState, body: v }),
            { multiline: true }
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {isStandalone && Array.isArray(actionInput.to)
            ? renderKeyValue("Destinatarios", actionInput.to.join(", "))
            : null}
          {renderKeyValue("Asunto", getString(actionInput.subject))}
          {Array.isArray(actionInput.cc) && actionInput.cc.length > 0
            ? renderKeyValue("CC", actionInput.cc.join(", "))
            : null}
          {Array.isArray(actionInput.bcc) && actionInput.bcc.length > 0
            ? renderKeyValue("BCC", actionInput.bcc.join(", "))
            : null}
          {renderKeyValue(action.includes("draft") ? "Borrador" : "Contenido", getString(actionInput.body))}
        </div>
      )}
    </div>
  );
}

function ApprovalDetails({
  item,
  isPending,
  gmailEditState,
  onGmailEditChange,
}: {
  item: ApprovalItem;
  isPending: boolean;
  gmailEditState: GmailActionInput;
  onGmailEditChange: (state: GmailActionInput) => void;
}) {
  if (item.provider === "google_calendar") {
    return <GoogleCalendarApprovalDetails item={item} />;
  }

  if (item.provider === "gmail") {
    return (
      <GmailApprovalDetails
        item={item}
        isPending={isPending}
        editState={gmailEditState}
        onEditChange={onGmailEditChange}
      />
    );
  }

  return null;
}

function initGmailEditState(item: ApprovalItem): GmailActionInput {
  const payloadSummary = toRecord(item.payload_summary);
  const actionInput = toRecord(payloadSummary.action_input) as GmailActionInput;
  return {
    action: actionInput.action ?? item.action,
    subject: actionInput.subject ?? "",
    body: actionInput.body ?? "",
    to: Array.isArray(actionInput.to) ? actionInput.to : [],
    cc: Array.isArray(actionInput.cc) ? actionInput.cc : [],
    bcc: Array.isArray(actionInput.bcc) ? actionInput.bcc : [],
  };
}

function buildGmailEditPayload(item: ApprovalItem, editState: GmailActionInput): Record<string, unknown> | undefined {
  const action = editState.action ?? item.action;
  const isEditable =
    action === "create_draft_reply" ||
    action === "send_reply" ||
    action === "create_draft_email" ||
    action === "send_email";

  if (!isEditable) {
    return undefined;
  }

  const payload: Record<string, unknown> = { action };
  if (editState.body) payload.body = editState.body;
  if (editState.subject) payload.subject = editState.subject;
  if (editState.cc?.length) payload.cc = editState.cc;
  if (editState.bcc?.length) payload.bcc = editState.bcc;
  if (editState.to?.length) payload.to = editState.to;

  return payload;
}

function ApprovalCard({
  item,
  isMutating,
  onApprove,
  onReject,
}: {
  item: ApprovalItem;
  isMutating: boolean;
  onApprove: (id: string, editedActionInput?: Record<string, unknown>) => void;
  onReject: (id: string) => void;
}) {
  const [gmailEdit, setGmailEdit] = useState<GmailActionInput>(() => initGmailEditState(item));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ring-1 ring-inset ${statusStyles(item.status)}`}>
              {item.status}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ring-1 ring-inset ${riskStyles(item.risk_level)}`}>
              Riesgo {item.risk_level}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-inset ring-slate-200">
              {item.provider}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-inset ring-slate-200">
              {item.action}
            </span>
          </div>

          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{item.summary}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Step <span className="font-semibold text-slate-900">{item.workflow_step_id}</span> del workflow run{" "}
              <span className="font-semibold text-slate-900">{item.workflow_run_id}</span>.
            </p>
          </div>

          <dl className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Expira</dt>
              <dd className="mt-1 font-medium text-slate-900">{formatDateTime(item.expires_at)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Resuelta</dt>
              <dd className="mt-1 font-medium text-slate-900">{formatDateTime(item.resolved_at)}</dd>
            </div>
          </dl>
        </div>

        {item.status === "pending" ? (
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => onReject(item.id)}
              disabled={isMutating}
              className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => {
                const editPayload = item.provider === "gmail"
                  ? buildGmailEditPayload(item, gmailEdit)
                  : undefined;
                onApprove(item.id, editPayload);
              }}
              disabled={isMutating}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aprobar
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <ApprovalDetails
          item={item}
          isPending={item.status === "pending"}
          gmailEditState={gmailEdit}
          onGmailEditChange={setGmailEdit}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Payload resumido</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
            {JSON.stringify(item.payload_summary ?? {}, null, 2)}
          </pre>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Contexto</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
            {JSON.stringify(item.context ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </article>
  );
}

export function ApprovalInbox({ pendingItems, recentItems }: ApprovalInboxProps) {
  const router = useRouter();
  const [mutation, setMutation] = useState<MutationState>({
    itemId: null,
    action: null,
    error: null,
  });

  function handleResolve(
    approvalItemId: string,
    action: "approve" | "reject",
    editedActionInput?: Record<string, unknown>
  ) {
    setMutation({ itemId: approvalItemId, action, error: null });

    startTransition(async () => {
      const result = await resolveApproval(approvalItemId, action, editedActionInput);

      if (result.error) {
        setMutation({ itemId: approvalItemId, action, error: result.error });
        return;
      }

      setMutation({ itemId: null, action: null, error: null });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Approval inbox</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Aprobaciones pendientes</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Esta vista concentra las acciones asistidas que esperan validacion humana. Ninguna queda colgada en
              `waiting_approval`: si expiran pasan a `expired` y el workflow queda trazado para compensacion o reparacion manual.
            </p>
          </div>
          <div className="inline-flex items-center rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-sm">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Pendientes</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{pendingItems.length}</p>
            </div>
          </div>
        </div>
      </section>

      {mutation.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {mutation.error}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Pendientes ahora</h2>
          <p className="mt-1 text-sm text-slate-500">
            Acciones listas para aprobar o rechazar desde la app.
          </p>
        </div>

        {pendingItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-slate-900">No hay aprobaciones pendientes.</p>
            <p className="mt-2 text-sm text-slate-500">
              Cuando una accion assisted requiera validacion, aparecera aqui con su riesgo, contexto y expiracion.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingItems.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                isMutating={mutation.itemId === item.id}
                onApprove={(id, editPayload) => handleResolve(id, "approve", editPayload)}
                onReject={(id) => handleResolve(id, "reject")}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Historial reciente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ultimas aprobaciones resueltas o expiradas para trazabilidad operativa.
          </p>
        </div>

        <div className="space-y-4">
          {recentItems.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              isMutating={false}
              onApprove={() => undefined}
              onReject={() => undefined}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
