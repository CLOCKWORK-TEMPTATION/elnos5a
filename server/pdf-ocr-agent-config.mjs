import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { probePdftoppmDependency } from "./pdf-reference-builder.mjs";
import { getVisionCompareRuntime } from "./pdf-vision-compare.mjs";
import { getVisionJudgeRuntime } from "./pdf-vision-judge.mjs";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

const DEFAULT_AGENT_ROOT = resolve(
  PROJECT_ROOT,
  "src",
  "ocr-arabic-pdf-to-txt-pipeline"
);
const baseConfigSchema = z.object({
  enabled: z.boolean(),
  agentRoot: z.string().min(1),
  openPdfAgentScriptPath: z.string().min(1),
  ocrScriptPath: z.string().min(1),
  classifyScriptPath: z.string().min(1),
  enhanceScriptPath: z.string().min(1),
  writeOutputScriptPath: z.string().min(1),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(30 * 60 * 1_000),
  pages: z.string().min(1),
  mistralApiKey: z.string(),
  moonshotApiKey: z.string(),
  geminiApiKey: z.string(),
  visionCompareModel: z.string(),
  visionJudgeModel: z.string(),
  visionProofreadModel: z.string(),
  visionCompareTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(10 * 60 * 1_000),
  visionJudgeTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(10 * 60 * 1_000),
  visionProofreadTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(10 * 60 * 1_000),
  visionRenderDpi: z.number().int().min(96).max(600),
  externalReferencePath: z.string(),
  openAgentVerifyFootprint: z.boolean(),
  openAgentEnableMcpStage: z.boolean(),
  enableClassification: z.boolean(),
  enableEnhancement: z.boolean(),
  enableVisionProofread: z.boolean(),
});

const isFalseLike = (value) => /^(0|false|no|off)$/iu.test(value.trim());
const configError = (code, message) => new Error(`[${code}] ${message}`);

const toEnabledFlag = (value) => {
  if (typeof value !== "string") return true;
  return !isFalseLike(value);
};

const toTimeoutMs = (value) => {
  const fallback = 10 * 60 * 1_000;
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const toNumber = (value, fallback) => {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const resolveRawConfig = () => {
  const agentRoot =
    process.env.PDF_OCR_AGENT_ROOT?.trim() || resolve(DEFAULT_AGENT_ROOT);

  const skillScriptsDir = resolve(agentRoot, "skill-scripts");
  const openPdfAgentScriptPath =
    process.env.PDF_OCR_AGENT_OPEN_SCRIPT_PATH?.trim() ||
    resolve(agentRoot, "open-pdf-agent.ts");

  const ocrScriptPath =
    process.env.PDF_OCR_AGENT_OCR_SCRIPT_PATH?.trim() ||
    resolve(skillScriptsDir, "ocr-mistral.ts");

  const classifyScriptPath =
    process.env.PDF_OCR_AGENT_CLASSIFY_SCRIPT_PATH?.trim() ||
    resolve(skillScriptsDir, "classify-pdf.ts");

  const enhanceScriptPath =
    process.env.PDF_OCR_AGENT_ENHANCE_SCRIPT_PATH?.trim() ||
    resolve(skillScriptsDir, "enhance-image.ts");

  const writeOutputScriptPath =
    process.env.PDF_OCR_AGENT_WRITE_OUTPUT_SCRIPT_PATH?.trim() ||
    resolve(skillScriptsDir, "write-output.ts");

  return {
    enabled: toEnabledFlag(process.env.PDF_OCR_AGENT_ENABLED),
    agentRoot,
    openPdfAgentScriptPath,
    ocrScriptPath,
    classifyScriptPath,
    enhanceScriptPath,
    writeOutputScriptPath,
    timeoutMs: toTimeoutMs(process.env.PDF_OCR_AGENT_TIMEOUT_MS),
    pages: process.env.PDF_OCR_AGENT_PAGES?.trim() || "all",
    mistralApiKey: process.env.MISTRAL_API_KEY?.trim() || "",
    moonshotApiKey: process.env.MOONSHOT_API_KEY?.trim() || "",
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
    visionCompareModel: process.env.PDF_VISION_COMPARE_MODEL?.trim() || "",
    visionJudgeModel: process.env.PDF_VISION_JUDGE_MODEL?.trim() || "",
    visionProofreadModel:
      process.env.PDF_VISION_PROOFREAD_MODEL?.trim() || "gemini-2.5-flash",
    visionCompareTimeoutMs: toNumber(
      process.env.PDF_VISION_COMPARE_TIMEOUT_MS,
      180_000
    ),
    visionJudgeTimeoutMs: toNumber(
      process.env.PDF_VISION_JUDGE_TIMEOUT_MS,
      180_000
    ),
    visionProofreadTimeoutMs: toNumber(
      process.env.PDF_VISION_PROOFREAD_TIMEOUT_MS,
      180_000
    ),
    visionRenderDpi: toNumber(process.env.PDF_VISION_RENDER_DPI, 300),
    externalReferencePath:
      process.env.PDF_OCR_EXTERNAL_REFERENCE_PATH?.trim() || "",
    openAgentVerifyFootprint: toEnabledFlag(
      process.env.OPEN_PDF_AGENT_VERIFY_FOOTPRINT ?? "false"
    ),
    openAgentEnableMcpStage: toEnabledFlag(
      process.env.OPEN_PDF_AGENT_ENABLE_MCP_STAGE ?? "true"
    ),
    enableClassification: toEnabledFlag(
      process.env.PDF_OCR_AGENT_CLASSIFY_ENABLED
    ),
    enableEnhancement: toEnabledFlag(process.env.PDF_OCR_AGENT_ENHANCE_ENABLED),
    enableVisionProofread: toEnabledFlag(
      process.env.PDF_OCR_ENABLE_VISION_PROOFREAD ?? "true"
    ),
  };
};

export const getPdfOcrAgentConfig = () => {
  const parsed = baseConfigSchema.parse(resolveRawConfig());
  if (!parsed.enabled) {
    return parsed;
  }

  if (!parsed.mistralApiKey) {
    throw configError(
      "PDF_OCR_CFG_MISSING_MISTRAL_API_KEY",
      "PDF OCR agent misconfigured: MISTRAL_API_KEY is required for PDF extraction."
    );
  }
  if (/\s/iu.test(parsed.mistralApiKey)) {
    throw configError(
      "PDF_OCR_CFG_INVALID_MISTRAL_API_KEY",
      "PDF OCR agent misconfigured: MISTRAL_API_KEY must not contain whitespace."
    );
  }

  if (!parsed.moonshotApiKey) {
    throw configError(
      "PDF_OCR_CFG_MISSING_MOONSHOT_API_KEY",
      "PDF OCR agent misconfigured: MOONSHOT_API_KEY is required for vision judge."
    );
  }
  if (/\s/iu.test(parsed.moonshotApiKey)) {
    throw configError(
      "PDF_OCR_CFG_INVALID_MOONSHOT_API_KEY",
      "PDF OCR agent misconfigured: MOONSHOT_API_KEY must not contain whitespace."
    );
  }
  if (!parsed.visionCompareModel) {
    throw configError(
      "PDF_OCR_CFG_MISSING_VISION_COMPARE_MODEL",
      "PDF OCR agent misconfigured: PDF_VISION_COMPARE_MODEL is required."
    );
  }
  if (!parsed.visionJudgeModel) {
    throw configError(
      "PDF_OCR_CFG_MISSING_VISION_JUDGE_MODEL",
      "PDF OCR agent misconfigured: PDF_VISION_JUDGE_MODEL is required."
    );
  }

  // Gemini API key — required when vision proofread is enabled
  if (parsed.enableVisionProofread) {
    if (!parsed.geminiApiKey) {
      throw configError(
        "PDF_OCR_CFG_MISSING_GEMINI_API_KEY",
        "PDF OCR agent misconfigured: GEMINI_API_KEY is required when vision proofread is enabled."
      );
    }
    if (/\s/iu.test(parsed.geminiApiKey)) {
      throw configError(
        "PDF_OCR_CFG_INVALID_GEMINI_API_KEY",
        "PDF OCR agent misconfigured: GEMINI_API_KEY must not contain whitespace."
      );
    }
  }

  if (!existsSync(parsed.agentRoot)) {
    throw configError(
      "PDF_OCR_CFG_MISSING_AGENT_ROOT",
      `PDF OCR agent misconfigured: agent root does not exist (${parsed.agentRoot}).`
    );
  }

  const requiredScripts = [
    ["openPdfAgentScriptPath", parsed.openPdfAgentScriptPath],
    ["ocrScriptPath", parsed.ocrScriptPath],
    ["classifyScriptPath", parsed.classifyScriptPath],
    ["writeOutputScriptPath", parsed.writeOutputScriptPath],
  ];

  for (const [label, scriptPath] of requiredScripts) {
    if (!existsSync(scriptPath)) {
      throw configError(
        "PDF_OCR_CFG_MISSING_SCRIPT_PATH",
        `PDF OCR agent misconfigured: ${label} does not exist (${scriptPath}).`
      );
    }
  }

  return parsed;
};

export const getPdfOcrAgentHealth = async () => {
  const config = baseConfigSchema.parse(resolveRawConfig());
  const agentRootExists = existsSync(config.agentRoot);
  const openPdfAgentScriptExists = existsSync(config.openPdfAgentScriptPath);
  const ocrScriptExists = existsSync(config.ocrScriptPath);
  const classifyScriptExists = existsSync(config.classifyScriptPath);
  const enhanceScriptExists = existsSync(config.enhanceScriptPath);
  const writeOutputScriptExists = existsSync(config.writeOutputScriptPath);

  const hasMistralApiKey = config.mistralApiKey.length > 0;
  const hasMoonshotApiKey = config.moonshotApiKey.length > 0;
  const hasGeminiApiKey = config.geminiApiKey.length > 0;
  const hasVisionCompareModel = config.visionCompareModel.length > 0;
  const hasValidVisionCompareModel = config.visionCompareModel.length > 0;
  const hasVisionJudgeModel = config.visionJudgeModel.length > 0;

  const pdftoppm = await probePdftoppmDependency();
  const compareRuntime = hasVisionCompareModel
    ? getVisionCompareRuntime({
        model: config.visionCompareModel,
      })
    : {
        model: config.visionCompareModel,
        endpointSource: "hard-locked-canonical",
        errorCode: "PDF_OCR_CFG_MISSING_VISION_COMPARE_MODEL",
      };
  const judgeRuntime = getVisionJudgeRuntime({
    model: config.visionJudgeModel,
  });

  const errorCodes = [];
  if (!hasMistralApiKey) errorCodes.push("PDF_OCR_CFG_MISSING_MISTRAL_API_KEY");
  if (!hasMoonshotApiKey)
    errorCodes.push("PDF_OCR_CFG_MISSING_MOONSHOT_API_KEY");
  if (config.enableVisionProofread && !hasGeminiApiKey)
    errorCodes.push("PDF_OCR_CFG_MISSING_GEMINI_API_KEY");
  if (!hasVisionCompareModel)
    errorCodes.push("PDF_OCR_CFG_MISSING_VISION_COMPARE_MODEL");

  if (!hasVisionJudgeModel)
    errorCodes.push("PDF_OCR_CFG_MISSING_VISION_JUDGE_MODEL");
  if (!pdftoppm.available && pdftoppm.errorCode) {
    errorCodes.push(pdftoppm.errorCode);
  }

  const configured =
    config.enabled &&
    agentRootExists &&
    openPdfAgentScriptExists &&
    ocrScriptExists &&
    classifyScriptExists &&
    writeOutputScriptExists &&
    hasMistralApiKey &&
    hasMoonshotApiKey &&
    hasVisionCompareModel &&
    hasValidVisionCompareModel &&
    hasVisionJudgeModel &&
    pdftoppm.available;

  return {
    enabled: config.enabled,
    configured,
    strictValidation: true,
    hasMistralApiKey,
    hasMoonshotApiKey,
    hasGeminiApiKey,
    hasVisionCompareModel,
    hasValidVisionCompareModel,
    hasVisionJudgeModel,
    visionCompareModel: config.visionCompareModel,
    visionJudgeModel: config.visionJudgeModel,
    visionProofreadModel: config.visionProofreadModel,
    visionCompareTimeoutMs: config.visionCompareTimeoutMs,
    visionJudgeTimeoutMs: config.visionJudgeTimeoutMs,
    visionRenderDpi: config.visionRenderDpi,
    externalReferencePath: config.externalReferencePath,
    openAgentVerifyFootprint: config.openAgentVerifyFootprint,
    openAgentEnableMcpStage: config.openAgentEnableMcpStage,
    agentRoot: config.agentRoot,
    agentRootExists,
    openPdfAgentScriptPath: config.openPdfAgentScriptPath,
    openPdfAgentScriptExists,
    ocrScriptPath: config.ocrScriptPath,
    ocrScriptExists,
    classifyScriptPath: config.classifyScriptPath,
    classifyScriptExists,
    enhanceScriptPath: config.enhanceScriptPath,
    enhanceScriptExists,
    writeOutputScriptPath: config.writeOutputScriptPath,
    writeOutputScriptExists,
    enableClassification: config.enableClassification,
    enableEnhancement: config.enableEnhancement,
    enableVisionProofread: config.enableVisionProofread,
    timeoutMs: config.timeoutMs,
    pages: config.pages,
    dependencies: {
      pdftoppm,
    },
    providers: {
      compare: compareRuntime,
      judge: judgeRuntime,
    },
    errorCodes,
  };
};
