import { bench, describe } from "vitest";
import { createDefaultSuspicionEngine } from "@/suspicion-engine/engine";
import type {
  SuspicionEngineInput,
  ClassificationTrace,
  PassVote,
  FinalDecision,
  SourceHints,
} from "@/suspicion-engine/types";
import type {
  ClassifiedDraft,
  ElementType,
} from "@/extensions/classification-types";
import { resetSignalCounter } from "@/suspicion-engine/helpers";

// ─── Fixture Builder ──────────────────────────────────────────────────────────

function buildFixture(lineCount: number): SuspicionEngineInput {
  const types: ElementType[] = [
    "action",
    "character",
    "dialogue",
    "action",
    "scene_header_1",
  ];

  const lines: ClassifiedDraft[] = [];
  const traces = new Map<number, ClassificationTrace>();

  for (let i = 0; i < lineCount; i++) {
    const type = types[i % types.length] as ElementType;

    lines.push({
      type,
      text: `سطر رقم ${i}`,
      confidence: 80,
      classificationMethod: "context",
    });

    const passVote: PassVote = {
      stage: "forward",
      suggestedType: type,
      confidence: 0.85,
      reasonCode: "context",
      metadata: {},
    };

    const finalDecision: FinalDecision = {
      assignedType: type,
      confidence: 0.85,
      method: "unanimous",
      winningStage: "forward",
    };

    const sourceHints: SourceHints = {
      importSource: "paste",
      lineQuality: {
        score: 0.9,
        arabicRatio: 0.9,
        weirdCharRatio: 0.01,
        hasStructuralMarkers: false,
      },
      pageNumber: null,
    };

    const trace: ClassificationTrace = {
      lineIndex: i,
      rawText: `سطر رقم ${i}`,
      normalizedText: `سطر رقم ${i}`,
      sourceHints,
      repairs: [],
      passVotes: [passVote],
      finalDecision,
    };

    traces.set(i, trace);
  }

  return {
    classifiedLines: lines,
    traces,
    sequenceOptimization: null,
    extractionQuality: null,
  };
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe("SuspicionEngine Benchmark", () => {
  bench("analyze 100 lines", () => {
    resetSignalCounter();
    const engine = createDefaultSuspicionEngine();
    const fixture = buildFixture(100);
    engine.analyze(fixture);
  });

  bench("analyze 300 lines", () => {
    resetSignalCounter();
    const engine = createDefaultSuspicionEngine();
    const fixture = buildFixture(300);
    engine.analyze(fixture);
  });
});
