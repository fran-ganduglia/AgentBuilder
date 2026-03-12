import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Tables, TablesInsert } from "@/types/database";

type DbResult<T> = { data: T | null; error: string | null };

type AgentDocument = Tables<"agent_documents">;
type AgentDocumentInsert = TablesInsert<"agent_documents">;

export type CreateDocumentInput = {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storagePath: string;
  uploadedBy: string;
};

export async function listDocuments(
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentDocument[]>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agent_documents")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as AgentDocument[], error: null };
}

export async function createDocument(
  input: CreateDocumentInput,
  agentId: string,
  organizationId: string
): Promise<DbResult<AgentDocument>> {
  const supabase = createServiceSupabaseClient();

  const insertPayload: AgentDocumentInsert = {
    agent_id: agentId,
    organization_id: organizationId,
    file_name: input.fileName,
    file_type: input.fileType,
    file_size_bytes: input.fileSizeBytes,
    storage_path: input.storagePath,
    uploaded_by: input.uploadedBy,
    status: "processing",
  };

  const { data, error } = await supabase
    .from("agent_documents")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as AgentDocument, error: null };
}

export async function deleteDocument(
  documentId: string,
  organizationId: string
): Promise<DbResult<AgentDocument>> {
  const supabase = await createServerSupabaseClient();

  // Load document first to get storage_path
  const { data: existing, error: loadError } = await supabase
    .from("agent_documents")
    .select("*")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (loadError || !existing) {
    return { data: null, error: "Documento no encontrado" };
  }

  const doc = existing as AgentDocument;

  // Soft delete the record
  const { data: updated, error: updateError } = await supabase
    .from("agent_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  // Delete file from Storage using service_role (Storage requires elevated access for private buckets)
  if (doc.storage_path) {
    const serviceClient = createServiceSupabaseClient();
    await serviceClient.storage
      .from("agent-documents")
      .remove([doc.storage_path]);
  }

  return { data: updated as AgentDocument, error: null };
}

export async function hasReadyDocuments(
  agentId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { count } = await supabase
    .from("agent_documents")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .eq("status", "ready")
    .is("deleted_at", null);

  return (count ?? 0) > 0;
}