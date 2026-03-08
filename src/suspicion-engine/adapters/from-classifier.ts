import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  ClassificationTrace,
  PassVote,
  LineRepair,
  SourceHints,
  FinalDecision,
  LineQuality,
  ResolutionOutcome,
} from "@/suspicion-engine/types";
import { createClassificationTrace } from "@/suspicion-engine/trace/classification-trace";

export interface PassVoteLogEntry {
  readonly lineIndex: number;
  readonly vote: PassVote;
}

export interface LineRepairRecord {
  readonly lineIndex: number;
  readonly repair: LineRepair;
}

const DEFAULT_LINE_QUALITY: LineQuality = {
  score: 0.8,
  arabicRatio: 0.9,
  weirdCharRatio: 0.01,
  hasStructuralMarkers: false,
};

const DEFAULT_SOURCE_HINTS: SourceHints = {
  importSource: "paste",
  lineQuality: DEFAULT_LINE_QUALITY,
  pageNumber: null,
};

function deriveFinalDecision(
  draft: ClassifiedDraft,
  votes: readonly PassVote[]
): FinalDecision {
  const winningStage =
    votes.length > 0
      ? votes.reduce(
          (best, v) => (v.confidence > best.confidence ? v : best),
          votes[0]
        ).stage
      : null;

  let method: FinalDecision["method"] = "unanimous";
  if (votes.length > 1) {
    const types = new Set(votes.map((v) => v.suggestedType));
    if (types.size === 1) {
      method = "unanimous";
    } else {
      method = "majority";
    }
  }

  return {
    assignedType: draft.type,
    confidence: draft.confidence,
    method,
    winningStage,
  };
}

export function buildSingleTrace(params: {
  readonly lineIndex: number;
  readonly rawText: string;
  readonly normalizedText: string;
  readonly sourceHints: SourceHints;
  readonly passVotes: readonly PassVote[];
  readonly repairs: readonly LineRepair[];
  readonly finalDecision: FinalDecision;
}): ClassificationTrace {
  return createClassificationTrace(params);
}

/**
 * بناء traces من خريطة TraceCollector مباشرة.
 * يُستخدم في paste-classifier حيث `traceCollector.getAllVotes()` يُعيد
 * `ReadonlyMap<number, readonly PassVote[]>` بدلاً من `PassVoteLogEntry[]`.
 */
export function collectTracesFromMap(
  classified: readonly ClassifiedDraft[],
  voteMap: ReadonlyMap<number, readonly PassVote[]>,
  repairs?: readonly LineRepairRecord[],
  sourceHintsMap?: ReadonlyMap<number, SourceHints>
): ReadonlyMap<number, ClassificationTrace> {
  const repairsByLine = new Map<number, LineRepair[]>();
  if (repairs) {
    for (const entry of repairs) {
      const existing = repairsByLine.get(entry.lineIndex);
      if (existing) {
        existing.push(entry.repair);
      } else {
        repairsByLine.set(entry.lineIndex, [entry.repair]);
      }
    }
  }

  const traces = new Map<number, ClassificationTrace>();

  for (let i = 0; i < classified.length; i++) {
    const draft = classified[i];
    const lineVotes = voteMap.get(i) ?? [];
    const lineRepairs = repairsByLine.get(i) ?? [];
    const hints = sourceHintsMap?.get(i) ?? DEFAULT_SOURCE_HINTS;

    const trace = createClassificationTrace({
      lineIndex: i,
      rawText: draft.text,
      normalizedText: draft.text,
      sourceHints: hints,
      passVotes: lineVotes,
      repairs: lineRepairs,
      finalDecision: deriveFinalDecision(draft, lineVotes),
    });

    traces.set(i, trace);
  }

  return traces;
}

export function collectTraces(
  classified: readonly ClassifiedDraft[],
  passVoteLog: readonly PassVoteLogEntry[],
  repairs?: readonly LineRepairRecord[],
  sourceHintsMap?: ReadonlyMap<number, SourceHints>
): ReadonlyMap<number, ClassificationTrace> {
  const votesByLine = new Map<number, PassVote[]>();
  for (const entry of passVoteLog) {
    const existing = votesByLine.get(entry.lineIndex);
    if (existing) {
      existing.push(entry.vote);
    } else {
      votesByLine.set(entry.lineIndex, [entry.vote]);
    }
  }

  const repairsByLine = new Map<number, LineRepair[]>();
  if (repairs) {
    for (const entry of repairs) {
      const existing = repairsByLine.get(entry.lineIndex);
      if (existing) {
        existing.push(entry.repair);
      } else {
        repairsByLine.set(entry.lineIndex, [entry.repair]);
      }
    }
  }

  const traces = new Map<number, ClassificationTrace>();

  for (let i = 0; i < classified.length; i++) {
    const draft = classified[i];
    const lineVotes = votesByLine.get(i) ?? [];
    const lineRepairs = repairsByLine.get(i) ?? [];
    const hints = sourceHintsMap?.get(i) ?? DEFAULT_SOURCE_HINTS;

    const trace = createClassificationTrace({
      lineIndex: i,
      rawText: draft.text,
      normalizedText: draft.text,
      sourceHints: hints,
      passVotes: lineVotes,
      repairs: lineRepairs,
      finalDecision: deriveFinalDecision(draft, lineVotes),
    });

    traces.set(i, trace);
  }

  return traces;
}

/**
 * تطبيق أفعال ما قبل العرض (pre-render actions) على مصفوفة التصنيف القابلة للتعديل.
 *
 * يُطبّق فقط الأفعال ذات `status === 'relabel'` و `appliedAt === 'pre-render'`
 * ويُحدّث نوع السطر والثقة في المكان مباشرة.
 *
 * @param classified - مصفوفة التصنيف القابلة للتعديل
 * @param actions    - نتائج القرار من منسّق الحل
 * @returns عدد التعديلات المُطبّقة
 */
export function applyPreRenderActions(
  classified: ClassifiedDraft[],
  actions: readonly ResolutionOutcome[]
): number {
  let applied = 0;

  for (const action of actions) {
    if (action.status !== "relabel") continue;
    if (action.appliedAt !== "pre-render") continue;
    if (action.correctedType === null) continue;

    const line = classified[action.lineIndex];
    if (line === undefined) continue;

    // تحديث النوع والثقة في المكان — الكائن mutable بالفعل في هذا السياق
    const mutableLine = line as {
      type: ClassifiedDraft["type"];
      confidence: number;
    };
    mutableLine.type = action.correctedType;

    if (action.confidence !== null) {
      mutableLine.confidence = action.confidence;
    }

    applied++;
  }

  return applied;
}
