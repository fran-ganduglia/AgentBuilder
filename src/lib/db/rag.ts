import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_CHUNKS = 5;
const DEFAULT_THRESHOLD = 0.7;

export type RetrievedChunk = {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export async function searchChunks(
  organizationId: string,
  agentId: string,
  embedding: number[],
  matchCount: number = MAX_CHUNKS,
  threshold: number = DEFAULT_THRESHOLD
): Promise<RetrievedChunk[]> {
  const supabase = await createServerSupabaseClient();

  const safeMatchCount = Math.min(matchCount, MAX_CHUNKS);

  const { data, error } = await supabase.rpc("search_document_chunks", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_embedding: JSON.stringify(embedding),
    p_match_count: safeMatchCount,
    p_threshold: threshold,
  });

  if (error) {
    console.error("rag.search_error", { error: error.message, agentId });
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}

export function formatChunksAsContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  return chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join("\n\n");
}
