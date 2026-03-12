import "server-only";

import { enqueueEvent } from "@/lib/db/event-queue";
import { generateEmbedding } from "@/lib/llm/embeddings";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { chunkText } from "@/lib/workers/text-chunker";
import { extractText } from "@/lib/workers/text-extractor";

type RagEvent = {
  eventId: string;
  organizationId: string;
  payload: {
    document_id: string;
    agent_id: string;
    storage_path: string;
    file_type: string;
    file_name: string;
  };
};

export async function processDocument(event: RagEvent): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { document_id, agent_id, storage_path, file_type, file_name } = event.payload;

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("agent-documents")
    .download(storage_path);

  if (downloadError || !fileData) {
    await updateDocumentStatus(document_id, event.organizationId, "error");
    throw new Error(`No se pudo descargar el archivo: ${downloadError?.message ?? "sin datos"}`);
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  let text: string;
  try {
    text = await extractText(buffer, file_type);
  } catch (err) {
    await updateDocumentStatus(document_id, event.organizationId, "error");
    throw new Error(
      `Error extrayendo texto de ${file_name}: ${err instanceof Error ? err.message : "desconocido"}`
    );
  }

  if (text.trim().length === 0) {
    await updateDocumentStatus(document_id, event.organizationId, "error");
    throw new Error(`El archivo ${file_name} no contiene texto extraible`);
  }

  const chunks = chunkText(text);

  if (chunks.length === 0) {
    await updateDocumentStatus(document_id, event.organizationId, "error");
    throw new Error(`No se generaron chunks para ${file_name}`);
  }

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);

    const { error: insertError } = await supabase.from("document_chunks").insert({
      document_id,
      agent_id,
      organization_id: event.organizationId,
      content: chunk.content,
      embedding: JSON.stringify(embedding),
      chunk_index: chunk.chunkIndex,
      token_count: Math.ceil(chunk.content.length / 4),
      metadata: { file_name, file_type },
    });

    if (insertError) {
      console.error("rag.chunk_insert_error", {
        documentId: document_id,
        chunkIndex: chunk.chunkIndex,
        error: insertError.message,
      });
    }
  }

  await updateDocumentStatus(document_id, event.organizationId, "ready", chunks.length);

  await enqueueEvent({
    organizationId: event.organizationId,
    eventType: "document.ready",
    entityType: "agent_document",
    entityId: document_id,
    idempotencyKey: `document.ready:${document_id}`,
    payload: {
      document_id,
      agent_id,
      organization_id: event.organizationId,
      storage_path,
      file_type,
      file_name,
      chunk_count: chunks.length,
    },
  });
}

async function updateDocumentStatus(
  documentId: string,
  organizationId: string,
  status: "ready" | "error",
  chunkCount?: number
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const updatePayload: Record<string, unknown> = { status };
  if (typeof chunkCount === "number") {
    updatePayload.chunk_count = chunkCount;
  }

  await supabase
    .from("agent_documents")
    .update(updatePayload)
    .eq("id", documentId)
    .eq("organization_id", organizationId);
}