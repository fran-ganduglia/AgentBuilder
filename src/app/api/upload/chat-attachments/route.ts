import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/get-session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { incrementRateLimit } from "@/lib/redis";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_UPLOADS = 30;
const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
}

type UploadedFileReference = {
  name: string;
  type: string;
  size: number;
  storagePath: string;
};

export async function POST(
  request: Request
): Promise<NextResponse> {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const uploadCount = await incrementRateLimit(
      `rate_limit:chat_attach:${session.organizationId}`,
      RATE_LIMIT_WINDOW_SECONDS
    );
    if (uploadCount > RATE_LIMIT_MAX_UPLOADS) {
      return NextResponse.json(
        { error: "Demasiados uploads. Intenta de nuevo en una hora." },
        { status: 429 }
      );
    }
  } catch (rateLimitError) {
    console.error("chat_attachments.rate_limit_error", {
      organizationId: session.organizationId,
      error: rateLimitError instanceof Error ? rateLimitError.message : "unknown",
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data" },
      { status: 400 }
    );
  }

  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Se requiere al menos un archivo" },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maximo ${MAX_FILES_PER_REQUEST} archivos por request` },
      { status: 400 }
    );
  }

  const uploaded: UploadedFileReference[] = [];
  const serviceClient = createServiceSupabaseClient();
  const batchId = crypto.randomUUID();

  for (const entry of files) {
    if (!(entry instanceof File)) {
      return NextResponse.json(
        { error: "Todos los campos deben ser archivos" },
        { status: 400 }
      );
    }

    if (entry.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `"${entry.name}" excede el limite de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        },
        { status: 400 }
      );
    }

    if (entry.size === 0) {
      return NextResponse.json(
        { error: `"${entry.name}" esta vacio` },
        { status: 400 }
      );
    }

    const mimeType = entry.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido: ${mimeType}` },
        { status: 400 }
      );
    }

    const sanitizedName = sanitizeFileName(entry.name);
    const storagePath = `${session.organizationId}/${batchId}/${sanitizedName}`;
    const fileBuffer = await entry.arrayBuffer();

    const { error: uploadError } = await serviceClient.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      const normalizedMessage = uploadError.message.toLowerCase();
      const isBucketMissing =
        normalizedMessage.includes("bucket") &&
        normalizedMessage.includes("not found");

      console.error("chat_attachments.upload_error", {
        organizationId: session.organizationId,
        fileName: sanitizedName,
        error: uploadError.message,
      });

      return NextResponse.json(
        {
          error: isBucketMissing
            ? `Falta provisionar el bucket privado "${CHAT_ATTACHMENTS_BUCKET}" en Supabase antes de subir adjuntos.`
            : `No se pudo subir "${entry.name}"`,
        },
        { status: 500 }
      );
    }

    uploaded.push({
      name: sanitizedName,
      type: mimeType,
      size: entry.size,
      storagePath,
    });
  }

  return NextResponse.json({ data: uploaded });
}
