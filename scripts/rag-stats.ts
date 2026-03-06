import { getIndexStats } from "../src/rag/indexer.js";
import { logger } from "../src/rag/config.js";

async function main() {
  try {
    const stats = await getIndexStats();

    console.log("\n" + "=".repeat(80));
    console.log("📊 RAG Index Statistics");
    console.log("=".repeat(80));
    console.log(`Total Points: ${stats.totalPoints}`);
    console.log(`Vectors Count: ${stats.vectorsCount}`);
    console.log("=".repeat(80) + "\n");

    process.exit(0);
  } catch (error) {
    logger.error({ error }, "❌ Failed to get stats");
    process.exit(1);
  }
}

main();
