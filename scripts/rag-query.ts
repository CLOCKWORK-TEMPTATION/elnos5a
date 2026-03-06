import { askQuestion } from "../src/rag/query.js";
import { logger } from "../src/rag/config.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: pnpm rag:ask "your question here"');
    process.exit(1);
  }

  const question = args.join(" ");

  try {
    logger.info(`❓ Question: ${question}`);

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
      console.log(`    ${source.snippet}`);
    });

    console.log("\n" + "=".repeat(80));

    process.exit(0);
  } catch (error) {
    logger.error({ error }, "❌ Query failed");
    process.exit(1);
  }
}

main();
