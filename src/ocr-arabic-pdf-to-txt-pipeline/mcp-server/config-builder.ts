/**
 * @description بناء إعدادات محول OCR من سطر الأوامر ومتغيرات البيئة
 */

import process from "node:process";
import type {
  ConfigManager,
  LLMConfig,
  MistralOCRConfig,
  NormalizationOptions,
  ParsedArgs,
  PreOCRConfig,
} from "./types.js";
import { clamp, isTruthy, toNumberFloat, toNumberInt } from "./text-helpers.js";

const DEFAULT_LLM_MODEL = "kimi-k2.5";
const DEFAULT_MISTRAL_OCR_MODEL = "mistral-ocr-latest";
const DEFAULT_PRE_OCR_LANG = "ar";

const DEFAULT_MATCH_THRESHOLD = 0.88;
const DEFAULT_FULLPAGE_FALLBACK_RATIO = 0.7;
const DEFAULT_REGION_PADDING_PX = 12;
const DEFAULT_LLM_MAX_ITERATIONS = 3;
const DEFAULT_LLM_TARGET_MATCH = 100.0;
const DEFAULT_DIFF_PREVIEW_LINES = 12;

const DEFAULT_INPUT = String.raw`E:\New folder (31)\12.pdf`;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const arg = token.slice(2);
    const eq = arg.indexOf("=");

    if (eq >= 0) {
      const name = arg.slice(0, eq).trim();
      const value = arg.slice(eq + 1);
      if (name) {
        parsed[name] = value;
      }
      continue;
    }

    const name = arg.trim();
    if (!name) {
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[name] = next;
      i += 1;
    } else {
      parsed[name] = true;
    }
  }

  return parsed;
}

function argString(parsed: ParsedArgs, name: string, fallback: string): string {
  const v = parsed[name];
  if (typeof v === "string" && v.trim()) {
    return v;
  }
  return fallback;
}

function argOptionalString(
  parsed: ParsedArgs,
  name: string
): string | undefined {
  const v = parsed[name];
  if (typeof v === "string" && v.trim()) {
    return v;
  }
  return undefined;
}

function argBool(parsed: ParsedArgs, name: string, fallback = false): boolean {
  const v = parsed[name];
  if (typeof v === "boolean") {
    return v;
  }
  if (typeof v === "string") {
    return isTruthy(v);
  }
  return fallback;
}

export function buildConfig(argv: string[]): ConfigManager {
  const args = parseArgs(argv);

  const llm: LLMConfig = {
    enabled: argBool(args, "use-llm"),
    model: argString(args, "llm-model", DEFAULT_LLM_MODEL),
    referencePath: argOptionalString(args, "llm-reference"),
    strict: argBool(args, "llm-strict"),
    iterative: !argBool(args, "llm-no-iterative"),
    maxIterations: Math.max(
      1,
      toNumberInt(
        argOptionalString(args, "llm-max-iterations"),
        DEFAULT_LLM_MAX_ITERATIONS
      )
    ),
    targetMatch: clamp(
      toNumberFloat(
        argOptionalString(args, "llm-target-match"),
        DEFAULT_LLM_TARGET_MATCH
      ),
      0,
      100
    ),
    diffPreviewLines: Math.max(
      1,
      toNumberInt(
        argOptionalString(args, "llm-diff-preview-lines"),
        DEFAULT_DIFF_PREVIEW_LINES
      )
    ),
  };

  const tableRaw = (
    argOptionalString(args, "mistral-table-format") ??
    process.env.MISTRAL_OCR_TABLE_FORMAT ??
    ""
  )
    .trim()
    .toLowerCase();
  const tableFormat =
    tableRaw === "markdown" || tableRaw === "html"
      ? (tableRaw as "markdown" | "html")
      : undefined;

  const mistral: MistralOCRConfig = {
    model: argString(
      args,
      "mistral-ocr-model",
      (process.env.MISTRAL_OCR_MODEL ?? DEFAULT_MISTRAL_OCR_MODEL).trim() ||
        DEFAULT_MISTRAL_OCR_MODEL
    ),
    useDocumentInput: !argBool(args, "mistral-disable-document-input"),
    useBatchOCR: argBool(args, "mistral-use-batch"),
    batchTimeoutSec: Math.max(
      5,
      toNumberInt(
        argOptionalString(args, "mistral-batch-timeout-sec") ??
          process.env.MISTRAL_BATCH_TIMEOUT_SEC,
        300
      )
    ),
    batchPollIntervalSec: Math.max(
      0.5,
      toNumberFloat(
        argOptionalString(args, "mistral-batch-poll-interval-sec") ??
          process.env.MISTRAL_BATCH_POLL_INTERVAL_SEC,
        3
      )
    ),
    annotationSchemaPath:
      argOptionalString(args, "mistral-annotation-schema") ??
      (process.env.MISTRAL_ANNOTATION_SCHEMA_PATH?.trim() || undefined),
    annotationPrompt:
      argOptionalString(args, "mistral-annotation-prompt") ??
      (process.env.MISTRAL_ANNOTATION_PROMPT?.trim() || undefined),
    annotationOutputPath:
      argOptionalString(args, "mistral-annotation-output") ??
      (process.env.MISTRAL_ANNOTATION_OUTPUT_PATH?.trim() || undefined),
    annotationStrict: !argBool(args, "mistral-annotation-non-strict"),
    tableFormat,
    extractHeader: argBool(args, "mistral-extract-header"),
    extractFooter: argBool(args, "mistral-extract-footer"),
    includeImageBase64: argBool(args, "mistral-include-image-base64"),
  };
  if (mistral.model !== DEFAULT_MISTRAL_OCR_MODEL) {
    throw new Error(
      `Mistral OCR model must be ${DEFAULT_MISTRAL_OCR_MODEL}. Received: ${mistral.model}`
    );
  }

  const preOcr: PreOCRConfig = {
    enabled: !argBool(args, "disable-pre-ocr-filter"),
    lang: argString(
      args,
      "pre-ocr-lang",
      (process.env.PRE_OCR_LANG ?? DEFAULT_PRE_OCR_LANG).trim() ||
        DEFAULT_PRE_OCR_LANG
    ),
    matchThreshold: clamp(
      toNumberFloat(
        argOptionalString(args, "pre-ocr-match-threshold"),
        DEFAULT_MATCH_THRESHOLD
      ),
      0,
      1
    ),
    fullpageFallbackRatio: clamp(
      toNumberFloat(
        argOptionalString(args, "pre-ocr-fullpage-fallback-ratio"),
        DEFAULT_FULLPAGE_FALLBACK_RATIO
      ),
      0,
      1
    ),
    regionPaddingPx: Math.max(
      0,
      toNumberInt(
        argOptionalString(args, "pre-ocr-region-padding-px"),
        DEFAULT_REGION_PADDING_PX
      )
    ),
  };

  const normalizerOptions: NormalizationOptions = {
    normalizeYa: argBool(args, "normalize-ya", false),
    normalizeTaMarbuta: argBool(args, "normalize-ta-marbuta", false),
    normalizeHamza: !argBool(args, "no-normalize-hamza"),
    normalizeDigits: (argOptionalString(args, "normalize-digits") ??
      "arabic") as "none" | "arabic" | "western",
    removeDiacritics: !argBool(args, "no-remove-diacritics"),
    fixConnectedLetters: !argBool(args, "no-fix-connected-letters"),
    fixArabicPunctuation: !argBool(args, "no-fix-arabic-punctuation"),
    scriptSpecificRules: !argBool(args, "no-script-specific-rules"),
  };

  return {
    inputPath: argString(args, "input", DEFAULT_INPUT),
    outputPath: argOptionalString(args, "output"),
    normalizeOutput: !argBool(args, "no-normalize"),
    normalizerOptions,
    saveRawMarkdown: !argBool(args, "no-raw"),
    llm,
    mistral,
    preOcr,
  };
}
