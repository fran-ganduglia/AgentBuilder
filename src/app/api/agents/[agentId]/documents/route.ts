import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgentAccess } from "@/lib/auth/agent-access";
import { getSession } from "@/lib/auth/get-session";
import { listDocuments, createDocument } from "@/lib/db/agent-documents";
import { enqueueEvent } from "@/lib/db/event-queue";
import { incrementRateLimit } from "@/lib/redis";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const FILE_TYPE_CONFIG = {
  ".pdf": {
    documentType: "pdf",
    mimeTypes: new Set(["application/pdf"]),
  },
  ".txt": {
    documentType: "txt",
    mimeTypes: new Set(["text/plain"]),
  },
  ".csv": {
    documentType: "csv",
    mimeTypes: new Set(["text/csv", "application/vnd.ms-excel"]),
  },
  ".docx": {
    documentType: "docx",
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
  },
} as const;

const ALLOWED_FILE_EXTENSIONS = new Set(Object.keys(FILE_TYPE_CONFIG));

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
):
  | { valid: true; documentType: string }
  | { valid: false; message: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      message: `El archivo no puede superar ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
    };
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

  const config = FILE_TYPE_CONFIG[extension as keyof typeof FILE_TYPE_CONFIG];
  if (!config.mimeTypes.has(file.type)) {
    return {
      valid: false,
      message: `Tipo de archivo no permitido: ${file.type || "desconocido"}`,
    };
  }

  return { valid: true, documentType: config.documentType };
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

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const access = await assertAgentAccess({
    session,
    agentId: agentIdParsed.data,
    capability: "manage_documents",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const { data, error } = await listDocuments(agentIdParsed.data, session.organizationId);

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

  const access = await assertAgentAccess({
    session,
    agentId,
    capability: "manage_documents",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

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

  const fileId = crypto.randomUUID();
  const sanitizedName = sanitizeFileName(file.name);
  const storagePath = `${session.organizationId}/${agentId}/${fileId}-${sanitizedName}`;

  const serviceClient = createServiceSupabaseClient();
  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("agent-documents")
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("documents.storage_upload_error", {
      agentId,
      organizationId: session.organizationId,
      error: uploadError.message,
    });

    return NextResponse.json(
      { error: "No se pudo subir el archivo" },
      { status: 500 }
    );
  }

  const { data: document, error: docError } = await createDocument(
    {
      fileName: sanitizedName,
      fileType: validation.documentType,
      fileSizeBytes: file.size,
      storagePath,
      uploadedBy: session.user.id,
    },
    agentId,
    session.organizationId
  );

  if (docError || !document) {
    console.error("documents.metadata_insert_error", {
      agentId,
      organizationId: session.organizationId,
      error: docError ?? "unknown",
    });

    await serviceClient.storage
      .from("agent-documents")
      .remove([storagePath]);

    return NextResponse.json(
      { error: "No se pudo registrar el documento" },
      { status: 500 }
    );
  }

  await enqueueEvent({
    organizationId: session.organizationId,
    eventType: "document.uploaded",
    entityType: "agent_document",
    entityId: document.id,
    idempotencyKey: `document.uploaded:${document.id}`,
    payload: {
      document_id: document.id,
      agent_id: agentId,
      organization_id: session.organizationId,
      storage_path: storagePath,
      file_type: validation.documentType,
      file_name: sanitizedName,
    },
  });

  return NextResponse.json({ data: document }, { status: 201 });
}
