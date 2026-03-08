/**
 * @module final-review/payload-builder
 * @description بناء حزمة أدلة المراجعة النهائية من SuspicionCase
 */

import type {
  SuspicionCase,
  SuspicionSignal,
  ClassificationTrace,
  SourceHints,
} from "@/suspicion-engine/types";
import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  FinalReviewSuspiciousLinePayload,
  FinalReviewEvidencePayload,
  FinalReviewTraceSummary,
  FinalReviewSourceHintsPayload,
  FinalReviewContextLine,
  FinalReviewRequestPayload,
} from "@/types/final-review";
import type { LineType } from "@/types/screenplay";
import { REVIEWABLE_AGENT_TYPES } from "@/extensions/paste-classifier-config";

// حجم نافذة السياق (±2 أسطر)
const CONTEXT_WINDOW = 2;

/**
 * بناء حمولة سطر مشبوه واحد للمراجعة النهائية
 */
export function buildFinalReviewSuspiciousLinePayload(params: {
  suspicionCase: SuspicionCase;
  classified: readonly ClassifiedDraft[];
  itemId: string;
  fingerprint: string;
}): FinalReviewSuspiciousLinePayload | null {
  const { suspicionCase, classified, itemId, fingerprint } = params;
  const assignedType = suspicionCase.classifiedLine.type as LineType;

  // لا يُراجع إذا لم يكن النوع قابلاً للمراجعة
  if (!REVIEWABLE_AGENT_TYPES.has(assignedType)) {
    return null;
  }

  // بناء الأدلة
  const evidence = buildEvidence(suspicionCase.signals);

  // بناء ملخص التتبع
  const trace = buildTraceSummary(suspicionCase.trace);

  // بناء تلميحات المصدر
  const sourceHints = buildSourceHints(suspicionCase.trace.sourceHints);

  // بناء الأسطر السياقية
  const contextLines = buildContextLines(suspicionCase.lineIndex, classified);

  // حساب عائلات الإشارات المختلفة
  const signalFamilies = new Set(suspicionCase.signals.map((s) => s.family));

  // تحديد routingBand
  const routingBand: "agent-candidate" | "agent-forced" =
    suspicionCase.band === "agent-forced" ? "agent-forced" : "agent-candidate";

  return {
    itemId,
    lineIndex: suspicionCase.lineIndex,
    text: suspicionCase.classifiedLine.text,
    assignedType,
    fingerprint,
    suspicionScore: suspicionCase.score,
    routingBand,
    critical: suspicionCase.critical,
    primarySuggestedType: suspicionCase.primarySuggestedType as LineType | null,
    distinctSignalFamilies: signalFamilies.size,
    signalCount: suspicionCase.signals.length,
    reasonCodes: suspicionCase.signals.map((s) => s.reasonCode).slice(0, 32),
    signalMessages: suspicionCase.signals.map((s) => s.message).slice(0, 32),
    sourceHints,
    evidence,
    trace,
    contextLines,
  };
}

function buildEvidence(
  signals: readonly SuspicionSignal[]
): FinalReviewEvidencePayload {
  return {
    gateBreaks: signals
      .filter((s) => s.signalType === "gate-break")
      .map(
        (s) => s.evidence as FinalReviewEvidencePayload["gateBreaks"][number]
      ),
    alternativePulls: signals
      .filter((s) => s.signalType === "alternative-pull")
      .map(
        (s) =>
          s.evidence as FinalReviewEvidencePayload["alternativePulls"][number]
      ),
    contextContradictions: signals
      .filter((s) => s.signalType === "context-contradiction")
      .map(
        (s) =>
          s.evidence as FinalReviewEvidencePayload["contextContradictions"][number]
      ),
    rawCorruptionSignals: signals
      .filter((s) => s.signalType === "raw-corruption")
      .map(
        (s) =>
          s.evidence as FinalReviewEvidencePayload["rawCorruptionSignals"][number]
      ),
    multiPassConflicts: signals
      .filter((s) => s.signalType === "multi-pass-conflict")
      .map(
        (s) =>
          s.evidence as FinalReviewEvidencePayload["multiPassConflicts"][number]
      ),
    sourceRisks: signals
      .filter((s) => s.signalType === "source-risk")
      .map(
        (s) => s.evidence as FinalReviewEvidencePayload["sourceRisks"][number]
      ),
  };
}

function buildTraceSummary(
  trace: ClassificationTrace
): FinalReviewTraceSummary {
  return {
    passVotes: trace.passVotes.map((v) => ({
      stage: v.stage,
      suggestedType: v.suggestedType as LineType,
      confidence: v.confidence,
      reasonCode: v.reasonCode,
    })),
    repairs: trace.repairs.map((r) => ({
      repairType: r.repairType,
      textBefore: r.textBefore,
      textAfter: r.textAfter,
      appliedAt: r.appliedAt,
    })),
    finalDecision: {
      assignedType: trace.finalDecision.assignedType as LineType,
      confidence: trace.finalDecision.confidence,
      method: trace.finalDecision.method,
    },
  };
}

function buildSourceHints(hints: SourceHints): FinalReviewSourceHintsPayload {
  return {
    importSource: hints.importSource,
    lineQualityScore: hints.lineQuality.score,
    arabicRatio: hints.lineQuality.arabicRatio,
    weirdCharRatio: hints.lineQuality.weirdCharRatio,
    hasStructuralMarkers: hints.lineQuality.hasStructuralMarkers,
    pageNumber: hints.pageNumber,
  };
}

function buildContextLines(
  targetIndex: number,
  classified: readonly ClassifiedDraft[]
): FinalReviewContextLine[] {
  const result: FinalReviewContextLine[] = [];

  for (let offset = -CONTEXT_WINDOW; offset <= CONTEXT_WINDOW; offset++) {
    if (offset === 0) continue;
    const index = targetIndex + offset;
    if (index < 0 || index >= classified.length) continue;
    const line = classified[index];
    const lineType = line.type as LineType;
    if (!REVIEWABLE_AGENT_TYPES.has(lineType)) continue;
    result.push({
      lineIndex: index,
      text: line.text,
      assignedType: lineType,
      offset,
    });
  }

  return result;
}

/**
 * T014 — تنسيق نص تشخيصي ملخّص للحزمة
 */
export function formatFinalReviewPacketText(
  request: Pick<
    FinalReviewRequestPayload,
    "totalReviewed" | "requiredItemIds" | "forcedItemIds" | "suspiciousLines"
  >
): string {
  const summary = {
    totalReviewed: request.totalReviewed,
    requiredItemIds: request.requiredItemIds,
    forcedItemIds: request.forcedItemIds,
    suspiciousLines: request.suspiciousLines.map((line) => ({
      itemId: line.itemId,
      lineIndex: line.lineIndex,
      assignedType: line.assignedType,
      suspicionScore: line.suspicionScore,
      routingBand: line.routingBand,
      critical: line.critical,
      primarySuggestedType: line.primarySuggestedType,
      reasonCodes: line.reasonCodes,
      signalMessages: line.signalMessages,
    })),
  };
  const text = JSON.stringify(summary, null, 2);
  return text.slice(0, 160_000);
}
