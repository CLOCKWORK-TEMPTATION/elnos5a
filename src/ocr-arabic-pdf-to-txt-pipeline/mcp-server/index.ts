import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

dotenv.config();

import {
  PDFToTextConverter,
  ConfigManager,
  NormalizationOptions,
} from "./ncio_mistral_all_in_one.js";

const CANONICAL_MISTRAL_OCR_MODEL = "mistral-ocr-latest";

const server = new Server(
  {
    name: "mistral-ocr-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the input schema manually as JSON Schema
const convertDocumentInputSchema = {
  type: "object" as const,
  properties: {
    inputPath: {
      type: "string",
      description: "The absolute path to the input PDF, MD, or TXT file",
    },
    outputPath: {
      type: "string",
      description:
        "Optional absolute path to save the output markdown. If not provided, it will be saved next to the input file.",
    },
    normalizeOutput: {
      type: "boolean",
      description: "Whether to normalize the output markdown",
      default: true,
    },
    saveRawMarkdown: {
      type: "boolean",
      description: "Whether to save the raw markdown before LLM refinement",
      default: true,
    },
    useLlm: {
      type: "boolean",
      description: "Whether to use an LLM for post-processing/refinement",
      default: false,
    },
    llmModel: {
      type: "string",
      description: "The Kimi chat model to use for structural refinement",
      default: "kimi-k2.5",
    },
    llmReferencePath: {
      type: "string",
      description:
        "Optional absolute path to the reference markdown used for structural diff-based refinement",
    },
    llmStrict: {
      type: "boolean",
      description: "If true, LLM refinement errors will fail the process",
      default: false,
    },
    mistralOcrModel: {
      type: "string",
      description: "The Mistral OCR model to use",
      default: "mistral-ocr-latest",
    },
    useBatchOcr: {
      type: "boolean",
      description: "Whether to use Mistral Batch OCR instead of direct OCR",
      default: false,
    },
    normalizerOptions: {
      type: "object",
      description: "Options for Arabic text normalization",
      properties: {
        normalizeYa: {
          type: "boolean",
          description: "Normalize ى → ي (default: false)",
          default: false,
        },
        normalizeTaMarbuta: {
          type: "boolean",
          description: "Normalize ة → ه (default: false, DANGEROUS!)",
          default: false,
        },
        normalizeHamza: {
          type: "boolean",
          description: "Normalize همزات إأآ → ا (default: true)",
          default: true,
        },
        normalizeDigits: {
          type: "string",
          enum: ["none", "arabic", "western"],
          description: "Normalize digits (default: arabic)",
          default: "arabic",
        },
        removeDiacritics: {
          type: "boolean",
          description: "Remove Arabic diacritics (default: true)",
          default: true,
        },
        fixConnectedLetters: {
          type: "boolean",
          description:
            "Fix Arabic Presentation Forms to standard letters (default: true)",
          default: true,
        },
        fixArabicPunctuation: {
          type: "boolean",
          description: "Fix Arabic punctuation spacing (default: true)",
          default: true,
        },
        scriptSpecificRules: {
          type: "boolean",
          description: "Enable screenplay-specific rules (default: true)",
          default: true,
        },
      },
    },
  },
  required: ["inputPath"],
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "convert_document_to_markdown",
        description:
          "Converts a PDF document to Markdown using Mistral OCR with optional LLM refinement and normalization.",
        inputSchema: convertDocumentInputSchema,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "convert_document_to_markdown") {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${request.params.name}`
    );
  }

  const args = request.params.arguments as {
    inputPath: string;
    outputPath?: string;
    normalizeOutput?: boolean;
    saveRawMarkdown?: boolean;
    useLlm?: boolean;
    llmModel?: string;
    llmReferencePath?: string;
    llmStrict?: boolean;
    mistralOcrModel?: string;
    useBatchOcr?: boolean;
    normalizerOptions?: NormalizationOptions;
  };

  if (!args.inputPath) {
    throw new McpError(ErrorCode.InvalidParams, "inputPath is required");
  }

  const {
    inputPath,
    outputPath,
    normalizeOutput = true,
    saveRawMarkdown = true,
    useLlm = false,
    llmModel = "kimi-k2.5",
    llmReferencePath,
    llmStrict = false,
    mistralOcrModel = "mistral-ocr-latest",
    useBatchOcr = false,
    normalizerOptions,
  } = args;

  if (mistralOcrModel !== CANONICAL_MISTRAL_OCR_MODEL) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `mistralOcrModel must be ${CANONICAL_MISTRAL_OCR_MODEL}.`
    );
  }

  const config: ConfigManager = {
    inputPath,
    outputPath,
    normalizeOutput,
    normalizerOptions,
    saveRawMarkdown,
    llm: {
      enabled: useLlm,
      model: llmModel,
      referencePath: llmReferencePath,
      strict: llmStrict,
      iterative: true,
      maxIterations: 2,
      targetMatch: 98.5,
      diffPreviewLines: 12,
    },
    mistral: {
      model: mistralOcrModel,
      useDocumentInput: true,
      useBatchOCR: useBatchOcr,
      batchTimeoutSec: 300,
      batchPollIntervalSec: 3,
      annotationStrict: false,
      extractHeader: false,
      extractFooter: false,
      includeImageBase64: false,
    },
    preOcr: {
      enabled: true,
      lang: "ar",
      matchThreshold: 0.88,
      fullpageFallbackRatio: 0.7,
      regionPaddingPx: 12,
    },
  };

  try {
    const converter = new PDFToTextConverter(config);
    const { finalMarkdown } = await converter.convert();

    // Attempt to save to outputPath if specified, or generate a default one
    let savedPath = "Not saved (in-memory only)";
    let successMsg = "Document converted successfully.";

    try {
      const outPath = converter.resolveOutputPath();
      const nonOverwritingPath = await converter.getNonOverwritingPath(outPath);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(nonOverwritingPath, finalMarkdown, "utf-8");
      savedPath = nonOverwritingPath;
      successMsg += ` Saved to ${savedPath}`;
    } catch (fsError) {
      console.error("Failed to write to file:", fsError);
      successMsg += ` Note: Failed to write to file: ${fsError}`;
    }

    return {
      content: [
        {
          type: "text",
          text: `${successMsg}\n\nFinal Markdown Preview (first 1000 chars):\n${finalMarkdown.substring(0, 1000)}...`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Conversion failed: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mistral OCR MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
