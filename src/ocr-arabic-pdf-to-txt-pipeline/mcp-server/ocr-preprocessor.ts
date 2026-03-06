/**
 * @description معالج مسبق لتصحيح أخطاء OCR الشائعة في النصوص العربية
 */

import type { PreprocessResult } from "./types.js";
import {
  CRITICAL_OCR_REPLACEMENTS,
  escapeRegExp,
  normalizeHindiDigitsToWestern,
  normalizeSceneHeadersRobust,
  SCENE_HEADER_LINE_PATTERN,
} from "./text-helpers.js";

export class OCRPreprocessor {
  private static readonly NAME_PATTERNS = [
    { reversed: "يربص", correct: "صبري" },
    { reversed: "فصنم", correct: "منصف" },
    { reversed: "دومحم", correct: "محمود" },
    { reversed: "دمحا", correct: "أحمد" },
    { reversed: "دنه", correct: "هند" },
    { reversed: "يسوب", correct: "بوسي" },
    { reversed: "رمرم", correct: "مرمر" },
    { reversed: "مإ مإ", correct: "إم إم" },
    { reversed: "ىطسلاا", correct: "الاسطى" },
    { reversed: "يزوف", correct: "فوزي" },
    { reversed: "سونرع", correct: "عرنوس" },
    { reversed: "دعسم", correct: "مسعد" },
  ] as const;

  preprocess(text: string): PreprocessResult {
    const issues: string[] = [];
    let processed = this.fixCatastrophicStart(text, issues);

    for (const pattern of OCRPreprocessor.NAME_PATTERNS) {
      if (processed.includes(pattern.reversed)) {
        issues.push(`انعكاس: ${pattern.reversed} ← ${pattern.correct}`);
        processed = processed.replace(
          new RegExp(escapeRegExp(pattern.reversed), "g"),
          pattern.correct
        );
      }
    }

    processed = this.applyCriticalCorrections(processed, issues);

    const digitsNormalized = normalizeHindiDigitsToWestern(processed);
    if (digitsNormalized !== processed) {
      issues.push("تحويل الأرقام الهندية إلى عربية");
      processed = digitsNormalized;
    }

    processed = this.normalizeSceneHeaders(processed, issues);

    if (processed.match(/^-\s+/m)) {
      issues.push("توحيد علامات الكلام: - ← •");
      processed = processed.replace(/^-\s+/gm, "• ");
    }

    if (processed.includes("ام ام")) {
      issues.push("إضافة همزة: ام ام ← إم إم");
      processed = processed.replace(/ام ام/g, "إم إم");
    }

    const scenePattern = /مشهد[١٢٣٤٥٦٧٨٩٠1-9]/g;
    const scenes = processed.match(scenePattern);
    if (scenes && scenes.length > 1) {
      issues.push(`إضافة كلمة "قطع" قبل ${scenes.length - 1} مشهد`);
    }

    return { text: processed, detectedIssues: issues };
  }

  private fixCatastrophicStart(text: string, issues: string[]): string {
    const lines = text.split(/\r?\n/);
    const firstIndex = lines.findIndex((line) => line.trim().length > 0);
    if (firstIndex < 0) {
      return text;
    }

    let sceneLineIndex = firstIndex;
    let sceneLine = lines[sceneLineIndex].trim();

    if (/^[٠١٢٣٤٥٦٧٨٩0-9]+$/u.test(sceneLine)) {
      const nextNonEmptyIndex = lines.findIndex(
        (line, index) => index > sceneLineIndex && line.trim().length > 0
      );
      if (nextNonEmptyIndex >= 0) {
        sceneLineIndex = nextNonEmptyIndex;
        sceneLine = lines[sceneLineIndex].trim();
      }
    }

    if (/^(?:\s*#+\s*)?مشهد\s*[٠١٢٣٤٥٦٧٨٩0-9]+\b/u.test(sceneLine)) {
      return text;
    }

    const sceneMatch = sceneLine.match(SCENE_HEADER_LINE_PATTERN);
    if (!sceneMatch) {
      return text;
    }

    const sceneNumber = normalizeHindiDigitsToWestern(
      sceneMatch[1] ?? ""
    ).trim();
    if (!sceneNumber) {
      return text;
    }

    if (
      sceneLineIndex !== firstIndex &&
      /^[٠١٢٣٤٥٦٧٨٩0-9]+$/u.test(lines[firstIndex].trim())
    ) {
      lines.splice(firstIndex, 1);
      sceneLineIndex -= 1;
    }

    const tail = (sceneMatch[2] ?? "").trim();
    if (tail) {
      lines.splice(sceneLineIndex, 1, `مشهد${sceneNumber}`, tail);
    } else {
      lines[sceneLineIndex] = `مشهد${sceneNumber}`;
    }

    if (!text.includes("بسم الله")) {
      lines.unshift("بسم الله الرحمن الرحيم");
      issues.push("إصلاح بداية كارثية: إضافة البسملة وتطبيع أول مشهد");
    } else {
      issues.push("إصلاح بداية كارثية: تطبيع أول مشهد");
    }

    return lines.join("\n");
  }

  private applyCriticalCorrections(text: string, issues: string[]): string {
    let out = text;
    for (const replacement of CRITICAL_OCR_REPLACEMENTS) {
      if (!out.includes(replacement.wrong)) {
        continue;
      }
      out = out.replace(
        new RegExp(escapeRegExp(replacement.wrong), "g"),
        replacement.correct
      );
      issues.push(`تصحيح حرج: ${replacement.label}`);
    }
    return out;
  }

  private normalizeSceneHeaders(text: string, issues: string[]): string {
    return normalizeSceneHeadersRobust(text, (sceneHeader) => {
      issues.push(`توحيد ترويسة مشهد: ${sceneHeader}`);
    });
  }
}
