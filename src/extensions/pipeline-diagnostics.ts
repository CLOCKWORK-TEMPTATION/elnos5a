/**
 * @module pipeline-diagnostics
 * @description أداة تشخيص تلقائية — تشغّل الـ pipeline بكل تركيبة flags
 *   وتقارن النتايج مع الـ baseline في ضربة واحدة.
 *
 *   الاستخدام من الـ console:
 *     window.__diagnosePipeline()          // يستخدم النص الموجود في المحرر
 *     window.__diagnosePipeline(myText)    // يستخدم نص مخصص
 */
import {
  classifyLines,
  PIPELINE_FLAGS,
  type ClassifyLinesContext,
} from "./paste-classifier";
import type { ClassifiedDraftWithId } from "./paste-classifier-helpers";
import { registerPipelineRecorderUI } from "./pipeline-recorder";

// ─── أنواع التقرير ────────────────────────────────────────────────

type FlagKey = keyof typeof PIPELINE_FLAGS;

interface LayerDiff {
  lineIndex: number;
  text: string;
  baselineType: string;
  variantType: string;
  baselineConfidence: number;
  variantConfidence: number;
}

interface LayerReport {
  flag: FlagKey;
  totalLines: number;
  changedLines: number;
  changeRate: string;
  diffs: LayerDiff[];
  typeDistDelta: Record<string, number>;
}

interface DiagnosticReport {
  timestamp: string;
  inputLines: number;
  baselineTypeDist: Record<string, number>;
  layers: LayerReport[];
  /** الطبقات مرتبة من الأكثر تأثير للأقل */
  ranking: { flag: FlagKey; changedLines: number; changeRate: string }[];
  /** تركيبة كل الطبقات مع بعض */
  allOnReport: LayerReport;
}

// ─── دوال مساعدة ──────────────────────────────────────────────────

const ALL_FLAGS: FlagKey[] = [
  "DCG_ENABLED",
  "SELF_REFLECTION_ENABLED",
  "RETRO_NEW_PATTERNS_ENABLED",
  "REVERSE_PASS_ENABLED",
  "VITERBI_OVERRIDE_ENABLED",
];

/** حفظ الحالة الحالية واسترجاعها */
const snapshotFlags = (): Record<FlagKey, boolean> => ({ ...PIPELINE_FLAGS });

const restoreFlags = (snapshot: Record<FlagKey, boolean>): void => {
  for (const key of ALL_FLAGS) {
    (PIPELINE_FLAGS as Record<FlagKey, boolean>)[key] = snapshot[key];
  }
};

const setAllFlags = (value: boolean): void => {
  for (const key of ALL_FLAGS) {
    (PIPELINE_FLAGS as Record<FlagKey, boolean>)[key] = value;
  }
};

const typeDist = (
  classified: readonly ClassifiedDraftWithId[]
): Record<string, number> => {
  const dist: Record<string, number> = {};
  for (const item of classified) {
    dist[item.type] = (dist[item.type] ?? 0) + 1;
  }
  return dist;
};

const diffClassified = (
  baseline: readonly ClassifiedDraftWithId[],
  variant: readonly ClassifiedDraftWithId[]
): LayerDiff[] => {
  const diffs: LayerDiff[] = [];
  const len = Math.max(baseline.length, variant.length);
  for (let i = 0; i < len; i++) {
    const b = baseline[i];
    const v = variant[i];
    if (!b || !v) {
      diffs.push({
        lineIndex: i,
        text: (b?.text ?? v?.text ?? "").slice(0, 60),
        baselineType: b?.type ?? "—",
        variantType: v?.type ?? "—",
        baselineConfidence: b?.confidence ?? 0,
        variantConfidence: v?.confidence ?? 0,
      });
      continue;
    }
    if (b.type !== v.type) {
      diffs.push({
        lineIndex: i,
        text: b.text.slice(0, 60),
        baselineType: b.type,
        variantType: v.type,
        baselineConfidence: b.confidence,
        variantConfidence: v.confidence,
      });
    }
  }
  return diffs;
};

const typeDistDelta = (
  baselineDist: Record<string, number>,
  variantDist: Record<string, number>
): Record<string, number> => {
  const allTypes = new Set([
    ...Object.keys(baselineDist),
    ...Object.keys(variantDist),
  ]);
  const delta: Record<string, number> = {};
  for (const t of allTypes) {
    const d = (variantDist[t] ?? 0) - (baselineDist[t] ?? 0);
    if (d !== 0) delta[t] = d;
  }
  return delta;
};

// ─── المحرك الرئيسي ──────────────────────────────────────────────

const runWithFlags = (
  text: string,
  ctx?: ClassifyLinesContext
): ClassifiedDraftWithId[] => {
  return classifyLines(text, ctx);
};

/**
 * يشغّل التشخيص الكامل ويرجع تقرير مفصّل.
 */
export const diagnosePipeline = (
  text: string,
  ctx?: ClassifyLinesContext
): DiagnosticReport => {
  const saved = snapshotFlags();

  try {
    // ── 1) Baseline: كل الطبقات OFF ──
    setAllFlags(false);
    const baseline = runWithFlags(text, ctx);
    const baselineDist = typeDist(baseline);

    // ── 2) كل طبقة لوحدها ──
    const layers: LayerReport[] = [];
    for (const flag of ALL_FLAGS) {
      setAllFlags(false);
      (PIPELINE_FLAGS as Record<FlagKey, boolean>)[flag] = true;

      const variant = runWithFlags(text, ctx);
      const diffs = diffClassified(baseline, variant);
      const vDist = typeDist(variant);

      layers.push({
        flag,
        totalLines: variant.length,
        changedLines: diffs.length,
        changeRate:
          baseline.length > 0
            ? ((diffs.length / baseline.length) * 100).toFixed(1) + "%"
            : "0%",
        diffs,
        typeDistDelta: typeDistDelta(baselineDist, vDist),
      });
    }

    // ── 3) كل الطبقات ON مع بعض ──
    setAllFlags(true);
    const allOn = runWithFlags(text, ctx);
    const allOnDiffs = diffClassified(baseline, allOn);
    const allOnDist = typeDist(allOn);
    const allOnReport: LayerReport = {
      flag: "ALL_ON" as FlagKey,
      totalLines: allOn.length,
      changedLines: allOnDiffs.length,
      changeRate:
        baseline.length > 0
          ? ((allOnDiffs.length / baseline.length) * 100).toFixed(1) + "%"
          : "0%",
      diffs: allOnDiffs,
      typeDistDelta: typeDistDelta(baselineDist, allOnDist),
    };

    // ── 4) ترتيب الطبقات بالتأثير ──
    const ranking = layers
      .map((l) => ({
        flag: l.flag,
        changedLines: l.changedLines,
        changeRate: l.changeRate,
      }))
      .sort((a, b) => b.changedLines - a.changedLines);

    return {
      timestamp: new Date().toISOString(),
      inputLines: baseline.length,
      baselineTypeDist: baselineDist,
      layers,
      ranking,
      allOnReport,
    };
  } finally {
    restoreFlags(saved);
  }
};

// ─── عرض التقرير في الـ console ────────────────────────────────────

const printReport = (report: DiagnosticReport): void => {
  console.warn(
    "%c╔══════════════════════════════════════════════════════╗",
    "color: #00ff88; font-weight: bold"
  );
  console.warn(
    "%c║      🔬 Pipeline Layer Diagnostics Report           ║",
    "color: #00ff88; font-weight: bold"
  );
  console.warn(
    "%c╚══════════════════════════════════════════════════════╝",
    "color: #00ff88; font-weight: bold"
  );

  console.warn(`\n📊 Baseline: ${report.inputLines} lines`);
  // eslint-disable-next-line no-console
  console.table(report.baselineTypeDist);

  console.warn(
    "\n%c🏆 Layer Impact Ranking (من الأكثر تأثير للأقل):",
    "color: #ffcc00; font-weight: bold"
  );
  // eslint-disable-next-line no-console
  console.table(
    report.ranking.map((r) => ({
      "🏷️ Layer": r.flag,
      "📐 Changed Lines": r.changedLines,
      "📊 Change Rate": r.changeRate,
    }))
  );

  // تفاصيل كل طبقة
  for (const layer of report.layers) {
    if (layer.changedLines === 0) {
      console.warn(`\n✅ ${layer.flag}: لا تغيير`);
      continue;
    }

    console.warn(
      `\n%c⚠️ ${layer.flag}: ${layer.changedLines} lines changed (${layer.changeRate})`,
      "color: #ff6b6b; font-weight: bold"
    );

    if (Object.keys(layer.typeDistDelta).length > 0) {
      console.warn("   Type distribution delta:");
      // eslint-disable-next-line no-console
      console.table(layer.typeDistDelta);
    }

    // أول 10 تغييرات كمثال
    const sample = layer.diffs.slice(0, 10);
    // eslint-disable-next-line no-console
    console.table(
      sample.map((d) => ({
        "Line#": d.lineIndex,
        Text: d.text.slice(0, 40),
        Baseline: d.baselineType,
        "→ Variant": d.variantType,
        "Δ Conf":
          d.variantConfidence - d.baselineConfidence > 0
            ? `+${d.variantConfidence - d.baselineConfidence}`
            : `${d.variantConfidence - d.baselineConfidence}`,
      }))
    );
    if (layer.diffs.length > 10) {
      console.warn(`   ... و ${layer.diffs.length - 10} تغيير تاني`);
    }
  }

  // ALL ON
  console.warn(
    `\n%c🔥 ALL LAYERS ON: ${report.allOnReport.changedLines} lines changed (${report.allOnReport.changeRate})`,
    "color: #ff00ff; font-weight: bold"
  );
  if (report.allOnReport.diffs.length > 0) {
    // eslint-disable-next-line no-console
    console.table(
      report.allOnReport.diffs.slice(0, 15).map((d) => ({
        "Line#": d.lineIndex,
        Text: d.text.slice(0, 40),
        Baseline: d.baselineType,
        "→ All ON": d.variantType,
      }))
    );
  }

  console.warn("\n%c─── Full report object: ───", "color: #888");
  console.warn(report);
};

// ─── ربط بالـ window للاستخدام من الـ console ──────────────────────

/**
 * يسجّل `window.__diagnosePipeline` و `window.__lastDiagReport`.
 *
 * @param getEditorText - دالة ترجع النص الحالي من المحرر
 */
export const registerPipelineDiagnostics = (
  getEditorText: () => string
): void => {
  if (typeof window === "undefined") return;

  const win = window as unknown as Record<string, unknown>;

  win.__diagnosePipeline = (
    customText?: string,
    ctx?: ClassifyLinesContext
  ): DiagnosticReport => {
    const text = customText ?? getEditorText();
    if (!text.trim()) {
      console.warn("⚠️ مفيش نص — افتح ملف الأول أو مرّر نص كـ argument");
      return {} as DiagnosticReport;
    }

    console.warn(`🔬 Running diagnostics on ${text.length} chars...`);
    const t0 = performance.now();
    const report = diagnosePipeline(text, ctx);
    const elapsed = (performance.now() - t0).toFixed(0);
    console.warn(`⏱️ Done in ${elapsed}ms\n`);

    printReport(report);
    win.__lastDiagReport = report;
    return report;
  };

  // ── تسجيل أدوات الـ Pipeline Recorder (رادار شامل) ──
  registerPipelineRecorderUI();

  console.warn(
    "%c🔬 Pipeline diagnostics ready! Run: __diagnosePipeline()",
    "color: #00ff88; font-weight: bold; font-size: 13px"
  );
};
