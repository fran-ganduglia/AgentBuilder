import {
  createRecentActionContext,
  type RecentActionContext,
  type RuntimeTraceSummaryMetadata,
} from "@/lib/chat/conversation-metadata";

import type {
  ActionExecutionOutcomeV1,
  ActionPlanV1,
  ExecutionTraceV1,
  RuntimeActionType,
} from "./types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function extractCalendarEventRecords(output: Record<string, unknown>): Record<string, unknown>[] {
  const evidence =
    asRecord(output.evidence) ??
    getNestedRecord(output, "data") ??
    getNestedRecord(output, "data", "data");

  return asRecordArray(evidence?.events ?? output.events);
}

function getNestedRecord(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  let current: unknown = value;

  for (const key of keys) {
    const record = asRecord(current);
    if (!record || !(key in record)) {
      return null;
    }

    current = record[key];
  }

  return asRecord(current);
}

function summarizeSearchThreads(output: Record<string, unknown>): string {
  const threads = Array.isArray(output.threads) ? output.threads : [];
  if (threads.length === 0) {
    return "No encontre threads que coincidan con esa busqueda.";
  }

  const lines = threads.slice(0, 5).map((entry, index) => {
    const thread = asRecord(entry) ?? {};
    const subject = asString(thread.subject) ?? "Sin asunto";
    const from = asString(thread.from);
    const date = asString(thread.date);
    const snippet = asString(thread.snippet);
    return [
      `${index + 1}. ${subject}`,
      from ? `de ${from}` : null,
      date ? `(${date})` : null,
      snippet ? `- ${snippet}` : null,
    ].filter(Boolean).join(" ");
  });

  return ["Encontre estos threads:", ...lines].join("\n");
}

function summarizeThreadEvidence(output: Record<string, unknown>): string {
  const evidence = asRecord(output.evidence);

  if (!evidence) {
    return asString(output.summary) ?? "Lei el hilo, pero no pude construir el resumen final.";
  }

  const subject = asString(evidence.subject) ?? "Sin asunto";
  const messageCount = typeof evidence.messageCount === "number" ? evidence.messageCount : null;
  const messages = Array.isArray(evidence.messages) ? evidence.messages : [];
  const lines = messages.slice(0, 5).map((entry, index) => {
    const message = asRecord(entry) ?? {};
    const from = asString(message.from) ?? "Remitente no disponible";
    const date = asString(message.date);
    const snippet = asString(message.snippet) ?? "Sin snippet";
    return `${index + 1}. ${from}${date ? ` (${date})` : ""}: ${snippet}`;
  });

  return [
    `Hilo: ${subject}.`,
    messageCount !== null ? `Mensajes: ${messageCount}.` : null,
    lines.length > 0 ? "Evidencia leida:" : null,
    ...lines,
  ].filter(Boolean).join("\n");
}

function summarizeCalendarEvents(output: Record<string, unknown>): string {
  const evidence =
    asRecord(output.evidence) ??
    getNestedRecord(output, "data") ??
    getNestedRecord(output, "data", "data");
  const events = asRecordArray(evidence?.events ?? output.events);

  if (events.length === 0) {
    return asString(output.summary) ?? "No encontre eventos en esa ventana.";
  }

  const lines = events.slice(0, 5).map((event, index) => {
    const title = asString(event.title) ?? asString(event.summary) ?? "Evento sin titulo";
    const start = asString(event.startIso) ?? asString(event.start) ?? asString(event.startTime);
    const end = asString(event.endIso) ?? asString(event.end) ?? asString(event.endTime);
    return `${index + 1}. ${title}${start ? ` Â· ${start}` : ""}${end ? ` -> ${end}` : ""}`;
  });

  return [`Encontre ${events.length} eventos en esa ventana:`, ...lines].join("\n");
}

function summarizeSheetRead(output: Record<string, unknown>): string {
  const evidence =
    asRecord(output.evidence) ??
    getNestedRecord(output, "data") ??
    getNestedRecord(output, "data", "data");
  const values = Array.isArray(evidence?.values) ? evidence.values : [];

  if (values.length === 0) {
    return asString(output.summary) ?? "Lei el rango, pero no encontre filas con datos.";
  }

  const sampleRows = values.slice(0, 3).map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")).join(" | ") : String(row)
  );

  return [
    `Lei ${values.length} filas del rango solicitado.`,
    sampleRows.length > 0 ? "Primeras filas:" : null,
    ...sampleRows,
  ].filter(Boolean).join("\n");
}

function summarizeSalesforceRecords(output: Record<string, unknown>): string {
  const evidence =
    asRecord(output.evidence) ??
    getNestedRecord(output, "data") ??
    getNestedRecord(output, "data", "data");
  const candidateArrays = ["records", "leads", "accounts", "opportunities", "cases", "items"];
  const records =
    candidateArrays
      .map((key) => asRecordArray(evidence?.[key]))
      .find((items) => items.length > 0) ?? [];

  if (records.length === 0) {
    return asString(output.summary) ?? "La busqueda CRM no devolvio resultados.";
  }

  const lines = records.slice(0, 5).map((record, index) => {
    const label =
      asString(record.name) ??
      asString(record.fullName) ??
      asString(record.subject) ??
      asString(record.company) ??
      asString(record.email) ??
      asString(record.id) ??
      "Registro";
    return `${index + 1}. ${label}`;
  });

  return [`Encontre ${records.length} registros:`, ...lines].join("\n");
}

function summarizeApproval(output: Record<string, unknown>, actionType: RuntimeActionType): string {
  const preview = asRecord(output.preview) ?? {};

  if (actionType === "send_email") {
    const to = asStringArray(preview.to);
    const subject = asString(preview.subject) ?? "Sin asunto";
    return `Prepare una solicitud de aprobacion para enviar el email a ${to.join(", ")} con asunto "${subject}". Revisala en tu inbox de approvals.`;
  }

  if (actionType === "archive_thread") {
    const target = asString(preview.subject) ?? asString(preview.threadId) ?? "seleccionado";
    return `Prepare una solicitud de aprobacion para archivar el hilo "${target}". Revisala en tu inbox de approvals.`;
  }

  if (actionType === "apply_label") {
    const label = asString(preview.labelName) ?? "seleccionada";
    const target = asString(preview.subject) ?? asString(preview.threadId) ?? "seleccionado";
    return `Prepare una solicitud de aprobacion para aplicar la etiqueta "${label}" al hilo "${target}". Revisala en tu inbox de approvals.`;
  }

  if (actionType === "create_event" || actionType === "reschedule_event") {
    const title = asString(preview.title) ?? asString(preview.eventTitle) ?? "evento sin titulo";
    const startIso = asString(preview.startIso) ?? "sin fecha";
    const endIso = asString(preview.endIso) ?? "sin fecha";
    const verb = actionType === "create_event" ? "crear" : "reprogramar";
    return `Prepare una solicitud de aprobacion para ${verb} el evento "${title}" entre ${startIso} y ${endIso}. Revisala en tu inbox de approvals.`;
  }

  if (actionType === "cancel_event") {
    const target = asString(preview.eventTitle) ?? asString(preview.eventId) ?? "evento seleccionado";
    return `Prepare una solicitud de aprobacion para cancelar el evento "${target}". Revisala en tu inbox de approvals.`;
  }

  if (actionType === "append_sheet_rows" || actionType === "update_sheet_range") {
    const rowCount = Array.isArray(preview.values) ? preview.values.length : 0;
    const sheetName = asString(preview.sheetName) ?? "la hoja";
    const rangeA1 = asString(preview.rangeA1);
    const verb = actionType === "append_sheet_rows" ? "agregar" : "actualizar";
    return `Prepare una solicitud de aprobacion para ${verb} ${rowCount} filas en ${sheetName}${rangeA1 ? ` (${rangeA1})` : ""}. Revisala en tu inbox de approvals.`;
  }

  if (actionType === "create_lead") {
    const lastName = asString(preview.lastName) ?? "nuevo lead";
    const company = asString(preview.company) ?? "empresa sin nombre";
    return `Prepare una solicitud de aprobacion para crear el lead ${lastName} en ${company}. Revisala en tu inbox de approvals.`;
  }

  if (actionType === "update_lead") {
    const leadId = asString(preview.leadId) ?? "lead seleccionado";
    return `Prepare una solicitud de aprobacion para actualizar el lead ${leadId}. Revisala en tu inbox de approvals.`;
  }

  if (actionType === "create_task") {
    const subject = asString(preview.subject) ?? "task sin asunto";
    return `Prepare una solicitud de aprobacion para crear la tarea "${subject}" en Salesforce. Revisala en tu inbox de approvals.`;
  }

  return "Prepare una solicitud de aprobacion. Revisala en tu inbox de approvals.";
}

export function renderRuntimeSuccessMessage(input: {
  actionType: RuntimeActionType;
  output: Record<string, unknown>;
  semanticSummary?: string | null;
}): string {
  if (input.actionType === "search_email") {
    return summarizeSearchThreads(input.output);
  }

  if (input.actionType === "summarize_thread") {
    return input.semanticSummary?.trim() || summarizeThreadEvidence(input.output);
  }

  if (input.actionType === "list_events") {
    return summarizeCalendarEvents(input.output);
  }

  if (input.actionType === "read_sheet_range") {
    return summarizeSheetRead(input.output);
  }

  if (input.actionType === "search_records") {
    return summarizeSalesforceRecords(input.output);
  }

  return summarizeApproval(input.output, input.actionType);
}

function formatClarificationCandidateLines(candidates: unknown[]): string[] {
  return candidates
    .map((candidate) => {
      const record = asRecord(candidate);
      if (!record) {
        return typeof candidate === "string" ? `- ${candidate}` : null;
      }

      const email = asString(record.email);
      const label = asString(record.label);
      const threadId = asString(record.threadId);
      const eventId = asString(record.eventId);

      if (email && label) {
        return `- ${label} <${email}>`;
      }

      if (email) {
        return `- ${email}`;
      }

      if (threadId && label) {
        return `- ${label} (${threadId})`;
      }

      if (eventId && label) {
        return `- ${label} (${eventId})`;
      }

      if (threadId) {
        return `- ${threadId}`;
      }

      if (eventId) {
        return `- ${eventId}`;
      }

      return null;
    })
    .filter((line): line is string => Boolean(line));
}

export function renderRuntimeNonSuccessMessage(input: {
  actionType: RuntimeActionType;
  status: "needs_user" | "failed" | "blocked";
  reason?: string;
  output?: Record<string, unknown>;
}): string {
  const reason = input.reason ?? "";
  const candidates = Array.isArray(input.output?.candidates)
    ? input.output.candidates
    : [];

  if (input.status === "blocked") {
    if (reason === "integration_inactive" || reason === "scope_missing") {
      return "No puedo completar esa accion porque la integracion necesaria no esta disponible o le faltan permisos.";
    }

    if (reason === "missing_auth") {
      return "No pude validar la autenticacion para ejecutar esa accion.";
    }

    if (reason === "integration_blocked") {
      return "No puedo completar esa accion porque la integracion requerida esta bloqueada para este agente.";
    }

    if (reason.startsWith("provider_blocked:")) {
      const provider = reason.slice("provider_blocked:".length).trim();
      return provider.length > 0
        ? `No puedo completar esa accion porque el proveedor ${provider} esta bloqueado para este agente u organizacion.`
        : "No puedo completar esa accion porque el proveedor requerido esta bloqueado.";
    }

    if (reason.startsWith("channel_blocked:")) {
      const channel = reason.slice("channel_blocked:".length).trim();
      return channel.length > 0
        ? `No puedo completar esa accion desde el canal ${channel}.`
        : "No puedo completar esa accion desde este canal.";
    }

    if (reason.startsWith("surface_blocked:")) {
      const surface = reason.slice("surface_blocked:".length).trim();
      return surface.length > 0
        ? `No puedo completar esa accion porque la surface ${surface} esta bloqueada.`
        : "No puedo completar esa accion porque la surface requerida esta bloqueada.";
    }

    if (reason === "plan_action_blocked") {
      return "No puedo completar esa accion porque tu plan actual no la permite.";
    }

    if (reason === "agent_action_blocked" || reason === "organization_action_blocked") {
      return "No puedo completar esa accion porque esta deshabilitada para este agente u organizacion.";
    }

    if (reason === "action_not_supported" || reason === "runtime_unavailable_for_action") {
      return "No puedo completar esa accion porque este agente todavia no tiene disponible esa capacidad en el runtime actual.";
    }

    if (
      reason === "organization_concurrency_limit_exceeded" ||
      reason === "agent_concurrency_limit_exceeded" ||
      reason === "surface_concurrency_limit_exceeded"
    ) {
      return "No puedo completar esa accion en este momento porque se alcanzo el limite de ejecuciones concurrentes.";
    }

    if (reason === "provider_budget_throttled") {
      return "No puedo completar esa accion ahora porque el proveedor esta temporalmente limitado por presupuesto o throttling.";
    }

    if (reason === "turn_budget_exceeded" || reason === "plan_cost_estimate_exceeds_budget") {
      return "No puedo completar esa accion porque supera el presupuesto disponible para esta ejecucion.";
    }

    if (reason === "destructive_action_limit_exceeded") {
      return "No puedo completar esa accion porque se alcanzo el limite de acciones sensibles para esta ejecucion.";
    }

    return "No pude continuar con esa accion porque quedo bloqueada por policy o por la integracion.";
  }

  if (reason.includes("thread")) {
    const lines = formatClarificationCandidateLines(candidates);
    if (lines.length > 1) {
      return [
        `Encontre ${lines.length} hilos recientes. ¿Cual queres usar?`,
        ...lines,
      ].join("\n");
    }

    return "Necesito que me indiques exactamente que hilo quieres usar.";
  }

  if (reason.includes("event")) {
    const lines = formatClarificationCandidateLines(candidates);
    if (lines.length > 1) {
      return [
        `Encontre ${lines.length} eventos recientes. ¿Cual queres usar?`,
        ...lines,
      ].join("\n");
    }

    return "Necesito que me indiques exactamente que evento quieres usar.";
  }

  if (reason.includes("recipient") || reason.includes("to")) {
    if (reason === "recipient_requires_literal_email") {
      return "Necesito el email exacto del destinatario para continuar.";
    }

    if (candidates.length > 1) {
      const lines = candidates
        .map((candidate) => {
          if (!candidate || typeof candidate !== "object") {
            return null;
          }

          const record = candidate as Record<string, unknown>;
          const email = asString(record.email);
          const label = asString(record.label);
          if (!email) {
            return null;
          }

          return label ? `- ${label} <${email}>` : `- ${email}`;
        })
        .filter((line): line is string => Boolean(line));

      return [
        `Encontre ${candidates.length} contactos. ¿Cual queres usar?`,
        ...lines,
      ].join("\n");
    }

    return "Necesito el email exacto del destinatario para continuar.";
  }

  if (reason.includes("start") || reason.includes("end")) {
    return "Necesito una fecha y horario claros para ese evento.";
  }

  if (reason.includes("title")) {
    return "Necesito el titulo del evento para continuar.";
  }

  if (reason.includes("sheet") || reason.includes("range")) {
    return "Necesito que me indiques con precision la hoja o el rango que quieres usar.";
  }

  if (reason.includes("record") || reason.includes("lead")) {
    return "Necesito que me indiques exactamente que registro quieres usar.";
  }

  if (input.status === "failed") {
    return "No pude completar esa accion por un error interno. Intenta de nuevo.";
  }

  return "Necesito un poco mas de informacion para continuar con esa accion.";
}

export function buildRuntimeTraceSummary(input: {
  plan: ActionPlanV1;
  trace: ExecutionTraceV1;
  outcome: "success" | "needs_user" | "failed" | "blocked";
  capturedAt?: string;
}): RuntimeTraceSummaryMetadata {
  return {
    traceId: input.trace.traceId,
    requestId: input.trace.requestId,
    outcome: input.outcome,
    planIntent: input.plan.intent,
    actionCount: input.trace.actions.length,
    eventCount: input.trace.events.length,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    actions: input.trace.actions.map((action) => ({
      actionId: action.actionId,
      actionType: action.actionType,
      status: action.status,
      ...(action.currentNode ? { currentNode: action.currentNode } : {}),
      ...(action.reason ? { reason: action.reason.slice(0, 200) } : {}),
      ...(asString(action.output?.approvalItemId) ? { approvalItemId: action.output?.approvalItemId as string } : {}),
      ...(asString(action.output?.workflowRunId) ? { workflowRunId: action.output?.workflowRunId as string } : {}),
    })),
  };
}

export function buildRecentDeclarativeContextFromRuntime(input: {
  actions: ActionExecutionOutcomeV1[];
}): RecentActionContext | null {
  const snapshots: RecentActionContext["actions"] = [];

  for (const action of input.actions) {
    if (action.status !== "success" || !action.output) {
      continue;
    }

    if (action.actionType === "search_email") {
      const threads = Array.isArray(action.output.threads) ? action.output.threads : [];
      snapshots.push({
        provider: "gmail",
        action: "search_threads",
        summary: asString(action.output.summary) ?? "Threads leidos desde runtime_v1.",
        result: {
          kind: "gmail_search_threads",
          threads: threads.slice(0, 5).map((entry) => {
            const thread = asRecord(entry) ?? {};
            return {
              threadId: asString(thread.threadId) ?? "unknown-thread",
              ...(asString(thread.subject) ? { subject: asString(thread.subject) } : {}),
              ...(asString(thread.from) ? { from: asString(thread.from) } : {}),
              ...(asString(thread.date) ? { date: asString(thread.date) } : {}),
            };
          }),
        },
      });
      continue;
    }

    if (action.actionType === "summarize_thread") {
      const evidence = asRecord(action.output.evidence);

      if (!evidence) {
        continue;
      }

      snapshots.push({
        provider: "gmail",
        action: "read_thread",
        summary: asString(action.output.summary) ?? "Hilo leido desde runtime_v1.",
        result: {
          kind: "gmail_read_thread",
          threadId: asString(evidence.threadId) ?? "unknown-thread",
          ...(asString(evidence.subject) ? { subject: asString(evidence.subject) } : {}),
          ...(asString(evidence.latestMessageId) ? { latestMessageId: asString(evidence.latestMessageId) } : {}),
        },
      });
      continue;
    }

    if (action.actionType === "list_events") {
      const events = extractCalendarEventRecords(action.output);

      snapshots.push({
        provider: "google_calendar",
        action: "list_events",
        summary: asString(action.output.summary) ?? "Eventos leidos desde runtime_v1.",
        result: {
          kind: "google_calendar_list_events",
          events: events.slice(0, 10).map((entry) => ({
            ...(asString(entry.id) ? { id: asString(entry.id) } : {}),
            ...(asString(entry.title) ? { title: asString(entry.title) } : {}),
            ...(asString(entry.startIso) ? { startIso: asString(entry.startIso) } : {}),
            ...(asString(entry.endIso) ? { endIso: asString(entry.endIso) } : {}),
          })),
        },
      });
    }
  }

  return snapshots.length > 0 ? createRecentActionContext(snapshots.slice(-3)) : null;
}
