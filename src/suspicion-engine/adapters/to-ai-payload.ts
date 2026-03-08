import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  AIReviewPayload,
  ContextLine,
  GateBreakEvidence,
  AlternativePullEvidence,
  ContextContradictionEvidence,
  RawCorruptionEvidence,
  MultiPassConflictEvidence,
  SourceRiskEvidence,
  SuspicionCase,
  SuspicionSignal,
} from "@/suspicion-engine/types";

/**
 * @module adapters/to-ai-payload
 * @description
 * محوّل حالة الاشتباه إلى حمولة مراجعة AI.
 *
 * يُجمّع الأدلة في 6 مصفوفات مكتوبة بدقة ويستخرج نافذة سياق
 * تشمل الأسطر المحيطة بالسطر المشبوه.
 */

const DEFAULT_WINDOW_SIZE = 3;

function isGateBreakEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: GateBreakEvidence } {
  return signal.evidence.signalType === "gate-break";
}

function isAlternativePullEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: AlternativePullEvidence } {
  return signal.evidence.signalType === "alternative-pull";
}

function isContextContradictionEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: ContextContradictionEvidence } {
  return signal.evidence.signalType === "context-contradiction";
}

function isRawCorruptionEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: RawCorruptionEvidence } {
  return signal.evidence.signalType === "raw-corruption";
}

function isMultiPassConflictEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: MultiPassConflictEvidence } {
  return signal.evidence.signalType === "multi-pass-conflict";
}

function isSourceRiskEvidence(
  signal: SuspicionSignal
): signal is SuspicionSignal & { evidence: SourceRiskEvidence } {
  return signal.evidence.signalType === "source-risk";
}

/**
 * يبني حمولة مراجعة AI من حالة اشتباه وقائمة الأسطر المُصنّفة.
 *
 * @param suspicionCase - حالة الاشتباه المراد إرسالها للمراجعة
 * @param allClassifiedLines - جميع الأسطر المُصنّفة في الوثيقة
 * @param windowSize - عدد الأسطر قبل وبعد السطر المشبوه (افتراضي: 3)
 * @returns حمولة مراجعة AI جاهزة للإرسال
 */
export function buildAIReviewPayload(
  suspicionCase: SuspicionCase,
  allClassifiedLines: readonly ClassifiedDraft[],
  windowSize: number = DEFAULT_WINDOW_SIZE
): AIReviewPayload {
  const { lineIndex, classifiedLine, score, primarySuggestedType, signals } =
    suspicionCase;

  // ── تجميع الأدلة في 6 مصفوفات مكتوبة ────────────────────────────────────

  const gateBreaks: GateBreakEvidence[] = [];
  const alternativePulls: AlternativePullEvidence[] = [];
  const contextContradictions: ContextContradictionEvidence[] = [];
  const rawCorruptionSignals: RawCorruptionEvidence[] = [];
  const multiPassConflicts: MultiPassConflictEvidence[] = [];
  const sourceRisks: SourceRiskEvidence[] = [];

  for (const signal of signals) {
    if (isGateBreakEvidence(signal)) {
      gateBreaks.push(signal.evidence);
    } else if (isAlternativePullEvidence(signal)) {
      alternativePulls.push(signal.evidence);
    } else if (isContextContradictionEvidence(signal)) {
      contextContradictions.push(signal.evidence);
    } else if (isRawCorruptionEvidence(signal)) {
      rawCorruptionSignals.push(signal.evidence);
    } else if (isMultiPassConflictEvidence(signal)) {
      multiPassConflicts.push(signal.evidence);
    } else if (isSourceRiskEvidence(signal)) {
      sourceRisks.push(signal.evidence);
    }
  }

  // ── استخراج نافذة السياق ─────────────────────────────────────────────────

  const contextLines: ContextLine[] = [];
  const startIndex = Math.max(0, lineIndex - windowSize);
  const endIndex = Math.min(
    allClassifiedLines.length - 1,
    lineIndex + windowSize
  );

  for (let i = startIndex; i <= endIndex; i++) {
    if (i === lineIndex) continue;
    const line = allClassifiedLines[i];
    if (line === undefined) continue;

    contextLines.push({
      lineIndex: i,
      text: line.text,
      assignedType: line.type,
      confidence: line.confidence,
    });
  }

  return {
    lineIndex,
    text: classifiedLine.text,
    assignedType: classifiedLine.type,
    originalConfidence: classifiedLine.confidence,
    suspicionScore: score,
    primarySuggestedType,
    evidence: {
      gateBreaks,
      alternativePulls,
      contextContradictions,
      rawCorruptionSignals,
      multiPassConflicts,
      sourceRisks,
    },
    contextLines,
  };
}
