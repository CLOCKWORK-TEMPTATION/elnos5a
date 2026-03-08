/**
 * @module extensions/document-context-graph
 * @description
 * خريطة سياق المستند (Document Context Graph — DCG).
 *
 * مسح أولي O(n) يُنفّذ **قبل** الـ forward pass لبناء خريطة هيكلية:
 * - حدود المشاهد (scene breaks)
 * - مناطق الحوار المحتملة (dialogue regions)
 * - سياق كل سطر (موقعه في المشهد، كثافة الحوار، الطول النسبي)
 *
 * يُصدّر:
 * - {@link DocumentContextGraph} — الخريطة الكاملة
 * - {@link LineContextInfo} — سياق سطر واحد
 * - {@link DialogueRegion} — منطقة حوار محتملة
 * - {@link buildDocumentContextGraph} — الدالة الرئيسية لبناء الـ DCG
 *
 * يُستهلك في: paste-classifier, hybrid-classifier, self-reflection-pass,
 * reverse-classification-pass, retroactive-corrector.
 */

import { isCompleteSceneHeaderLine } from "./scene-header-top-line";
import { normalizeLine } from "./text-utils";
import { logger } from "../utils/logger";
import { pipelineRecorder } from "./pipeline-recorder";

const dcgLogger = logger.createScope("document-context-graph");

// ─── الأنواع ──────────────────────────────────────────────────────

/** منطقة حوار محتملة — تجمّع أسطر قصيرة + colons قريبة */
export interface DialogueRegion {
  /** أول سطر في المنطقة (0-based index في الأسطر الأصلية) */
  readonly start: number;
  /** آخر سطر في المنطقة (inclusive) */
  readonly end: number;
  /** كثافة الحوار (0.0 → 1.0) — نسبة الأسطر القصيرة + colons */
  readonly density: number;
}

/** سياق سطر واحد داخل المستند */
export interface LineContextInfo {
  /** في أي مشهد (0-based) — -1 لو قبل أول scene header */
  readonly sceneIndex: number;
  /** موقعه داخل المشهد (0.0 = أول سطر، 1.0 = آخر سطر) */
  readonly scenePosition: number;
  /** عدد الأسطر في المشهد الحالي */
  readonly sceneLinesCount: number;
  /** في أي منطقة حوار (-1 = خارج أي منطقة) */
  readonly dialogueRegionIndex: number;
  /** كثافة الحوار في المنطقة (0 لو خارج منطقة حوار) */
  readonly dialogueDensity: number;
  /** طول السطر نسبة للمتوسط */
  readonly relativeLength: number;
}

/** خريطة سياق المستند الكاملة */
export interface DocumentContextGraph {
  /** عدد الأسطر الإجمالي */
  readonly totalLines: number;
  /** فهارس أسطر رؤوس المشاهد */
  readonly sceneBreaks: readonly number[];
  /** مناطق الحوار المحتملة */
  readonly dialogueRegions: readonly DialogueRegion[];
  /** متوسط طول الأسطر (بالحروف) */
  readonly avgLineLength: number;
  /** سياق كل سطر */
  readonly lineContexts: readonly LineContextInfo[];
}

// ─── ثوابت ─────────────────────────────────────────────────────────

/** الحد الأقصى لعدد كلمات سطر "قصير" (مؤشر حوار) */
const SHORT_LINE_MAX_WORDS = 3;

/** الحد الأدنى لعدد الأسطر في منطقة حوار */
const MIN_DIALOGUE_REGION_SIZE = 3;

/** أقصى فجوة بين أسطر حوار متتالية قبل ما نقسم المنطقة */
const MAX_DIALOGUE_GAP = 2;

// ─── الدوال المساعدة ──────────────────────────────────────────────

/** هل السطر ينتهي بنقطتين (مؤشر character)؟ */
const endsWithColon = (line: string): boolean => /[:：]\s*$/.test(line);

/** عدد كلمات السطر */
const wordCount = (line: string): number =>
  line.split(/\s+/).filter(Boolean).length;

/** أنماط تُستبعد — transitions و scene headers ما ينفعش تبقى "dialogue candidate" */
const DIALOGUE_EXCLUDES = /^(قطع|مشهد|نهار|ليل|خارجي|داخلي|مذكرة|استرجاع)/;

/** هل السطر "حواري" هيكلياً — قصير أو بجوار colon line */
const isDialogueCandidate = (normalized: string): boolean => {
  if (!normalized) return false;
  // استبعاد أنماط transitions/scene headers
  if (DIALOGUE_EXCLUDES.test(normalized)) return false;
  const wc = wordCount(normalized);
  // أسطر colons = مؤشر character → حوار قريب (≤3 كلمات بس)
  if (endsWithColon(normalized) && wc <= 3) return true;
  // أسطر قصيرة جداً (≤3 كلمات) بدون مؤشرات action
  if (wc <= SHORT_LINE_MAX_WORDS && !/^[-–—]/.test(normalized)) return true;
  return false;
};

// ─── بناء حدود المشاهد ───────────────────────────────────────────

/**
 * مسح الأسطر لإيجاد scene headers.
 * @returns مصفوفة بفهارس الأسطر اللي فيها scene header
 */
const findSceneBreaks = (lines: readonly string[]): number[] => {
  const breaks: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeLine(lines[i]);
    if (normalized && isCompleteSceneHeaderLine(normalized)) {
      breaks.push(i);
    }
  }
  return breaks;
};

// ─── بناء مناطق الحوار ───────────────────────────────────────────

/**
 * كشف مناطق الحوار المحتملة — تجمعات أسطر قصيرة/colons.
 */
const findDialogueRegions = (
  normalizedLines: readonly string[]
): DialogueRegion[] => {
  const regions: DialogueRegion[] = [];
  let regionStart = -1;
  let candidateCount = 0;
  let gap = 0;

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    if (isDialogueCandidate(line)) {
      if (regionStart === -1) {
        regionStart = i;
        candidateCount = 0;
      }
      candidateCount++;
      gap = 0;
    } else {
      gap++;
      if (gap > MAX_DIALOGUE_GAP && regionStart !== -1) {
        // أغلق المنطقة الحالية
        const regionEnd = i - gap;
        if (regionEnd >= regionStart) {
          const regionSize = regionEnd - regionStart + 1;
          if (regionSize >= MIN_DIALOGUE_REGION_SIZE) {
            const density = candidateCount / regionSize;
            regions.push({ start: regionStart, end: regionEnd, density });
          }
        }
        regionStart = -1;
        candidateCount = 0;
        gap = 0;
      }
    }
  }

  // أغلق آخر منطقة لو لسه مفتوحة
  if (regionStart !== -1) {
    const regionEnd = normalizedLines.length - 1 - gap;
    if (regionEnd >= regionStart) {
      const regionSize = regionEnd - regionStart + 1;
      if (regionSize >= MIN_DIALOGUE_REGION_SIZE) {
        const density = candidateCount / regionSize;
        regions.push({ start: regionStart, end: regionEnd, density });
      }
    }
  }

  return regions;
};

// ─── بناء سياق كل سطر ───────────────────────────────────────────

/**
 * حساب سياق كل سطر: المشهد، الموقع، المنطقة، الكثافة، الطول.
 */
const buildLineContexts = (
  normalizedLines: readonly string[],
  sceneBreaks: readonly number[],
  dialogueRegions: readonly DialogueRegion[],
  avgLength: number
): LineContextInfo[] => {
  const n = normalizedLines.length;
  if (n === 0) return [];

  // بناء خريطة scene → range
  const sceneRanges: { start: number; end: number }[] = [];
  for (let s = 0; s < sceneBreaks.length; s++) {
    const start = sceneBreaks[s];
    const end = s + 1 < sceneBreaks.length ? sceneBreaks[s + 1] - 1 : n - 1;
    sceneRanges.push({ start, end });
  }

  // خريطة line → dialogueRegionIndex
  const lineToRegion = new Int32Array(n).fill(-1);
  for (let r = 0; r < dialogueRegions.length; r++) {
    const region = dialogueRegions[r];
    for (let i = region.start; i <= region.end && i < n; i++) {
      lineToRegion[i] = r;
    }
  }

  const safeAvg = avgLength || 1;

  return normalizedLines.map((line, i) => {
    // إيجاد المشهد
    let sceneIndex = -1;
    let scenePosition = 0;
    let sceneLinesCount = 0;

    // binary search-like: آخر scene break ≤ i
    for (let s = sceneRanges.length - 1; s >= 0; s--) {
      if (sceneRanges[s].start <= i) {
        sceneIndex = s;
        const range = sceneRanges[s];
        sceneLinesCount = range.end - range.start + 1;
        scenePosition =
          sceneLinesCount > 1 ? (i - range.start) / (sceneLinesCount - 1) : 0;
        break;
      }
    }

    // إذا قبل أول scene header
    if (sceneIndex === -1 && sceneBreaks.length > 0) {
      sceneLinesCount = sceneBreaks[0];
      scenePosition = sceneLinesCount > 1 ? i / (sceneLinesCount - 1) : 0;
    }

    // منطقة الحوار
    const regionIdx = lineToRegion[i];
    const dialogueDensity =
      regionIdx >= 0 ? dialogueRegions[regionIdx].density : 0;

    return {
      sceneIndex,
      scenePosition,
      sceneLinesCount,
      dialogueRegionIndex: regionIdx,
      dialogueDensity,
      relativeLength: line.length / safeAvg,
    };
  });
};

// ─── الدالة الرئيسية ─────────────────────────────────────────────

/**
 * بناء خريطة سياق المستند — مسح أولي O(n) على الأسطر الخام.
 *
 * يُستدعى مرة واحدة في بداية `classifyLines` قبل الـ forward pass.
 *
 * @param rawLines - الأسطر الخام (بعد split + trim)
 * @returns {@link DocumentContextGraph}
 */
export const buildDocumentContextGraph = (
  rawLines: readonly string[]
): DocumentContextGraph => {
  pipelineRecorder.trackFile("document-context-graph.ts");
  const n = rawLines.length;
  if (n === 0) {
    return {
      totalLines: 0,
      sceneBreaks: [],
      dialogueRegions: [],
      avgLineLength: 0,
      lineContexts: [],
    };
  }

  // تطبيع الأسطر مرة واحدة
  const normalizedLines = rawLines.map((l) => normalizeLine(l));

  // 1. حدود المشاهد
  const sceneBreaks = findSceneBreaks(normalizedLines);

  // 2. مناطق الحوار
  const dialogueRegions = findDialogueRegions(normalizedLines);

  // 3. متوسط الطول
  const totalLength = normalizedLines.reduce((sum, l) => sum + l.length, 0);
  const avgLineLength = totalLength / n;

  // 4. سياق كل سطر
  const lineContexts = buildLineContexts(
    normalizedLines,
    sceneBreaks,
    dialogueRegions,
    avgLineLength
  );

  dcgLogger.info("dcg-built", {
    totalLines: n,
    sceneCount: sceneBreaks.length,
    dialogueRegions: dialogueRegions.length,
    avgLineLength: Math.round(avgLineLength),
  });

  return {
    totalLines: n,
    sceneBreaks,
    dialogueRegions,
    avgLineLength,
    lineContexts,
  };
};
