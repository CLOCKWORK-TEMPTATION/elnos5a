#!/usr/bin/env node

/**
 * TypeScript conversion of ncio_mistral_all_in_one.py
 * PDF -> Markdown عبر Mistral OCR مع طبقة تطبيع + LLM refinement اختياري.
 *
 * تم تفكيك هذا الملف إلى وحدات منفصلة — هذا الملف يعيد تصدير الكلاسات العامة
 * ويحتفظ بـ PDFToTextConverter + main().
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  StructuralRepair,
  waitForRepairStability,
} from "./structural-repair.js";

// Re-export decomposed modules for backward compatibility
export type {
  LLMConfig,
  MistralOCRConfig,
  PreOCRConfig,
  NormalizationOptions,
  ConfigManager,
} from "./types.js";
export { log } from "./ocr-logger.js";
export {
  ensureTrailingNewline,
  fileExists,
  isTruthy,
  loadEnvFile,
} from "./text-helpers.js";
export { buildConfig } from "./config-builder.js";
export { MarkdownNormalizer } from "./markdown-normalizer.js";
export { OCRPreprocessor } from "./ocr-preprocessor.js";
export { LLMPostProcessor, QualityChecker } from "./llm-post-processor.js";
export { MistralOCRService } from "./mistral-ocr-client.js";

import type { ConfigManager } from "./types.js";
import { log } from "./ocr-logger.js";
import {
  ensureTrailingNewline,
  fileExists,
  isTruthy,
  loadEnvFile,
} from "./text-helpers.js";
import { buildConfig } from "./config-builder.js";
import { MarkdownNormalizer } from "./markdown-normalizer.js";
import { OCRPreprocessor } from "./ocr-preprocessor.js";
import { LLMPostProcessor, QualityChecker } from "./llm-post-processor.js";
import { MistralOCRService } from "./mistral-ocr-client.js";

// ============================================================================
// Converter
// ============================================================================

export class PDFToTextConverter {
  private readonly config: ConfigManager;
  private readonly normalizer: MarkdownNormalizer;
  private readonly mistralService: MistralOCRService;
  private readonly llmPostProcessor?: LLMPostProcessor;
  private readonly structuralRepair: StructuralRepair;
  private readonly ocrPreprocessor: OCRPreprocessor;

  constructor(config: ConfigManager) {
    this.config = config;
    this.normalizer = new MarkdownNormalizer(config.normalizerOptions);
    this.mistralService = new MistralOCRService(config.mistral);
    this.structuralRepair = new StructuralRepair();
    this.ocrPreprocessor = new OCRPreprocessor();
    if (config.llm.enabled) {
      this.llmPostProcessor = new LLMPostProcessor(config.llm);
    }
  }

  async extractMarkdown(): Promise<string> {
    if (!(await fileExists(this.config.inputPath))) {
      throw new Error(
        `الملف غير موجود في المسار المحدد: ${this.config.inputPath}`
      );
    }

    const ext = path.extname(this.config.inputPath).toLowerCase();
    log("INFO", "بدء المعالجة للملف: %s", this.config.inputPath);

    if (ext === ".md" || ext === ".txt") {
      return readFile(this.config.inputPath, "utf-8");
    }

    if (ext !== ".pdf") {
      throw new Error("صيغة الملف غير مدعومة. الصيغ المقبولة: PDF, MD, TXT");
    }

    return this.processPdf();
  }

  private async processPdf(): Promise<string> {
    if (!this.config.mistral.useDocumentInput) {
      throw new Error(
        "في نسخة TypeScript يجب استخدام OCR المباشر للـ PDF (أزل --mistral-disable-document-input). "
      );
    }

    try {
      log("INFO", "محاولة OCR مباشر للـ PDF عبر Mistral (document_url)...");
      const markdown = (
        await this.mistralService.processPdfFile(this.config.inputPath)
      ).trim();
      if (!markdown) {
        throw new Error("OCR المباشر أعاد ناتجاً فارغاً.");
      }
      log("INFO", "نجح OCR المباشر للـ PDF.");
      return ensureTrailingNewline(markdown);
    } catch (error) {
      throw new Error(`فشل OCR المباشر للـ PDF: ${String(error)}`);
    }
  }

  resolveOutputPath(): string {
    if (this.config.outputPath) {
      return this.config.outputPath;
    }

    const ext = path.extname(this.config.inputPath);
    if (ext.toLowerCase() === ".pdf") {
      return this.config.inputPath.slice(0, -ext.length) + ".md";
    }

    const dir = path.dirname(this.config.inputPath);
    const stem = path.basename(this.config.inputPath, ext);
    return path.join(dir, `${stem}.normalized.md`);
  }

  resolveAnnotationOutputPath(outputPath: string): string {
    if (this.config.mistral.annotationOutputPath) {
      return this.config.mistral.annotationOutputPath;
    }

    const ext = path.extname(outputPath);
    const dir = path.dirname(outputPath);
    const stem = path.basename(outputPath, ext);
    return path.join(dir, `${stem}.annotation.json`);
  }

  getDocumentAnnotation(): unknown {
    return this.mistralService.getLastDocumentAnnotation();
  }

  async getNonOverwritingPath(filePath: string): Promise<string> {
    if (!(await fileExists(filePath))) {
      return filePath;
    }

    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    const stem = path.basename(filePath, ext);

    let c = 1;
    while (true) {
      const candidate = path.join(dir, `${stem}_${c}${ext}`);
      if (!(await fileExists(candidate))) {
        log(
          "INFO",
          "الملف %s موجود مسبقاً، سيتم الحفظ باسم: %s",
          filePath,
          candidate
        );
        return candidate;
      }
      c += 1;
    }
  }

  private async applyStructuralRepair(
    text: string,
    referenceText = ""
  ): Promise<string> {
    return waitForRepairStability(this.structuralRepair, text, referenceText);
  }

  calculateMatchScore(referenceText: string, candidateText: string): number {
    const refLines = referenceText.split(/\r?\n/);
    const candLines = candidateText.split(/\r?\n/);

    const maxLen = Math.max(refLines.length, candLines.length);
    if (maxLen === 0) {
      return 100;
    }

    let eq = 0;
    for (let i = 0; i < maxLen; i += 1) {
      if ((refLines[i] ?? "") === (candLines[i] ?? "")) {
        eq += 1;
      }
    }

    return Math.round((eq / maxLen) * 1000000) / 10000;
  }

  generateDiffPreview(
    referenceText: string,
    candidateText: string,
    maxLines: number
  ): string {
    const refLines = referenceText.split(/\r?\n/);
    const candLines = candidateText.split(/\r?\n/);
    const max = Math.max(refLines.length, candLines.length);

    const out: string[] = [];
    for (let i = 0; i < max; i += 1) {
      const r = refLines[i] ?? "";
      const c = candLines[i] ?? "";
      if (r === c) {
        continue;
      }
      out.push(`@@ line ${i + 1} @@`);
      out.push(`- ${r}`);
      out.push(`+ ${c}`);
      if (out.length >= maxLines) {
        break;
      }
    }

    return out.length > 0 ? out.slice(0, maxLines).join("\n") : "N/A";
  }

  async runLlmRefinement(initialMarkdown: string): Promise<string> {
    if (!this.llmPostProcessor) {
      return initialMarkdown;
    }

    let referenceText = await this.llmPostProcessor.getReferenceText();
    if (referenceText && this.config.normalizeOutput) {
      referenceText = this.normalizer.normalize(referenceText);
    }

    const repairedInitial = await this.applyStructuralRepair(
      initialMarkdown,
      referenceText
    );

    if (!referenceText) {
      log("INFO", "لا يوجد مرجع نصي؛ سيتم تنفيذ تمرير LLM واحد فقط.");
      let result = await this.llmPostProcessor.postprocess(repairedInitial);
      if (this.config.normalizeOutput) {
        result = this.normalizer.normalize(result);
      }
      return this.applyStructuralRepair(result);
    }

    let best = repairedInitial;
    let bestScore = this.calculateMatchScore(referenceText, best);
    let bestSemanticScore = QualityChecker.calculateSimilarity(
      referenceText,
      best
    );
    log("INFO", "نسبة التطابق قبل LLM: %.2f%%", bestScore);
    log("INFO", "نسبة التطابق الدلالي قبل LLM: %s%%", bestSemanticScore);

    let current = repairedInitial;
    const rounds = this.config.llm.iterative
      ? this.config.llm.maxIterations
      : 1;
    let noImprovementRounds = 0;
    const minImprovementDelta = 0.1;

    for (let i = 1; i <= rounds; i += 1) {
      if (bestScore >= this.config.llm.targetMatch) {
        log(
          "INFO",
          "تم الوصول للنسبة المستهدفة %.2f%% قبل الجولة %s.",
          this.config.llm.targetMatch,
          i
        );
        break;
      }

      const preview = this.generateDiffPreview(
        referenceText,
        current,
        this.config.llm.diffPreviewLines
      );
      const feedback = [
        `Current best match: ${bestScore.toFixed(2)}%. Target: ${this.config.llm.targetMatch.toFixed(2)}%.`,
        "Focus only on lines that differ from reference and avoid changing already matching lines.",
        `Diff preview:\n${preview}`,
      ].join("\n");

      let candidate = await this.llmPostProcessor.postprocess(
        current,
        referenceText,
        feedback
      );
      if (this.config.normalizeOutput) {
        candidate = this.normalizer.normalize(candidate);
      }
      candidate = await this.applyStructuralRepair(candidate, referenceText);

      const score = this.calculateMatchScore(referenceText, candidate);
      const semanticScore = QualityChecker.calculateSimilarity(
        referenceText,
        candidate
      );
      log("INFO", "جولة LLM %s/%s -> نسبة التطابق: %.2f%%", i, rounds, score);
      log(
        "INFO",
        "جولة LLM %s/%s -> نسبة التطابق الدلالي: %s%%",
        i,
        rounds,
        semanticScore
      );

      current = candidate;
      const improved =
        score > bestScore + minImprovementDelta ||
        (Math.abs(score - bestScore) <= minImprovementDelta &&
          semanticScore > bestSemanticScore);

      if (
        score > bestScore ||
        (score === bestScore && semanticScore >= bestSemanticScore)
      ) {
        bestScore = score;
        bestSemanticScore = semanticScore;
        best = candidate;
      }

      if (improved) {
        noImprovementRounds = 0;
      } else {
        noImprovementRounds += 1;
      }

      if (noImprovementRounds >= 2) {
        log(
          "INFO",
          "لا يوجد تحسن ملموس لعدد %s جولات متتالية، سيتم إيقاف التحسين التكراري.",
          noImprovementRounds
        );
        break;
      }
    }

    log("INFO", "أفضل نسبة تطابق بعد التحسين التكراري: %.2f%%", bestScore);
    log(
      "INFO",
      "أفضل نسبة تطابق دلالي بعد التحسين التكراري: %s%%",
      bestSemanticScore
    );
    return best;
  }

  async convert(): Promise<{ rawMarkdown: string; finalMarkdown: string }> {
    const rawMarkdown = await this.extractMarkdown();
    let finalMarkdown = rawMarkdown;

    if (this.config.normalizeOutput) {
      finalMarkdown = this.normalizer.normalize(rawMarkdown);
      log(
        "INFO",
        "اكتمل التطبيع: حجم النص قبل=%s حرف، بعد=%s حرف.",
        rawMarkdown.length,
        finalMarkdown.length
      );
    } else {
      log("INFO", "تم الاستخراج بدون تطبيع بناءً على الإعدادات.");
    }

    if (path.extname(this.config.inputPath).toLowerCase() === ".pdf") {
      const preprocessed = this.ocrPreprocessor.preprocess(finalMarkdown);
      if (preprocessed.detectedIssues.length > 0) {
        log(
          "INFO",
          "تم تطبيق تصحيحات OCR المسبقة: %s",
          preprocessed.detectedIssues.join(" | ")
        );
      }
      finalMarkdown = preprocessed.text;
    }

    finalMarkdown = await this.applyStructuralRepair(finalMarkdown);
    log("INFO", "اكتمل الإصلاح البنيوي الأولي للنص المستخرج.");

    if (this.config.llm.enabled && this.llmPostProcessor) {
      log("INFO", "بدء تمرير طبقة LLM لتحسين التطابق...");
      try {
        finalMarkdown = await this.runLlmRefinement(finalMarkdown);
        log("INFO", "اكتملت طبقة LLM بنجاح.");
      } catch (error) {
        if (this.config.llm.strict) {
          throw error;
        }
        log(
          "WARN",
          "فشلت طبقة LLM وسيتم المتابعة بالنص الحالي: %s",
          String(error)
        );
      }
    }

    return { rawMarkdown, finalMarkdown };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  if (isTruthy(process.env.FORCE_CPU_ONLY ?? "")) {
    process.env.CUDA_VISIBLE_DEVICES = "-1";
  }

  const envPath = path.join(process.cwd(), ".env");
  await loadEnvFile(envPath);

  const config = buildConfig(process.argv.slice(2));
  const converter = new PDFToTextConverter(config);

  try {
    const { rawMarkdown, finalMarkdown } = await converter.convert();
    log(
      "INFO",
      "العملية مكتملة. تم استخراج نص يحتوي على %s حرف.",
      finalMarkdown.length
    );

    const outputPath = await converter.getNonOverwritingPath(
      converter.resolveOutputPath()
    );

    if (config.saveRawMarkdown && rawMarkdown !== finalMarkdown) {
      const ext = path.extname(outputPath);
      const stem = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      const rawPath = await converter.getNonOverwritingPath(
        path.join(dir, `${stem}.raw.md`)
      );
      await writeFile(rawPath, rawMarkdown, "utf-8");
      log("INFO", "تم حفظ النسخة الخام في: %s", rawPath);
    }

    await writeFile(outputPath, finalMarkdown, "utf-8");
    log("INFO", "تم حفظ النص المستخرج في: %s", outputPath);

    const annotation = converter.getDocumentAnnotation();
    if (annotation !== undefined && annotation !== null) {
      const annotationPath = await converter.getNonOverwritingPath(
        converter.resolveAnnotationOutputPath(outputPath)
      );
      await writeFile(
        annotationPath,
        `${JSON.stringify(annotation, null, 2)}\n`,
        "utf-8"
      );
      log("INFO", "تم حفظ document annotation في: %s", annotationPath);
    }

    log("INFO", "تمت المعالجة بنجاح.");
  } catch (error) {
    log(
      "CRITICAL",
      "فشل البرنامج في إكمال المهمة المطلوبة بسبب الخطأ: %s",
      String(error)
    );
    process.exitCode = 1;
  }
}

// Only run main() if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
