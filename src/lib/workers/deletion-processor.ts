import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type DeletionRequest = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
};

export async function processDeletionRequest(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();

  switch (request.entity_type) {
    case "user":
      await deleteUser(request);
      break;
    case "conversation":
      await deleteConversation(request);
      break;
    case "agent":
      await deleteAgent(request);
      break;
    case "organization":
      await deleteOrganization(request);
      break;
    default:
      throw new Error(`Tipo de entidad no soportado: ${request.entity_type}`);
  }

  // Mark deletion request as completed.
  const fromTable = supabase.from as (table: string) => ReturnType<typeof supabase.from>;
  await fromTable("deletion_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", request.id);
}

async function deleteConversation(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;

  // Delete messages first.
  await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", entity_id)
    .eq("organization_id", organization_id);

  // Delete conversation.
  await supabase
    .from("conversations")
    .delete()
    .eq("id", entity_id)
    .eq("organization_id", organization_id);
}

async function deleteAgent(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;
  const deletedAt = new Date().toISOString();

  // Delete derived RAG chunks.
  await supabase
    .from("document_chunks")
    .delete()
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id);

  // Load document storage paths before soft deleting metadata.
  const { data: docs } = await supabase
    .from("agent_documents")
    .select("storage_path")
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null);

  if (docs && docs.length > 0) {
    const paths = docs
      .map((doc) => (doc as { storage_path: string | null }).storage_path)
      .filter((path): path is string => path !== null);

    if (paths.length > 0) {
      await supabase.storage.from("agent-documents").remove(paths);
    }
  }

  await supabase
    .from("agent_documents")
    .update({ deleted_at: deletedAt })
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null);

  await supabase
    .from("user_agent_permissions")
    .delete()
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id);

  await supabase
    .from("agents")
    .update({ deleted_at: deletedAt, status: "archived" })
    .eq("id", entity_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null);
}

async function deleteUser(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;
  const deletedAt = new Date().toISOString();

  await supabase
    .from("user_agent_permissions")
    .delete()
    .eq("user_id", entity_id)
    .eq("organization_id", organization_id);

  await supabase
    .from("users")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("id", entity_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null);
}

async function deleteOrganization(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id } = request;
  const deletedAt = new Date().toISOString();

  const { data: agents } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", entity_id)
    .is("deleted_at", null);

  if (agents) {
    for (const agent of agents) {
      await deleteAgent({
        ...request,
        entity_type: "agent",
        entity_id: (agent as { id: string }).id,
      });
    }
  }

  await supabase
    .from("users")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("organization_id", entity_id)
    .is("deleted_at", null);

  await supabase
    .from("organizations")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("id", entity_id)
    .is("deleted_at", null);
}
