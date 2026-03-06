import { createCollection, getIndexStats } from "../src/rag/indexer.js";
import { chunkFile } from "../src/rag/chunker.js";
import { generateEmbeddingsBatch } from "../src/rag/embeddings.js";
import {
  qdrantClient,
  RAG_COLLECTION_NAME,
  logger,
} from "../src/rag/config.js";
import { askQuestion } from "../src/rag/query.js";
import * as path from "path";

async function smokeTest() {
  try {
    logger.info("🧪 Starting RAG Smoke Test...");

    logger.info("Step 1: Creating collection...");
    await createCollection();

    logger.info("Step 2: Indexing single file (src/editor.ts)...");
    const testFile = path.resolve(process.cwd(), "src/editor.ts");
    const chunks = chunkFile(testFile);
    logger.info(`  - Generated ${chunks.length} chunks`);

    const texts = chunks.map((chunk) => chunk.content);
    const embeddings = await generateEmbeddingsBatch(texts);
    logger.info(`  - Generated ${embeddings.length} embeddings`);

    const points = chunks.map((chunk, idx) => ({
      id: idx,
      vector: embeddings[idx],
      payload: {
        content: chunk.content,
        ...chunk.metadata,
      },
    }));

    await qdrantClient.upsert(RAG_COLLECTION_NAME, {
      wait: true,
      points,
    });
    logger.info("  - Uploaded to Qdrant Cloud");

    logger.info("Step 3: Getting stats...");
    const stats = await getIndexStats();
    logger.info(`  - Total points: ${stats.totalPoints}`);
    logger.info(`  - Vectors count: ${stats.vectorsCount}`);

    logger.info("Step 4: Testing RAG query...");
    const question = "ما هي الـ extensions المستخدمة في المحرر؟";
    logger.info(`  - Question: ${question}`);

    const response = await askQuestion(question);

    console.log("\n" + "=".repeat(80));
    console.log("📝 Answer:");
    console.log("=".repeat(80));
    console.log(response.answer);
    console.log("\n" + "=".repeat(80));
    console.log("📚 Sources:");
    console.log("=".repeat(80));

    response.sources.forEach((source, idx) => {
      console.log(
        `\n[${idx + 1}] ${source.filePath} (score: ${source.score.toFixed(3)})`
      );
    });

    console.log("\n" + "=".repeat(80));

    logger.info("✅ Smoke test completed successfully!");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "❌ Smoke test failed");
    process.exit(1);
  }
}

smokeTest();
