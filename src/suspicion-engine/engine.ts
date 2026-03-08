import type {
  SuspicionEngineInput,
  SuspicionEngineOutput,
  SuspicionWeightPolicy,
  SuspicionSignal,
  RoutingSummary,
  WeightPolicyProfile,
} from "@/suspicion-engine/types";
import type {
  DetectorFn,
  DetectorContext,
} from "@/suspicion-engine/detectors/detector-interface";
import { assembleSuspicionFeatures } from "@/suspicion-engine/features/feature-assembler";
import { buildSuspicionCase } from "@/suspicion-engine/aggregation/suspicion-case-builder";
import { ResolutionCoordinator } from "@/suspicion-engine/resolvers/resolution-coordinator";
import { localDeterministicResolver } from "@/suspicion-engine/resolvers/local-deterministic-resolver";
import { localRepairResolver } from "@/suspicion-engine/resolvers/local-repair-resolver";
import { noopResolver } from "@/suspicion-engine/resolvers/noop-resolver";
import { createWeightPolicy } from "@/suspicion-engine/config";

// ── Context detectors ──
import { detectOrphanDialogue } from "@/suspicion-engine/detectors/context/orphan-dialogue.detector";
import { detectCharacterFlow } from "@/suspicion-engine/detectors/context/character-flow.detector";
import { detectSequenceViolation } from "@/suspicion-engine/detectors/context/sequence-violation.detector";

// ── Gate-break detectors ──
import { detectDialogueGateBreak } from "@/suspicion-engine/detectors/gate-break/dialogue-gate.detector";
import { detectActionGateBreak } from "@/suspicion-engine/detectors/gate-break/action-gate.detector";
import { detectCharacterGateBreak } from "@/suspicion-engine/detectors/gate-break/character-gate.detector";

// ── Corruption detectors ──
import { detectSplitCharacter } from "@/suspicion-engine/detectors/corruption/split-character.detector";
import { detectOcrArtifact } from "@/suspicion-engine/detectors/corruption/ocr-artifact.detector";
import { detectWrappedDialogue } from "@/suspicion-engine/detectors/corruption/wrapped-dialogue.detector";

// ── Cross-pass detectors ──
import { detectReverseConflict } from "@/suspicion-engine/detectors/cross-pass/reverse-conflict.detector";
import { detectViterbiConflict } from "@/suspicion-engine/detectors/cross-pass/viterbi-conflict.detector";
import { detectMultiOverride } from "@/suspicion-engine/detectors/cross-pass/multi-override.detector";

// ── Source detectors ──
import { detectQualityRisk } from "@/suspicion-engine/detectors/source/quality-risk.detector";
import { detectImportProfile } from "@/suspicion-engine/detectors/source/import-profile.detector";
import { detectSourceHintMismatch } from "@/suspicion-engine/detectors/source/source-hint-mismatch.detector";

// ── جميع الكاشفات الـ 15 في ترتيب ثابت ──
const ALL_DETECTORS: readonly DetectorFn[] = [
  detectOrphanDialogue,
  detectCharacterFlow,
  detectSequenceViolation,
  detectDialogueGateBreak,
  detectActionGateBreak,
  detectCharacterGateBreak,
  detectSplitCharacter,
  detectOcrArtifact,
  detectWrappedDialogue,
  detectReverseConflict,
  detectViterbiConflict,
  detectMultiOverride,
  detectQualityRisk,
  detectImportProfile,
  detectSourceHintMismatch,
];

// ── عدد الجيران لكل اتجاه ──
const NEIGHBOR_WINDOW = 3;

/**
 * @class SuspicionEngine
 * @description
 * المنسّق الرئيسي لمحرك الاشتباه — يُشغّل جميع الكاشفات على كل سطر مصنَّف،
 * يُجمّع الإشارات، يبني حالات الاشتباه، ثم يُحيلها إلى منسّق القرار.
 */
export class SuspicionEngine {
  private readonly detectors: readonly DetectorFn[];
  private readonly policy: SuspicionWeightPolicy;

  constructor(params: {
    readonly detectors: readonly DetectorFn[];
    readonly policy: SuspicionWeightPolicy;
  }) {
    this.detectors = params.detectors;
    this.policy = params.policy;
  }

  analyze(input: SuspicionEngineInput): SuspicionEngineOutput {
    const {
      classifiedLines,
      traces,
      sequenceOptimization,
      extractionQuality: _extractionQuality,
    } = input;
    const totalLines = classifiedLines.length;

    // ── الخطوة 1: تشغيل الكاشفات على كل سطر ──────────────────────────────
    const signalsByLine = new Map<number, SuspicionSignal[]>();

    for (let i = 0; i < totalLines; i++) {
      const line = classifiedLines[i];
      const trace = traces.get(i);

      // تخطي السطور التي لا تملك trace
      if (trace === undefined) continue;

      // بناء قائمة الجيران (3 قبل + 3 بعد)
      const neighborStart = Math.max(0, i - NEIGHBOR_WINDOW);
      const neighborEnd = Math.min(totalLines - 1, i + NEIGHBOR_WINDOW);
      const neighbors = classifiedLines
        .slice(neighborStart, neighborEnd + 1)
        .filter((_, idx) => idx !== i - neighborStart);

      // جمع traces الجيران
      const neighborTraces = neighbors
        .map((_, idx) => {
          const neighborAbsIdx =
            idx < i - neighborStart
              ? neighborStart + idx
              : neighborStart + idx + 1;
          return traces.get(neighborAbsIdx);
        })
        .filter((t): t is NonNullable<typeof t> => t !== undefined);

      // تجميع المعلومات: دمج disagreements من sequenceOptimization في السياق
      const features = assembleSuspicionFeatures(
        trace,
        i,
        neighbors,
        totalLines
      );

      // بناء DetectorContext
      const detectorContext: DetectorContext = {
        lineIndex: i,
        totalLines,
        neighbors,
        neighborTraces,
        features,
      };

      // تشغيل جميع الكاشفات وجمع الإشارات
      const lineSignals: SuspicionSignal[] = [];
      for (const detector of this.detectors) {
        const signals = detector(trace, line, detectorContext);
        for (const signal of signals) {
          lineSignals.push(signal);
        }
      }

      // إضافة إشارة viterbi-conflict يدوياً من sequenceOptimization إذا لزم
      // (الكاشف detectViterbiConflict يتعامل مع بيانات الـ trace مباشرة —
      //  نتأكد فقط أن السياق يشمل disagreements المتاحة)
      if (lineSignals.length > 0) {
        signalsByLine.set(i, lineSignals);
      }
    }

    // ── الخطوة 2: بناء حالات الاشتباه لكل سطر يحمل إشارات ────────────────
    const cases = Array.from(signalsByLine.entries()).map(
      ([lineIndex, signals]) => {
        const classifiedLine = classifiedLines[lineIndex];
        const trace = traces.get(lineIndex);

        // trace مضمون لأننا نخطي السطور التي لا تملكه في الخطوة 1
        if (trace === undefined || classifiedLine === undefined) {
          throw new Error(
            `[SuspicionEngine] trace or classifiedLine missing for lineIndex ${lineIndex}`
          );
        }

        return buildSuspicionCase({
          lineIndex,
          classifiedLine,
          trace,
          signals,
          policy: this.policy,
        });
      }
    );

    // ── الخطوة 3: إنشاء منسّق القرار وتشغيله ─────────────────────────────
    const coordinator = new ResolutionCoordinator([
      localDeterministicResolver,
      localRepairResolver,
      noopResolver,
    ]);

    const actions = coordinator.resolvePreRender(cases);

    // ── الخطوة 4: بناء ملخص التوجيه ──────────────────────────────────────
    const routing: RoutingSummary = coordinator.buildRoutingSummary(
      cases,
      actions
    );

    // suppressor: sequenceOptimization متاح في input للكاشفات عبر traces
    void sequenceOptimization;

    return { cases, routing, actions };
  }
}

/**
 * مصنع المحرك الافتراضي — يُسجّل جميع الكاشفات الـ 15 مع السياسة المحددة.
 *
 * @param profileName - اسم البروفايل (افتراضي: 'balanced-paste')
 */
export function createDefaultSuspicionEngine(
  profileName: WeightPolicyProfile = "balanced-paste"
): SuspicionEngine {
  const policy = createWeightPolicy(profileName);
  return new SuspicionEngine({
    detectors: ALL_DETECTORS,
    policy,
  });
}
