/**
 * @description أنواع TypeScript لمحول PDF إلى نص عبر Mistral OCR
 */

export interface LLMConfig {
  enabled: boolean;
  model: string;
  referencePath?: string;
  strict: boolean;
  iterative: boolean;
  maxIterations: number;
  targetMatch: number;
  diffPreviewLines: number;
}

export interface MistralOCRConfig {
  model: string;
  useDocumentInput: boolean;
  useBatchOCR: boolean;
  batchTimeoutSec: number;
  batchPollIntervalSec: number;
  annotationSchemaPath?: string;
  annotationPrompt?: string;
  annotationOutputPath?: string;
  annotationStrict: boolean;
  tableFormat?: "markdown" | "html";
  extractHeader: boolean;
  extractFooter: boolean;
  includeImageBase64: boolean;
}

export interface PreOCRConfig {
  enabled: boolean;
  lang: string;
  matchThreshold: number;
  fullpageFallbackRatio: number;
  regionPaddingPx: number;
}

export interface NormalizationOptions {
  normalizeYa?: boolean;
  normalizeTaMarbuta?: boolean;
  normalizeHamza?: boolean;
  normalizeDigits?: "none" | "arabic" | "western";
  removeDiacritics?: boolean;
  fixConnectedLetters?: boolean;
  fixArabicPunctuation?: boolean;
  scriptSpecificRules?: boolean;
}

export interface ConfigManager {
  inputPath: string;
  outputPath?: string;
  normalizeOutput: boolean;
  normalizerOptions?: NormalizationOptions;
  saveRawMarkdown: boolean;
  llm: LLMConfig;
  mistral: MistralOCRConfig;
  preOcr: PreOCRConfig;
}

export type JsonRecord = Record<string, unknown>;

export interface NamedReplacement {
  wrong: string;
  correct: string;
  label: string;
}

export interface ParsedArgs {
  [key: string]: string | boolean | undefined;
}

export interface PreprocessResult {
  text: string;
  detectedIssues: string[];
}
