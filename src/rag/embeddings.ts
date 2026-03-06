import OpenAI from "openai";
import { OPENROUTER_API_KEY, EMBEDDING_MODEL, logger } from "./config";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/mo7rer",
    "X-OpenRouter-Title": "Mo7rer RAG System",
  },
});

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openrouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: "float",
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error({ error }, "Failed to generate embedding");
    throw error;
  }
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    logger.info(
      `Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`
    );

    try {
      const response = await openrouter.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        encoding_format: "float",
      });

      embeddings.push(
        ...response.data.map((d: { embedding: number[] }) => d.embedding)
      );

      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      logger.error(
        { error, batchIndex: i },
        "Failed to generate batch embeddings"
      );
      throw error;
    }
  }

  return embeddings;
}
