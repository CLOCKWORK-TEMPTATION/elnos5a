/**
 * @module types/final-review
 * @description Command API v2 contract for `POST /api/final-review`
 */

import type { LineType } from "./screenplay";
import type {
  GateBreakEvidence,
  AlternativePullEvidence,
  ContextContradictionEvidence,
  RawCorruptionEvidence,
  MultiPassConflictEvidence,
  SourceRiskEvidence,
  PassStage,
  RepairType,
  FinalDecisionMethod,
  ImportSource,
} from "@/suspicion-engine/types";

export const AGENT_API_VERSION = "2.0" as const;
export const AGENT_API_MODE = "auto-apply" as const;

export type CommandOp = "relabel" | "split";
export type AgentResponseStatus = "applied" | "partial" | "skipped" | "error";

export interface RelabelCommand {
  readonly op: "relabel";
  readonly itemId: string;
  readonly newType: LineType;
  readonly confidence: number;
  readonly reason: string;
}

export interface SplitCommand {
  readonly op: "split";
  readonly itemId: string;
  readonly splitAt: number;
  readonly leftType: LineType;
  readonly rightType: LineType;
  readonly confidence: number;
  readonly reason: string;
}

export type AgentCommand = RelabelCommand | SplitCommand;

export const VALID_COMMAND_OPS = new Set<CommandOp>(["relabel", "split"]);
export const VALID_AGENT_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_top_line",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);

export interface FinalReviewSourceHintsPayload {
  readonly importSource: ImportSource;
  readonly lineQualityScore: number;
  readonly arabicRatio: number;
  readonly weirdCharRatio: number;
  readonly hasStructuralMarkers: boolean;
  readonly pageNumber: number | null;
}

export interface FinalReviewContextLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: LineType;
  readonly offset: number;
}

export interface FinalReviewEvidencePayload {
  readonly gateBreaks: readonly GateBreakEvidence[];
  readonly alternativePulls: readonly AlternativePullEvidence[];
  readonly contextContradictions: readonly ContextContradictionEvidence[];
  readonly rawCorruptionSignals: readonly RawCorruptionEvidence[];
  readonly multiPassConflicts: readonly MultiPassConflictEvidence[];
  readonly sourceRisks: readonly SourceRiskEvidence[];
}

export interface PassVote {
  readonly stage: PassStage;
  readonly suggestedType: LineType;
  readonly confidence: number;
  readonly reasonCode: string;
}

export interface LineRepair {
  readonly repairType: RepairType;
  readonly textBefore: string;
  readonly textAfter: string;
  readonly appliedAt: number;
}

export interface FinalDecision {
  readonly assignedType: LineType;
  readonly confidence: number;
  readonly method: FinalDecisionMethod;
}

export interface FinalReviewTraceSummary {
  readonly passVotes: readonly PassVote[];
  readonly repairs: readonly LineRepair[];
  readonly finalDecision: FinalDecision;
}

export interface SchemaGateRule {
  readonly lineType: string;
  readonly ruleId: string;
  readonly description: string;
}

export interface FinalReviewSchemaHints {
  readonly allowedLineTypes: readonly string[];
  readonly lineTypeDescriptions: Readonly<Record<string, string>>;
  readonly gateRules: readonly SchemaGateRule[];
}

export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS = {
  allowedLineTypes: [
    "action",
    "dialogue",
    "character",
    "scene_header_1",
    "scene_header_2",
    "scene_header_3",
    "transition",
    "parenthetical",
    "basmala",
  ],
  lineTypeDescriptions: {
    action: "وصف الحدث والمشهد",
    dialogue: "نص الحوار المنطوق",
    character: "اسم الشخصية فوق الحوار",
    scene_header_1: "رأس المشهد الرئيسي",
    scene_header_2: "رأس المشهد الفرعي",
    scene_header_3: "وصف زمني أو مكاني للمشهد",
    transition: "انتقال بين المشاهد",
    parenthetical: "توجيه أدائي بين قوسين",
    basmala: "البسملة في بداية المستند",
  },
  gateRules: [],
} as const satisfies FinalReviewSchemaHints;

export interface FinalReviewSuspiciousLinePayload {
  readonly itemId: string;
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: LineType;
  readonly fingerprint: string;
  readonly suspicionScore: number;
  readonly routingBand: "agent-candidate" | "agent-forced";
  readonly critical: boolean;
  readonly primarySuggestedType: LineType | null;
  readonly distinctSignalFamilies: number;
  readonly signalCount: number;
  readonly reasonCodes: readonly string[];
  readonly signalMessages: readonly string[];
  readonly sourceHints: FinalReviewSourceHintsPayload;
  readonly evidence: FinalReviewEvidencePayload;
  readonly trace: FinalReviewTraceSummary;
  readonly contextLines: readonly FinalReviewContextLine[];
}

export interface FinalReviewRequestPayload {
  readonly packetVersion: string;
  readonly schemaVersion: string;
  readonly importOpId: string;
  readonly sessionId: string;
  readonly totalReviewed: number;
  readonly suspiciousLines: readonly FinalReviewSuspiciousLinePayload[];
  readonly requiredItemIds: readonly string[];
  readonly forcedItemIds: readonly string[];
  readonly schemaHints: FinalReviewSchemaHints;
  readonly reviewPacketText?: string;
}

export interface FinalReviewResponseMeta {
  readonly totalInputTokens: number | null;
  readonly totalOutputTokens: number | null;
  readonly retryCount: number;
  readonly resolvedItemIds: readonly string[];
  readonly missingItemIds: readonly string[];
  readonly isMockResponse: boolean;
}

export interface FinalReviewResponsePayload {
  readonly apiVersion: typeof AGENT_API_VERSION;
  readonly mode: typeof AGENT_API_MODE;
  readonly importOpId: string;
  readonly requestId: string;
  readonly status: AgentResponseStatus;
  readonly commands: readonly AgentCommand[];
  readonly message: string;
  readonly latencyMs: number;
  readonly meta?: FinalReviewResponseMeta;
  readonly model?: string;
}

export interface ReviewRoutingStats {
  readonly countPass: number;
  readonly countLocalReview: number;
  readonly countAgentCandidate: number;
  readonly countAgentForced: number;
}

export const ALLOWED_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);
