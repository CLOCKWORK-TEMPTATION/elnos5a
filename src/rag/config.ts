import { QdrantClient } from "@qdrant/js-client-rest";
import { z } from "zod";
import dotenv from "dotenv";
import { pino } from "pino";

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

const RagConfigSchema = z.object({
  QDRANT_URL: z.string().url("QDRANT_URL must be a valid URL"),
  QDRANT_API_KEY: z.string().min(1, "QDRANT_API_KEY is required"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

type RagConfig = z.infer<typeof RagConfigSchema>;

function loadRagConfig(): RagConfig {
  try {
    const config = RagConfigSchema.parse({
      QDRANT_URL: process.env.QDRANT_URL,
      QDRANT_API_KEY: process.env.QDRANT_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    });

    logger.info("✅ RAG configuration loaded successfully");
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error("❌ RAG configuration validation failed:");
      error.errors.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
    }
    throw new Error("Failed to load RAG configuration. Check your .env file.", {
      cause: error,
    });
  }
}

const config = loadRagConfig();

export const qdrantClient = new QdrantClient({
  url: config.QDRANT_URL,
  apiKey: config.QDRANT_API_KEY,
});

export const OPENROUTER_API_KEY = config.OPENROUTER_API_KEY;
export const GEMINI_API_KEY = config.GEMINI_API_KEY;
export const OPENAI_API_KEY = config.OPENAI_API_KEY;
export const ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;

export const RAG_COLLECTION_NAME = "codebase-index";
export const EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
export const EMBEDDING_DIMENSIONS = 4096; // Qwen3 Embedding 8B actual dimensions
export const CHUNK_SIZE = 500; // tokens
export const CHUNK_OVERLAP = 50; // tokens

export { logger };
