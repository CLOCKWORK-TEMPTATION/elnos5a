import type {
  ElementType,
  ClassifiedDraft,
} from "@/extensions/classification-types";

export type { ElementType, ClassifiedDraft };

// ─── Literal Types ───

export type SignalFamily =
  | "gate-break"
  | "context"
  | "corruption"
  | "cross-pass"
  | "source";

export type SignalType =
  | "gate-break"
  | "alternative-pull"
  | "context-contradiction"
  | "raw-corruption"
  | "multi-pass-conflict"
  | "source-risk";

export type SuspicionBand =
  | "pass"
  | "local-review"
  | "agent-candidate"
  | "agent-forced";

export type InternalResolutionRoute =
  | "none"
  | "auto-local-fix"
  | "repair-then-reclassify"
  | "local-review"
  | "agent-candidate"
  | "agent-forced";

export type ResolutionStatus =
  | "confirmed"
  | "relabel"
  | "repair-and-reclassify"
  | "deferred";

export type WeightPolicyProfile =
  | "strict-import"
  | "balanced-paste"
  | "ocr-heavy";

export type CircuitBreakerState = "closed" | "open" | "half-open";

export type PassStage =
  | "forward"
  | "retroactive"
  | "reverse"
  | "viterbi"
  | "hybrid"
  | "schema-hint";

export type RepairType = "merge" | "split" | "partial-rewrite" | "encoding-fix";

export type ImportSource =
  | "paste"
  | "pdf"
  | "docx"
  | "fountain"
  | "fdx"
  | "txt"
  | "unknown";

export type FinalDecisionMethod =
  | "unanimous"
  | "majority"
  | "weighted"
  | "viterbi-override"
  | "schema-forced";

export const FAMILY_SIGNAL_TYPES: Record<SignalFamily, readonly SignalType[]> =
  {
    "gate-break": ["gate-break", "alternative-pull"],
    context: ["context-contradiction"],
    corruption: ["raw-corruption"],
    "cross-pass": ["multi-pass-conflict"],
    source: ["source-risk", "alternative-pull"],
  } as const;

// ─── Evidence Discriminated Union ───

export interface GateBreakEvidence {
  readonly signalType: "gate-break";
  readonly brokenGateRule: string;
  readonly expectedPattern: string;
  readonly actualPattern: string;
  readonly gateType: ElementType;
}

export interface AlternativePullEvidence {
  readonly signalType: "alternative-pull";
  readonly suggestedType: ElementType;
  readonly pullStrength: number;
  readonly contributingStages: readonly string[];
  readonly keyPattern: string | null;
}

export interface ContextContradictionEvidence {
  readonly signalType: "context-contradiction";
  readonly contradictionType:
    | "orphan-dialogue"
    | "missing-character-before-dialogue"
    | "scene-header-sequence"
    | "transition-position"
    | "dialogue-block-interrupted";
  readonly expectedPrecedingType: ElementType | null;
  readonly actualPrecedingType: ElementType | null;
  readonly windowSize: number;
}

export interface RawCorruptionEvidence {
  readonly signalType: "raw-corruption";
  readonly corruptionType:
    | "ocr-artifacts"
    | "encoding-errors"
    | "mixed-scripts"
    | "broken-words"
    | "repeated-chars";
  readonly qualityScore: number;
  readonly affectedSegments: readonly string[];
  readonly weirdCharRatio: number;
  readonly arabicRatio: number;
}

export interface MultiPassConflictEvidence {
  readonly signalType: "multi-pass-conflict";
  readonly conflictingVotes: readonly {
    readonly stage: string;
    readonly suggestedType: ElementType;
    readonly confidence: number;
  }[];
  readonly conflictSeverity: "minor" | "moderate" | "severe";
  readonly dominantType: ElementType;
  readonly minorityType: ElementType;
  readonly confidenceDelta: number;
}

export interface SourceRiskEvidence {
  readonly signalType: "source-risk";
  readonly riskType:
    | "pdf-extraction-artifact"
    | "docx-style-mismatch"
    | "fountain-format-ambiguity"
    | "unknown-source";
  readonly sourceCategory: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly affectedFields: readonly string[];
}

export type SuspicionSignalEvidence =
  | GateBreakEvidence
  | AlternativePullEvidence
  | ContextContradictionEvidence
  | RawCorruptionEvidence
  | MultiPassConflictEvidence
  | SourceRiskEvidence;

// ─── Core Entity Interfaces ───

export interface LineQuality {
  readonly score: number;
  readonly arabicRatio: number;
  readonly weirdCharRatio: number;
  readonly hasStructuralMarkers: boolean;
}

export interface SourceHints {
  readonly importSource: ImportSource;
  readonly lineQuality: LineQuality;
  readonly pageNumber: number | null;
}

export interface LineRepair {
  readonly repairType: RepairType;
  readonly textBefore: string;
  readonly textAfter: string;
  readonly appliedAt: number;
  readonly involvedLineIndices: readonly number[];
}

export interface PassVote {
  readonly stage: PassStage;
  readonly suggestedType: ElementType;
  readonly confidence: number;
  readonly reasonCode: string;
  readonly metadata: Record<string, string | number | boolean | null>;
}

export interface FinalDecision {
  readonly assignedType: ElementType;
  readonly confidence: number;
  readonly method: FinalDecisionMethod;
  readonly winningStage: string | null;
}

export interface ClassificationTrace {
  readonly lineIndex: number;
  readonly rawText: string;
  readonly normalizedText: string;
  readonly sourceHints: SourceHints;
  readonly repairs: readonly LineRepair[];
  readonly passVotes: readonly PassVote[];
  readonly finalDecision: FinalDecision;
}

export interface SuspicionSignal {
  readonly signalId: string;
  readonly lineIndex: number;
  readonly family: SignalFamily;
  readonly signalType: SignalType;
  readonly score: number;
  readonly reasonCode: string;
  readonly message: string;
  readonly suggestedType: ElementType | null;
  readonly evidence: SuspicionSignalEvidence;
  readonly debug?: Record<string, string | number | boolean | null>;
}

export interface SignalFamilySummary {
  readonly gateBreak: readonly SuspicionSignal[];
  readonly context: readonly SuspicionSignal[];
  readonly corruption: readonly SuspicionSignal[];
  readonly crossPass: readonly SuspicionSignal[];
  readonly source: readonly SuspicionSignal[];
}

export interface SuspicionCase {
  readonly lineIndex: number;
  readonly classifiedLine: ClassifiedDraft;
  readonly trace: ClassificationTrace;
  readonly signals: readonly SuspicionSignal[];
  readonly summary: SignalFamilySummary;
  readonly score: number;
  readonly band: SuspicionBand;
  readonly critical: boolean;
  readonly primarySuggestedType: ElementType | null;
}

export interface GateFeatures {
  readonly hasColon: boolean;
  readonly lineLength: number;
  readonly startsWithUpperArabic: boolean;
  readonly endsWithColon: boolean;
  readonly matchesCharacterPattern: boolean;
  readonly matchesTransitionPattern: boolean;
  readonly matchesSceneHeaderPattern: boolean;
}

export interface ContextFeatures {
  readonly previousType: ElementType | null;
  readonly nextType: ElementType | null;
  readonly dialogueBlockDepth: number;
  readonly distanceFromLastCharacter: number;
  readonly distanceFromLastSceneHeader: number;
}

export interface RawQualityFeatures {
  readonly arabicRatio: number;
  readonly weirdCharRatio: number;
  readonly qualityScore: number;
  readonly lineLength: number;
  readonly hasEncodingIssues: boolean;
}

export interface CrossPassFeatures {
  readonly totalVotes: number;
  readonly distinctTypes: number;
  readonly agreementRatio: number;
  readonly highestConflictSeverity: "none" | "minor" | "moderate" | "severe";
  readonly dominantType: ElementType | null;
  readonly minorityType: ElementType | null;
}

export interface CompetitionFeatures {
  readonly strongestAlternativeType: ElementType | null;
  readonly pullStrength: number;
  readonly confidenceDelta: number;
  readonly contributingStageCount: number;
}

export interface StabilityFeatures {
  readonly decisionFragility: number;
  readonly repairCount: number;
  readonly wasOverridden: boolean;
  readonly finalConfidence: number;
}

export interface SuspicionFeature {
  readonly lineIndex: number;
  readonly gate: GateFeatures;
  readonly context: ContextFeatures;
  readonly rawQuality: RawQualityFeatures;
  readonly crossPass: CrossPassFeatures;
  readonly competition: CompetitionFeatures;
  readonly stability: StabilityFeatures;
}

// ─── Input / Output Interfaces ───

export interface ContextLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly confidence: number;
}

export interface AIReviewPayload {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly originalConfidence: number;
  readonly suspicionScore: number;
  readonly primarySuggestedType: ElementType | null;
  readonly evidence: {
    readonly gateBreaks: readonly GateBreakEvidence[];
    readonly alternativePulls: readonly AlternativePullEvidence[];
    readonly contextContradictions: readonly ContextContradictionEvidence[];
    readonly rawCorruptionSignals: readonly RawCorruptionEvidence[];
    readonly multiPassConflicts: readonly MultiPassConflictEvidence[];
    readonly sourceRisks: readonly SourceRiskEvidence[];
  };
  readonly contextLines: readonly ContextLine[];
}

export interface AIVerdictResponse {
  readonly suggestedType: ElementType;
  readonly confidence: number;
  readonly reasoning: string;
  readonly actionRequired: "relabel" | "confirm" | "repair-and-reclassify";
}

export interface ResolutionOutcome {
  readonly lineIndex: number;
  readonly status: ResolutionStatus;
  readonly correctedType: ElementType | null;
  readonly confidence: number | null;
  readonly resolverName: string;
  readonly evidenceUsed: readonly string[];
  readonly appliedAt: "pre-render" | "post-render" | null;
}

export interface RoutingSummary {
  readonly total: number;
  readonly pass: number;
  readonly localReview: number;
  readonly agentCandidate: number;
  readonly agentForced: number;
  readonly autoFixedLocally: number;
  readonly repairedAndReclassified: number;
  readonly deferred: number;
}

export interface SuspicionEngineInput {
  readonly classifiedLines: readonly ClassifiedDraft[];
  readonly traces: ReadonlyMap<number, ClassificationTrace>;
  readonly sequenceOptimization: {
    readonly disagreements: readonly {
      readonly lineIndex: number;
      readonly suggestedType: ElementType;
    }[];
  } | null;
  readonly extractionQuality: ReadonlyMap<number, LineQuality> | null;
}

export interface SuspicionEngineOutput {
  readonly cases: readonly SuspicionCase[];
  readonly routing: RoutingSummary;
  readonly actions: readonly ResolutionOutcome[];
}

// ─── Policy Interfaces ───

export interface FamilyWeights {
  readonly gateBreak: number;
  readonly contextContradiction: number;
  readonly rawCorruption: number;
  readonly multiPassConflict: number;
  readonly alternativePull: number;
  readonly sourceRisk: number;
}

export interface BoostFactors {
  readonly diversityBoost: number;
  readonly criticalMismatchBoost: number;
  readonly consensusTypeBoost: number;
}

export interface PenaltyFactors {
  readonly lowConfidencePenalty: number;
  readonly singleFamilyDiscount: number;
}

export interface BandThresholds {
  readonly localReviewMin: number;
  readonly agentCandidateMin: number;
  readonly agentForcedMin: number;
}

export interface SuspicionWeightPolicy {
  readonly profile: WeightPolicyProfile;
  readonly familyWeights: FamilyWeights;
  readonly boostFactors: BoostFactors;
  readonly penaltyFactors: PenaltyFactors;
  readonly bandThresholds: BandThresholds;
}

export interface RemoteAIResolverPolicy {
  readonly requestTimeoutMs: number;
  readonly consecutiveTimeoutThreshold: number;
  readonly circuitOpenDurationMs: number;
  readonly halfOpenProbeLimit: number;
  readonly priorityOrder: readonly SuspicionBand[];
}

// ─── Route Mapping ───

export const INTERNAL_TO_EXTERNAL_BAND: Record<
  InternalResolutionRoute,
  SuspicionBand
> = {
  none: "pass",
  "auto-local-fix": "pass",
  "repair-then-reclassify": "pass",
  "local-review": "local-review",
  "agent-candidate": "agent-candidate",
  "agent-forced": "agent-forced",
};

// ─── Telemetry ───

export type TelemetryEventType =
  | "detect"
  | "aggregate"
  | "route"
  | "resolve"
  | "circuit-state-change";

export interface SuspicionTelemetryEvent {
  readonly eventType: TelemetryEventType;
  readonly lineIndex: number | null;
  readonly band: SuspicionBand | null;
  readonly resolverName: string | null;
  readonly signalCount: number;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly metadata: Record<string, string | number | boolean | null>;
}
