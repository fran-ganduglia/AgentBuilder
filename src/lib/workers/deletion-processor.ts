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

  const fromTable = ((table: string) => supabase.from(table as never)) as (
    table: string
  ) => ReturnType<typeof supabase.from>;
  await fromTable("deletion_requests")
    .update({ status: "completed", processed_at: new Date().toISOString(), error_message: null })
    .eq("id", request.id);
}

async function deleteConversation(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;

  const { error: messagesError } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", entity_id)
    .eq("organization_id", organization_id);

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const { error: conversationError } = await supabase
    .from("conversations")
    .delete()
    .eq("id", entity_id)
    .eq("organization_id", organization_id);

  if (conversationError) {
    throw new Error(conversationError.message);
  }
}

async function deleteAgent(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;

  const { data: docs, error: docsError } = await supabase
    .from("agent_documents")
    .select("storage_path")
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id);

  if (docsError) {
    throw new Error(docsError.message);
  }

  const storagePaths = (docs ?? [])
    .map((doc) => (doc as { storage_path: string | null }).storage_path)
    .filter((path): path is string => path !== null);

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("agent-documents")
      .remove(storagePaths);

    if (storageError) {
      console.error("worker.deletion.agent.storage_cleanup_failed", {
        agentId: entity_id,
        organizationId: organization_id,
        error: storageError.message,
      });
    }
  }

  const { error: chunksError } = await supabase
    .from("document_chunks")
    .delete()
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id);

  if (chunksError) {
    throw new Error(chunksError.message);
  }

  const { error: documentsError } = await supabase
    .from("agent_documents")
    .delete()
    .eq("agent_id", entity_id)
    .eq("organization_id", organization_id);

  if (documentsError) {
    throw new Error(documentsError.message);
  }

  const childTables = [
    "user_agent_permissions",
    "agent_connections",
    "agent_versions",
    "agent_tools",
  ] as const;

  for (const table of childTables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("agent_id", entity_id)
      .eq("organization_id", organization_id);

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: agentError } = await supabase
    .from("agents")
    .delete()
    .eq("id", entity_id)
    .eq("organization_id", organization_id);

  if (agentError) {
    throw new Error(agentError.message);
  }
}

async function deleteUser(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id, organization_id } = request;
  const deletedAt = new Date().toISOString();

  const { error: permissionsError } = await supabase
    .from("user_agent_permissions")
    .delete()
    .eq("user_id", entity_id)
    .eq("organization_id", organization_id);

  if (permissionsError) {
    throw new Error(permissionsError.message);
  }

  const { error: userError } = await supabase
    .from("users")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("id", entity_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null);

  if (userError) {
    throw new Error(userError.message);
  }
}

async function deleteOrganization(request: DeletionRequest): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { entity_id } = request;
  const deletedAt = new Date().toISOString();

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", entity_id);

  if (agentsError) {
    throw new Error(agentsError.message);
  }

  if (agents) {
    for (const agent of agents) {
      await deleteAgent({
        ...request,
        entity_type: "agent",
        entity_id: (agent as { id: string }).id,
      });
    }
  }

  const { error: usersError } = await supabase
    .from("users")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("organization_id", entity_id)
    .is("deleted_at", null);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const { error: organizationError } = await supabase
    .from("organizations")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("id", entity_id)
    .is("deleted_at", null);

  if (organizationError) {
    throw new Error(organizationError.message);
  }
}
