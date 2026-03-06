#!/usr/bin/env npx tsx
/**
 * open-pdf-agent.ts
 *
 * وكيل تنفيذ حتمي لمسار فتح PDF داخل التطبيق:
 * 1) يمر على ملفات البايبلاين المطلوبة (footprint verification)
 * 2) يصنّف PDF عبر الأدوات المحلية + أدوات المهارة
 * 3) ينفذ OCR عبر skill scripts
 * 4) يكتب النص الخام TXT
 * 5) يمرر النص عبر MCP tool (convert_document_to_markdown) للتفعيل الحقيقي لمسار MCP
 *
 * المخرجات دائماً JSON على stdout.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { buildAgentConfig } from "./config";
import { classifyPdfTool } from "./tools";
import { skillOcrMistral, skillWriteOutput } from "./skill-tools";
import type { ClassificationResult } from "./types";

type JsonRecord = Record<string, unknown>;

interface OpenPdfAgentArgs {
  input: string;
  outputJson: string;
  outputTxt: string;
  outputMcpMd: string;
  pages: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const toJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};

const writeStderr = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const isFalseLike = (value: string): boolean =>
  /^(0|false|no|off)$/iu.test(value.trim());

const isEnabledByDefault = (raw: string | undefined): boolean => {
  if (typeof raw !== "string") return true;
  return !isFalseLike(raw);
};

const parseArgs = (argv: string[]): OpenPdfAgentArgs => {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key || !key.startsWith("--")) continue;

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;

    args.set(key, value);
    index += 1;
  }

  const readRequired = (name: string): string => {
    const value = args.get(name);
    if (!value || !value.trim()) {
      throw new Error(`معامل مفقود: ${name}`);
    }
    return value.trim();
  };

  return {
    input: readRequired("--input"),
    outputJson: readRequired("--output-json"),
    outputTxt: readRequired("--output-txt"),
    outputMcpMd: readRequired("--output-mcp-md"),
    pages: (args.get("--pages") ?? "all").trim(),
  };
};

const parseToolJson = (raw: unknown, toolName: string): JsonRecord => {
  if (typeof raw === "string") {
    try {
      return toJsonRecord(JSON.parse(raw));
    } catch (error) {
      throw new Error(
        `تعذر تحليل JSON من ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  return toJsonRecord(raw);
};

const runTool = async (
  toolDef: unknown,
  payload: Record<string, unknown>,
  toolName: string
): Promise<JsonRecord> => {
  const maybeExecute = (toolDef as { execute?: unknown }).execute;
  if (typeof maybeExecute !== "function") {
    throw new Error(`الأداة ${toolName} لا تحتوي execute()`);
  }
  const response = await (
    maybeExecute as (input: Record<string, unknown>) => Promise<unknown>
  )(payload);
  const parsed = parseToolJson(response, toolName);

  if (parsed["success"] === false) {
    const reason =
      typeof parsed["error"] === "string"
        ? parsed["error"]
        : `فشلت الأداة ${toolName}`;
    throw new Error(reason);
  }
  if (typeof parsed["error"] === "string" && parsed["error"].trim()) {
    throw new Error(parsed["error"].trim());
  }

  return parsed;
};

const toClassification = (value: JsonRecord): ClassificationResult | null => {
  const requiredKeys: Array<keyof ClassificationResult> = [
    "type",
    "pages",
    "size_mb",
    "filename",
    "has_arabic",
    "recommended_engine",
    "notes",
  ];

  const hasAllKeys = requiredKeys.every((key) => key in value);
  if (!hasAllKeys) return null;

  return {
    type: value["type"] as ClassificationResult["type"],
    pages: Number(value["pages"] ?? 0),
    size_mb: Number(value["size_mb"] ?? 0),
    filename: String(value["filename"] ?? ""),
    has_arabic: Boolean(value["has_arabic"]),
    recommended_engine: value[
      "recommended_engine"
    ] as ClassificationResult["recommended_engine"],
    notes: toStringArray(value["notes"]),
  };
};

const verifyPathType = async (
  absolutePath: string,
  expected: "file" | "dir"
): Promise<void> => {
  const entry = await stat(absolutePath);
  if (expected === "file" && !entry.isFile()) {
    throw new Error(`المسار ليس ملفاً: ${absolutePath}`);
  }
  if (expected === "dir" && !entry.isDirectory()) {
    throw new Error(`المسار ليس مجلداً: ${absolutePath}`);
  }
};

const verifyPipelineFootprint = async (
  agentRoot: string,
  mcpServerPath: string
): Promise<{
  checkedDirectories: string[];
  checkedFiles: string[];
}> => {
  const mcpRoot = dirname(mcpServerPath);
  const requiredDirectories = [
    agentRoot,
    resolve(agentRoot, "skill-scripts"),
    mcpRoot,
    resolve(mcpRoot, "node_modules"),
  ];

  const requiredFiles = [
    resolve(agentRoot, "agent.ts"),
    resolve(agentRoot, "batch.ts"),
    resolve(agentRoot, "config.ts"),
    resolve(agentRoot, "skill-tools.ts"),
    resolve(agentRoot, "tools.ts"),
    resolve(agentRoot, "types.ts"),
    resolve(agentRoot, "skill-scripts", "classify-pdf.ts"),
    resolve(agentRoot, "skill-scripts", "enhance-image.ts"),
    resolve(agentRoot, "skill-scripts", "ocr-mistral.ts"),
    resolve(agentRoot, "skill-scripts", "write-output.ts"),
    resolve(agentRoot, "skill-scripts", "extraction-rules.md"),
    resolve(agentRoot, "skill-scripts", "troubleshooting.md"),
    resolve(mcpRoot, "annotation_schema.json"),
    resolve(mcpRoot, "index.ts"),
    resolve(mcpRoot, "ncio_mistral_all_in_one.ts"),
    resolve(mcpRoot, "package.json"),
    resolve(mcpRoot, "pnpm-lock.yaml"),
    resolve(mcpRoot, "tsconfig.json"),
  ];

  for (const dirPath of requiredDirectories) {
    await verifyPathType(dirPath, "dir");
  }

  // قراءة سريعة لضمان "المرور" الفعلي على الملفات
  for (const filePath of requiredFiles) {
    await verifyPathType(filePath, "file");
    await readFile(filePath, "utf-8");
  }

  return {
    checkedDirectories: requiredDirectories,
    checkedFiles: requiredFiles,
  };
};

const runMcpStage = async (
  mcpServerPath: string,
  rawTxtPath: string,
  normalizedMdOutputPath: string
): Promise<{
  summary: string | null;
  llmEnabled: boolean;
  llmModel: string | null;
  llmReferencePath: string | null;
}> => {
  const llmReferencePathRaw =
    process.env["OPEN_PDF_AGENT_LLM_REFERENCE_PATH"] ?? "";
  const llmReferencePath = llmReferencePathRaw.trim() || null;
  const llmModelRaw = process.env["OPEN_PDF_AGENT_LLM_MODEL"] ?? "";
  const llmModel = llmModelRaw.trim() || "kimi-k2.5";
  const forceLlmReviewRaw =
    process.env["OPEN_PDF_AGENT_ENABLE_MCP_LLM_REVIEW"] ?? "";
  const forceLlmReview = /^(1|true|yes|on)$/iu.test(forceLlmReviewRaw.trim());
  const llmEnabled = Boolean(llmReferencePath) || forceLlmReview;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", mcpServerPath],
    env: {
      ...process.env,
      MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"] ?? "",
      MOONSHOT_API_KEY: process.env["MOONSHOT_API_KEY"] ?? "",
      OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "",
    },
  });

  const client = await createMCPClient({ transport });
  try {
    const tools = (await client.tools()) as Record<string, unknown>;
    const convertTool = tools["convert_document_to_markdown"];
    const execute = (
      convertTool as
        | {
            execute?: unknown;
          }
        | undefined
    )?.execute;

    if (!convertTool || typeof execute !== "function") {
      throw new Error(
        "أداة convert_document_to_markdown غير متاحة من خادم MCP."
      );
    }

    const response = await (
      execute as (input: Record<string, unknown>) => Promise<unknown>
    )({
      inputPath: rawTxtPath,
      outputPath: normalizedMdOutputPath,
      normalizeOutput: true,
      saveRawMarkdown: false,
      useLlm: llmEnabled,
      llmModel,
      ...(llmReferencePath ? { llmReferencePath } : {}),
      llmStrict: false,
      useBatchOcr: false,
    });

    const payload = toJsonRecord(response);
    const content = Array.isArray(payload["content"])
      ? (payload["content"] as Array<Record<string, unknown>>)
      : [];
    const firstText = content.find(
      (item) => typeof item?.["text"] === "string"
    );

    return {
      summary:
        firstText && typeof firstText["text"] === "string"
          ? firstText["text"]
          : null,
      llmEnabled,
      llmModel: llmEnabled ? llmModel : null,
      llmReferencePath: llmEnabled ? llmReferencePath : null,
    };
  } finally {
    await client.close();
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(args.input);
  const outputJsonPath = resolve(args.outputJson);
  const outputTxtPath = resolve(args.outputTxt);
  const outputMcpMdPath = resolve(args.outputMcpMd);

  const agentConfig = buildAgentConfig();
  const mcpServerPath = resolve(agentConfig.mcpServerPath);
  const agentRoot = resolve(__dirname);

  const attempts = ["pipeline-open-agent"];
  const warnings: string[] = [];

  const verifyFootprintEnabled = isEnabledByDefault(
    process.env["OPEN_PDF_AGENT_VERIFY_FOOTPRINT"] ?? "false"
  );
  const mcpStageEnabled = isEnabledByDefault(
    process.env["OPEN_PDF_AGENT_ENABLE_MCP_STAGE"] ?? "true"
  );

  let footprint: {
    checkedDirectories: string[];
    checkedFiles: string[];
  } | null = null;
  if (verifyFootprintEnabled) {
    footprint = await verifyPipelineFootprint(agentRoot, mcpServerPath);
    attempts.push("pipeline-footprint-verified");
  } else {
    attempts.push("pipeline-footprint-skipped");
  }

  const localClassificationRaw = await runTool(
    classifyPdfTool,
    { pdfPath: inputPath },
    "classify_pdf"
  );
  attempts.push("classify-local");

  // Duplicate skill classification removed — single classify is sufficient
  const classification = toClassification(localClassificationRaw);

  if (!classification) {
    throw new Error("تعذر بناء نتيجة تصنيف PDF من أدوات الوكيل.");
  }
  if (classification.type === "protected") {
    throw new Error("الملف محمي بكلمة مرور — يتطلب فك التشفير أولاً.");
  }
  warnings.push(...toStringArray(classification.notes));

  const ocrResult = await runTool(
    skillOcrMistral,
    {
      input: inputPath,
      output: outputJsonPath,
      pages: args.pages,
    },
    "skill_ocr_mistral"
  );
  attempts.push("ocr-skill");
  warnings.push(...toStringArray(ocrResult["warnings"]));
  warnings.push(...toStringArray(ocrResult["notes"]));

  const writeResult = await runTool(
    skillWriteOutput,
    {
      input: outputJsonPath,
      format: "txt-raw",
      output: outputTxtPath,
    },
    "skill_write_output"
  );
  attempts.push("write-output-skill");
  warnings.push(...toStringArray(writeResult["warnings"]));
  warnings.push(...toStringArray(writeResult["notes"]));

  const rawText = await readFile(outputTxtPath, "utf-8");
  if (!rawText.trim()) {
    throw new Error("النص الخام الناتج من OCR فارغ.");
  }

  let mcpStage: {
    summary: string | null;
    llmEnabled: boolean;
    llmModel: string | null;
    llmReferencePath: string | null;
  } = {
    summary: null,
    llmEnabled: false,
    llmModel: null,
    llmReferencePath: null,
  };
  let markdownText = rawText;

  if (mcpStageEnabled) {
    mcpStage = await runMcpStage(mcpServerPath, outputTxtPath, outputMcpMdPath);
    attempts.push("mcp-convert_document_to_markdown");
    try {
      const markdownFromMcp = await readFile(outputMcpMdPath, "utf-8");
      if (markdownFromMcp.trim()) {
        markdownText = markdownFromMcp;
      }
    } catch {
      warnings.push(
        "MCP stage completed but markdown output file was not found."
      );
    }
  } else {
    attempts.push("mcp-stage-skipped");
  }

  const payload = {
    success: true,
    text: rawText,
    textRaw: rawText,
    textMarkdown: markdownText,
    classification,
    warnings,
    attempts,
    meta: {
      textStage: "pre-format",
      textFormat: "txt-raw",
      footprint,
      mcpStageEnabled,
      mcp: {
        serverPath: mcpServerPath,
        outputPath: outputMcpMdPath,
        summary: mcpStage.summary,
        llmEnabled: mcpStage.llmEnabled,
        llmModel: mcpStage.llmModel,
        llmReferencePath: mcpStage.llmReferencePath,
      },
    },
  };

  process.stdout.write(JSON.stringify(payload));
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  writeStderr(`open-pdf-agent failed: ${message}`);
  process.stdout.write(
    JSON.stringify({
      success: false,
      error: message,
    })
  );
  process.exitCode = 1;
});
