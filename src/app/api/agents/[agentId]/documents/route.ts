import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { getAgentById } from "@/lib/db/agents";
import { listDocuments, createDocument } from "@/lib/db/agent-documents";
import { incrementRateLimit } from "@/lib/redis";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";
import type { TablesInsert } from "@/types/database";

type EventQueueInsert = TablesInsert<"event_queue">;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const ALLOWED_FILE_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".csv", ".docx"]);

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
}

function validateFile(
  file: File
): { valid: true } | { valid: false; message: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, message: `El archivo no puede superar ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` };
  }

  if (file.size === 0) {
    return { valid: false, message: "El archivo esta vacio" };
  }

  const extension = getFileExtension(file.name);
  if (!extension || !ALLOWED_FILE_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      message: `Extension no permitida. Extensiones validas: ${Array.from(ALLOWED_FILE_EXTENSIONS).join(", ")}`,
    };
  }

  // Validate MIME type matches extension
  const expectedExtension = ALLOWED_EXTENSIONS[file.type];
  if (!expectedExtension) {
    return {
      valid: false,
      message: `Tipo de archivo no permitido: ${file.type}`,
    };
  }

  if (expectedExtension !== extension) {
    return {
      valid: false,
      message: `La extension del archivo (${extension}) no coincide con su tipo (${file.type})`,
    };
  }

  return { valid: true };
}

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

const agentIdSchema = z.string().uuid("agentId debe ser un UUID valido");

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const { agentId: rawAgentId } = await context.params;

  const agentIdParsed = agentIdSchema.safeParse(rawAgentId);
  if (!agentIdParsed.success) {
    return NextResponse.json({ error: "agentId invalido" }, { status: 400 });
  }

  const agentId = agentIdParsed.data;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: agent } = await getAgentById(agentId, session.organizationId);
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const { data, error } = await listDocuments(agentId, session.organizationId);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron cargar los documentos" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const { agentId: rawAgentId } = await context.params;

  const agentIdParsed = agentIdSchema.safeParse(rawAgentId);
  if (!agentIdParsed.success) {
    return NextResponse.json({ error: "agentId invalido" }, { status: 400 });
  }

  const agentId = agentIdParsed.data;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Rate limit: 20 uploads per hour per organization
  try {
    const uploadCount = await incrementRateLimit(
      `rate_limit:upload:${session.organizationId}`,
      3600
    );
    if (uploadCount > 20) {
      return NextResponse.json(
        { error: "Demasiados uploads. Intenta de nuevo en una hora." },
        { status: 429 }
      );
    }
  } catch (rateLimitError) {
    console.error("documents.rate_limit_error", {
      organizationId: session.organizationId,
      error: rateLimitError instanceof Error ? rateLimitError.message : "unknown",
    });
  }

  const { data: agent } = await getAgentById(agentId, session.organizationId);
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data con un campo 'file'" },
      { status: 400 }
    );
  }

  const fileField = formData.get("file");
  if (!fileField || !(fileField instanceof File)) {
    return NextResponse.json(
      { error: "El campo 'file' es requerido" },
      { status: 400 }
    );
  }

  const file = fileField;
  const validation = validateFile(file);

  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  // Generate server-side storage path — never use client-provided path
  const fileId = crypto.randomUUID();
  const sanitizedName = sanitizeFileName(file.name);
  const storagePath = `${session.organizationId}/${agentId}/${fileId}-${sanitizedName}`;

  // Upload to Supabase Storage (private bucket) using service_role
  const serviceClient = createServiceSupabaseClient();

  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("agent-documents")
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "No se pudo subir el archivo" },
      { status: 500 }
    );
  }

  // Create agent_documents record
  const { data: document, error: docError } = await createDocument(
    {
      fileName: sanitizedName,
      fileType: file.type,
      fileSizeBytes: file.size,
      storagePath,
      uploadedBy: session.user.id,
    },
    agentId,
    session.organizationId
  );

  if (docError || !document) {
    // Cleanup: remove uploaded file if DB insert fails
    await serviceClient.storage
      .from("agent-documents")
      .remove([storagePath]);

    return NextResponse.json(
      { error: "No se pudo registrar el documento" },
      { status: 500 }
    );
  }

  // Queue processing event for n8n worker
  const eventPayload: EventQueueInsert = {
    organization_id: session.organizationId,
    event_type: "document.uploaded",
    entity_type: "agent_document",
    entity_id: document.id,
    payload: {
      document_id: document.id,
      agent_id: agentId,
      organization_id: session.organizationId,
      storage_path: storagePath,
      file_type: file.type,
      file_name: sanitizedName,
    },
    idempotency_key: document.id,
  };

  const { error: eventError } = await serviceClient
    .from("event_queue")
    .insert(eventPayload);

  if (eventError) {
    console.error("documents.event_queue_error", {
      documentId: document.id,
      error: eventError.message,
    });
    // Non-fatal: document uploaded successfully, worker will pick it up via retry or manual trigger
  }

  return NextResponse.json({ data: document }, { status: 201 });
}
