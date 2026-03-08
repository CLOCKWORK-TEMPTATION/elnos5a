/**
 * @description تطبيع بيانات استجابة الاستخراج
 */

import { isObjectRecord, isNonEmptyString } from "./text-normalizer.mjs";

const SUPPORTED_EXTRACTION_METHODS = new Set([
  "native-text",
  "mammoth",
  "doc-converter-flow",
  "ocr-mistral",
  "backend-api",
  "app-payload",
  "karank-engine-bridge",
]);

export const normalizeExtractionResponseData = (result, fileType) => {
  if (!isObjectRecord(result)) {
    throw new Error("Extraction returned invalid payload.");
  }

  const text = typeof result.text === "string" ? result.text : "";
  const method =
    typeof result.method === "string" ? result.method.trim().slice(0, 64) : "";
  const usedOcr = Boolean(result.usedOcr);
  const attempts = Array.isArray(result.attempts)
    ? result.attempts.filter((entry) => isNonEmptyString(entry)).slice(0, 24)
    : [];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.filter((entry) => isNonEmptyString(entry)).slice(0, 24)
    : [];

  if (!SUPPORTED_EXTRACTION_METHODS.has(method)) {
    throw new Error(`Extraction returned unsupported method: ${method}`);
  }

  const pipelineFootprint =
    isObjectRecord(result.pipelineFootprint) &&
    Array.isArray(result.pipelineFootprint.checkedDirectories) &&
    Array.isArray(result.pipelineFootprint.checkedFiles) &&
    result.pipelineFootprint.checkedDirectories.every((entry) =>
      isNonEmptyString(entry)
    ) &&
    result.pipelineFootprint.checkedFiles.every((entry) =>
      isNonEmptyString(entry)
    )
      ? {
          checkedDirectories: result.pipelineFootprint.checkedDirectories,
          checkedFiles: result.pipelineFootprint.checkedFiles,
        }
      : undefined;

  return {
    text,
    textRaw:
      typeof result.textRaw === "string"
        ? result.textRaw
        : typeof result.rawExtractedText === "string"
          ? result.rawExtractedText
          : text,
    textMarkdown:
      typeof result.textMarkdown === "string" ? result.textMarkdown : undefined,
    rawExtractedText:
      typeof result.rawExtractedText === "string"
        ? result.rawExtractedText
        : undefined,
    fileType,
    method,
    usedOcr,
    warnings,
    attempts,
    qualityScore:
      typeof result.qualityScore === "number" &&
      Number.isFinite(result.qualityScore)
        ? result.qualityScore
        : undefined,
    artifactLinesRemoved:
      typeof result.artifactLinesRemoved === "number" &&
      Number.isFinite(result.artifactLinesRemoved)
        ? result.artifactLinesRemoved
        : undefined,
    normalizationApplied: Array.isArray(result.normalizationApplied)
      ? result.normalizationApplied
          .filter((entry) => isNonEmptyString(entry))
          .slice(0, 24)
      : undefined,
    structuredBlocks: Array.isArray(result.structuredBlocks)
      ? result.structuredBlocks
          .filter(
            (block) =>
              isObjectRecord(block) &&
              isNonEmptyString(block.formatId) &&
              typeof block.text === "string"
          )
          .map((block) => ({
            formatId: block.formatId.trim(),
            text: block.text,
          }))
      : undefined,
    pipelineFootprint,
    payloadVersion:
      typeof result.payloadVersion === "number" &&
      Number.isInteger(result.payloadVersion)
        ? result.payloadVersion
        : undefined,
    referenceMode:
      typeof result.referenceMode === "string"
        ? result.referenceMode
        : undefined,
    status: typeof result.status === "string" ? result.status : undefined,
    rejectionReason:
      typeof result.rejectionReason === "string"
        ? result.rejectionReason
        : undefined,
    quality:
      isObjectRecord(result.quality) &&
      typeof result.quality.wordMatch === "number" &&
      typeof result.quality.structuralMatch === "number" &&
      typeof result.quality.accepted === "boolean"
        ? {
            wordMatch: result.quality.wordMatch,
            structuralMatch: result.quality.structuralMatch,
            accepted: result.quality.accepted,
          }
        : undefined,
    mismatchReport: Array.isArray(result.mismatchReport)
      ? result.mismatchReport
          .filter(
            (entry) =>
              isObjectRecord(entry) &&
              typeof entry.page === "number" &&
              typeof entry.line === "number" &&
              typeof entry.token === "string" &&
              typeof entry.expected === "string" &&
              typeof entry.actual === "string" &&
              (entry.severity === "critical" || entry.severity === "normal")
          )
          .slice(0, 10_000)
      : undefined,
    schemaText:
      typeof result.schemaText === "string" ? result.schemaText : undefined,
    schemaElements: Array.isArray(result.schemaElements)
      ? result.schemaElements
          .filter(
            (el) =>
              isObjectRecord(el) &&
              typeof el.element === "string" &&
              typeof el.value === "string"
          )
          .map((el) => ({ element: el.element, value: el.value }))
      : undefined,
    mismatchReportPath:
      typeof result.mismatchReportPath === "string"
        ? result.mismatchReportPath
        : undefined,
    classification: isObjectRecord(result.classification)
      ? {
          type:
            typeof result.classification.type === "string"
              ? result.classification.type
              : undefined,
          pages:
            typeof result.classification.pages === "number"
              ? result.classification.pages
              : undefined,
          sizeMb:
            typeof result.classification.size_mb === "number"
              ? result.classification.size_mb
              : undefined,
          hasArabic:
            typeof result.classification.has_arabic === "boolean"
              ? result.classification.has_arabic
              : undefined,
          recommendedEngine:
            typeof result.classification.recommended_engine === "string"
              ? result.classification.recommended_engine
              : undefined,
        }
      : undefined,
  };
};
