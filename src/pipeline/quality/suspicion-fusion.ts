import { PostClassificationReviewer } from "../../extensions/classification-core";
import type {
  ClassifiedLine,
  SuspiciousLine as ClassificationSuspiciousLine,
  SuspicionRoutingBand,
} from "../../extensions/classification-types";
import {
  type PipelineLineRef,
  type RawValidationResult,
  validateRawScreenplayLines,
} from "./raw-screenplay-validator";

export interface RawSuspiciousLineCandidate {
  readonly lineIndex: number;
  readonly pageIndex?: number;
  readonly pageLineIndex?: number;
  readonly text: string;
  readonly rawValidationScore: number; // 0..100
  readonly reasons: string[];
}

export interface FusedSuspiciousLineCandidate {
  readonly lineIndex: number;
  readonly pageIndex?: number;
  readonly pageLineIndex?: number;
  readonly text: string;
  readonly rawValidationScore: number;
  readonly classificationSuspicionScore: number;
  readonly fusedScore: number;
  readonly routingBand: SuspicionRoutingBand | "ocr-fallback";
  readonly reasons: string[];
  readonly classificationReview?: ClassificationSuspiciousLine;
}

export interface BuildSuspiciousOptions {
  readonly rawThreshold?: number;
  readonly fusedThresholdForOcrFallback?: number;
  readonly classificationOnlyThreshold?: number;
}

function buildRawReasonsByLine(
  raw: RawValidationResult
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const issue of raw.issues) {
    const bucket = map.get(issue.lineIndex) ?? [];
    bucket.push(`${issue.code}: ${issue.reason}`);
    map.set(issue.lineIndex, bucket);
  }
  return map;
}

export function collectRawSuspiciousLines(
  lines: readonly PipelineLineRef[],
  classifiedLines?: readonly ClassifiedLine[],
  rawThreshold = 35
): RawSuspiciousLineCandidate[] {
  const raw = validateRawScreenplayLines(lines, {
    pdfMode: true,
    suspiciousThreshold: rawThreshold,
    classifiedLines,
  });

  const reasonsByLine = buildRawReasonsByLine(raw);
  const refsByLine = new Map<number, PipelineLineRef>();
  for (const ref of lines) {
    refsByLine.set(ref.lineIndex, ref);
  }

  const out: RawSuspiciousLineCandidate[] = [];
  for (const lineIndex of raw.suspiciousLineIndexes) {
    const ref = refsByLine.get(lineIndex);
    if (!ref) continue;
    out.push({
      lineIndex,
      pageIndex: ref.pageIndex,
      pageLineIndex: ref.pageLineIndex,
      text: ref.text,
      rawValidationScore: raw.lineScores.get(lineIndex) ?? 0,
      reasons: reasonsByLine.get(lineIndex) ?? [],
    });
  }

  return out;
}

export function collectClassificationSuspiciousLines(
  classifiedLines: readonly ClassifiedLine[]
): ClassificationSuspiciousLine[] {
  const reviewer = new PostClassificationReviewer();
  const packet = reviewer.review(classifiedLines);
  return [...packet.suspiciousLines];
}

function mapClassificationScore(
  suspicion: ClassificationSuspiciousLine | undefined
): number {
  if (!suspicion) return 0;
  return Math.max(0, Math.min(100, Math.round(suspicion.escalationScore)));
}

function fuseScores(rawScore: number, clsScore: number): number {
  // دمج منحاز قليلًا لصالح مؤشرات النص الخام لأن هدف الملف OCR fallback
  return Math.min(100, Math.round(rawScore * 0.6 + clsScore * 0.4));
}

export function fuseSuspiciousSignals(
  lines: readonly PipelineLineRef[],
  classifiedLines: readonly ClassifiedLine[],
  options: BuildSuspiciousOptions = {}
): FusedSuspiciousLineCandidate[] {
  const rawThreshold = options.rawThreshold ?? 35;
  const fusedThresholdForOcrFallback =
    options.fusedThresholdForOcrFallback ?? 55;
  const classificationOnlyThreshold = options.classificationOnlyThreshold ?? 65;

  const reviewer = new PostClassificationReviewer();
  const rawList = collectRawSuspiciousLines(
    lines,
    classifiedLines,
    rawThreshold
  );
  const clsList = reviewer.review(classifiedLines).suspiciousLines;

  const byRaw = new Map<number, RawSuspiciousLineCandidate>();
  rawList.forEach((item) => byRaw.set(item.lineIndex, item));

  const byCls = new Map<number, ClassificationSuspiciousLine>();
  clsList.forEach((item) => byCls.set(item.line.lineIndex, item));

  const refsByLine = new Map<number, PipelineLineRef>();
  for (const ref of lines) {
    refsByLine.set(ref.lineIndex, ref);
  }

  const unionIndexes = new Set<number>([
    ...Array.from(byRaw.keys()),
    ...Array.from(byCls.keys()),
  ]);

  const fused: FusedSuspiciousLineCandidate[] = [];

  for (const lineIndex of Array.from(unionIndexes).sort((a, b) => a - b)) {
    const ref = refsByLine.get(lineIndex);
    if (!ref) continue;

    const raw = byRaw.get(lineIndex);
    const cls = byCls.get(lineIndex);
    const rawScore = raw?.rawValidationScore ?? 0;
    const clsScore = mapClassificationScore(cls);
    const fusedScore = fuseScores(rawScore, clsScore);

    const reasons = [
      ...(raw?.reasons ?? []),
      ...(cls?.findings.map((f) => `${f.detectorId}: ${f.reason}`) ?? []),
    ];

    let routingBand: FusedSuspiciousLineCandidate["routingBand"] = "pass";

    if (
      rawScore >= fusedThresholdForOcrFallback ||
      fusedScore >= fusedThresholdForOcrFallback
    ) {
      routingBand = "ocr-fallback";
    } else if (cls && clsScore >= classificationOnlyThreshold) {
      routingBand = cls.routingBand;
    } else if (cls) {
      routingBand = "local-review";
    }

    fused.push({
      lineIndex,
      pageIndex: ref.pageIndex,
      pageLineIndex: ref.pageLineIndex,
      text: ref.text,
      rawValidationScore: rawScore,
      classificationSuspicionScore: clsScore,
      fusedScore,
      routingBand,
      reasons,
      classificationReview: cls,
    });
  }

  return fused;
}

export function selectOcrFallbackTargets(
  fused: readonly FusedSuspiciousLineCandidate[],
  maxLines = 200
): FusedSuspiciousLineCandidate[] {
  return fused
    .filter((x) => x.routingBand === "ocr-fallback")
    .sort((a, b) => b.fusedScore - a.fusedScore || a.lineIndex - b.lineIndex)
    .slice(0, maxLines);
}

export function groupOcrTargetsByPage(
  targets: readonly FusedSuspiciousLineCandidate[]
): Map<number, FusedSuspiciousLineCandidate[]> {
  const map = new Map<number, FusedSuspiciousLineCandidate[]>();
  for (const target of targets) {
    if (typeof target.pageIndex !== "number") continue;
    const bucket = map.get(target.pageIndex) ?? [];
    bucket.push(target);
    map.set(target.pageIndex, bucket);
  }
  return map;
}
