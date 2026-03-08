import { env } from "@/lib/utils/env";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_TIMEOUT_MS = 10000;

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

export async function generateEmbedding(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings respondio con status ${response.status}`);
    }

    const data = (await response.json()) as EmbeddingResponse;
    const embedding = data.data[0]?.embedding;

    if (!embedding) {
      throw new Error("No se recibio embedding en la respuesta de OpenAI");
    }

    return embedding;
  } finally {
    clearTimeout(timer);
  }
}
