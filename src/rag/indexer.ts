import {
  qdrantClient,
  RAG_COLLECTION_NAME,
  EMBEDDING_DIMENSIONS,
  logger,
} from "./config";
import { getAllCodeFiles, chunkFile } from "./chunker";
import { generateEmbeddingsBatch } from "./embeddings";
import { CodeChunk } from "./types";

export async function createCollection(): Promise<void> {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === RAG_COLLECTION_NAME
    );

    if (exists) {
      logger.info(
        `Collection "${RAG_COLLECTION_NAME}" already exists, deleting...`
      );
      await qdrantClient.deleteCollection(RAG_COLLECTION_NAME);
    }

    logger.info(`Creating collection "${RAG_COLLECTION_NAME}"...`);
    await qdrantClient.createCollection(RAG_COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
    });

    await qdrantClient.createPayloadIndex(RAG_COLLECTION_NAME, {
      field_name: "filePath",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(RAG_COLLECTION_NAME, {
      field_name: "language",
      field_schema: "keyword",
    });

    logger.info("✅ Collection created successfully");
  } catch (error) {
    logger.error({ error }, "Failed to create collection");
    throw error;
  }
}

export async function indexCodebase(rootDir: string): Promise<void> {
  try {
    logger.info(`Starting indexing of codebase at: ${rootDir}`);

    const files = getAllCodeFiles(rootDir);
    logger.info(`Found ${files.length} files to index`);

    const allChunks: CodeChunk[] = [];
    for (const file of files) {
      try {
        const chunks = chunkFile(file);
        allChunks.push(...chunks);
      } catch (error) {
        logger.warn({ file, error }, "Failed to chunk file, skipping");
      }
    }

    logger.info(
      `Generated ${allChunks.length} chunks from ${files.length} files`
    );

    logger.info("Generating embeddings...");
    const texts = allChunks.map((chunk) => chunk.content);
    const embeddings = await generateEmbeddingsBatch(texts);

    logger.info("Uploading to Qdrant Cloud...");
    const batchSize = 100;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const batchEmbeddings = embeddings.slice(i, i + batchSize);

      const points = batch.map((chunk, idx) => ({
        id: i + idx,
        vector: batchEmbeddings[idx],
        payload: {
          content: chunk.content,
          ...chunk.metadata,
        },
      }));

      await qdrantClient.upsert(RAG_COLLECTION_NAME, {
        wait: true,
        points,
      });

      logger.info(
        `Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allChunks.length / batchSize)}`
      );
    }

    logger.info("✅ Indexing completed successfully");
  } catch (error) {
    logger.error({ error }, "Failed to index codebase");
    throw error;
  }
}

export async function getIndexStats(): Promise<{
  totalPoints: number;
  vectorsCount: number;
}> {
  try {
    const info = await qdrantClient.getCollection(RAG_COLLECTION_NAME);
    return {
      totalPoints: info.points_count || 0,
      vectorsCount: info.indexed_vectors_count || 0,
    };
  } catch (error) {
    logger.error({ error }, "Failed to get index stats");
    throw error;
  }
}
