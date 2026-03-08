type Chunk = {
  content: string;
  chunkIndex: number;
};

const TARGET_CHUNK_SIZE = 500;
const OVERLAP_SIZE = 50;

function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English/Spanish
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string): Chunk[] {
  const sentences = text.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim().length > 0);

  if (sentences.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;
  let overlapBuffer = "";

  for (const sentence of sentences) {
    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (estimateTokens(candidate) > TARGET_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), chunkIndex });
      chunkIndex++;

      // Build overlap from the end of the current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords: string[] = [];
      let overlapTokens = 0;

      for (let i = words.length - 1; i >= 0 && overlapTokens < OVERLAP_SIZE; i--) {
        overlapWords.unshift(words[i]);
        overlapTokens = estimateTokens(overlapWords.join(" "));
      }

      overlapBuffer = overlapWords.join(" ");
      currentChunk = overlapBuffer ? `${overlapBuffer} ${sentence}` : sentence;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({ content: currentChunk.trim(), chunkIndex });
  }

  return chunks;
}
