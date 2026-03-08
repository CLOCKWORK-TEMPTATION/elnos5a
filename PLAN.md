هذه هي الطبقة الجديدة مكتوبة مباشرة.

هذه البنية تجعل الحسم النهائي يمر عبر SuspicionCase نفسه، لا عبر المراجع القديم، مع الحفاظ على نفس شكل استجابة Command API v2 حتى لا ينكسر التطبيق.

ملف جديد: src/types/final-review.ts

import type {
AlternativePullEvidence,
FinalDecision,
GateBreakEvidence,
ImportSource,
LineQuality,
LineRepair,
MultiPassConflictEvidence,
PassVote,
RawCorruptionEvidence,
SourceRiskEvidence,
ContextContradictionEvidence,
} from "@/suspicion-engine/types";
import type {
AgentCommand,
AgentReviewResponseMeta,
AgentReviewResponsePayload,
} from "./agent-review";
import type { LineType } from "./screenplay";

export const FINAL_REVIEW_PACKET_VERSION =
"suspicion-final-review-v1" as const;
export const FINAL_REVIEW_SCHEMA_VERSION =
"arabic-screenplay-classifier-output-v1" as const;

export type FinalReviewRoutingBand = "agent-candidate" | "agent-forced";

export interface FinalReviewContextLine {
readonly lineIndex: number;
readonly assignedType: LineType;
readonly text: string;
}

export interface FinalReviewEvidencePayload {
readonly gateBreaks: readonly GateBreakEvidence[];
readonly alternativePulls: readonly AlternativePullEvidence[];
readonly contextContradictions: readonly ContextContradictionEvidence[];
readonly rawCorruptionSignals: readonly RawCorruptionEvidence[];
readonly multiPassConflicts: readonly MultiPassConflictEvidence[];
readonly sourceRisks: readonly SourceRiskEvidence[];
}

export interface FinalReviewTraceSummary {
readonly passVotes: readonly PassVote[];
readonly repairs: readonly LineRepair[];
readonly finalDecision: FinalDecision;
}

export interface FinalReviewSourceHintsPayload {
readonly importSource: ImportSource;
readonly lineQuality: LineQuality;
readonly pageNumber: number | null;
}

export interface FinalReviewSchemaHints {
readonly outputFormat: "<ELEMENT> = <VALUE>";
readonly allowedElements: readonly [
"BASMALA",
"SCENE-HEADER-1",
"SCENE-HEADER-2",
"SCENE-HEADER-3",
"ACTION",
"CHARACTER",
"PARENTHETICAL",
"DIALOGUE",
"TRANSITION",
];
readonly hardRules: readonly string[];
readonly sequenceRules: readonly string[];
}

export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS: FinalReviewSchemaHints = {
outputFormat: "<ELEMENT> = <VALUE>",
allowedElements: [
"BASMALA",
"SCENE-HEADER-1",
"SCENE-HEADER-2",
"SCENE-HEADER-3",
"ACTION",
"CHARACTER",
"PARENTHETICAL",
"DIALOGUE",
"TRANSITION",
],
hardRules: [
"BASMALA = بسم الله الرحمن الرحيم حرفيًا عند وجودها فقط وفي أول النص.",
"SCENE-HEADER-1 يطابق نمط: مشهد + رقم.",
"SCENE-HEADER-2 يلتقط الزمن/المكان مثل: ليل - داخلي أو نهار - خارجي كما ورد حرفيًا.",
"SCENE-HEADER-3 هو الوصف التفصيلي للمكان كما ورد حرفيًا.",
"CHARACTER لا يُقبل إلا إذا كان السطر اسمًا صريحًا متبوعًا بنقطتين : ويجب الحفاظ على النقطتين.",
"الأسماء المذكورة داخل ACTION أو DIALOGUE لا تتحول إلى CHARACTER.",
"PARENTHETICAL يكون عادة بين CHARACTER و DIALOGUE ويظهر غالبًا بين قوسين كاملين.",
"DIALOGUE يتبع CHARACTER مباشرة أو PARENTHETICAL التابع له.",
"TRANSITION يكون سطر انتقال مستقلًا مثل: قطع.",
"ACTION هو الملتقط الافتراضي لكل سطر لا تنطبق عليه القواعد السابقة.",
],
sequenceRules: [
"الترتيب النموذجي: BASMALA → SCENE-HEADER-1 → SCENE-HEADER-2 → SCENE-HEADER-3 → ACTION/CHARACTER/DIALOGUE/TRANSITION.",
"بعد CHARACTER يمكن أن يأتي PARENTHETICAL ثم DIALOGUE، أو DIALOGUE مباشرة.",
"استمرار الحوار يتوقف عند ظهور CHARACTER جديد أو TRANSITION أو SCENE-HEADER جديد أو ACTION واضح.",
],
};

export interface FinalReviewSuspiciousLinePayload {
readonly itemId: string;
readonly lineIndex: number;
readonly text: string;
readonly assignedType: LineType;
readonly fingerprint: string;
readonly suspicionScore: number;
readonly routingBand: FinalReviewRoutingBand;
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
readonly packetVersion: typeof FINAL_REVIEW_PACKET_VERSION;
readonly schemaVersion: typeof FINAL_REVIEW_SCHEMA_VERSION;
readonly importOpId: string;
readonly sessionId: string;
readonly totalReviewed: number;
readonly suspiciousLines: readonly FinalReviewSuspiciousLinePayload[];
readonly requiredItemIds: readonly string[];
readonly forcedItemIds: readonly string[];
readonly schemaHints: FinalReviewSchemaHints;
readonly reviewPacketText?: string;
}

export type FinalReviewCommand = AgentCommand;
export type FinalReviewResponsePayload = AgentReviewResponsePayload;
export type FinalReviewResponseMeta = AgentReviewResponseMeta;

ملف جديد: src/final-review/payload-builder.ts

import type { ElementType } from "@/extensions/classification-types";
import { REVIEWABLE_AGENT_TYPES } from "@/extensions/paste-classifier-config";
import type { ClassifiedDraftWithId } from "@/extensions/paste-classifier-helpers";
import type {
AlternativePullEvidence,
ContextContradictionEvidence,
GateBreakEvidence,
MultiPassConflictEvidence,
RawCorruptionEvidence,
SourceRiskEvidence,
SuspicionCase,
} from "@/suspicion-engine/types";
import type {
FinalReviewContextLine,
FinalReviewEvidencePayload,
FinalReviewRequestPayload,
FinalReviewSuspiciousLinePayload,
} from "@/types/final-review";
import type { LineType } from "@/types/screenplay";

const toLineType = (type: ElementType): LineType => type;

const toContextLines = (
classified: readonly ClassifiedDraftWithId[],
targetLineIndex: number,
windowSize = 2
): readonly FinalReviewContextLine[] => {
const start = Math.max(0, targetLineIndex - windowSize);
const end = Math.min(classified.length - 1, targetLineIndex + windowSize);
const context: FinalReviewContextLine[] = [];

for (let index = start; index <= end; index += 1) {
if (index === targetLineIndex) continue;

    const line = classified[index];
    if (!line) continue;

    const assignedType = toLineType(line.type);
    if (!REVIEWABLE_AGENT_TYPES.has(assignedType)) continue;

    context.push({
      lineIndex: index,
      assignedType,
      text: line.text,
    });

}

return context;
};

const uniqueStrings = (values: readonly string[]): string[] =>
[...new Set(values.filter((value) => value.trim().length > 0))];

const countDistinctSignalFamilies = (suspicionCase: SuspicionCase): number =>
new Set(suspicionCase.signals.map((signal) => signal.family)).size;

const buildEvidencePayload = (
suspicionCase: SuspicionCase
): FinalReviewEvidencePayload => ({
gateBreaks: suspicionCase.signals
.filter((signal) => signal.signalType === "gate-break")
.map((signal) => signal.evidence as GateBreakEvidence),
alternativePulls: suspicionCase.signals
.filter((signal) => signal.signalType === "alternative-pull")
.map((signal) => signal.evidence as AlternativePullEvidence),
contextContradictions: suspicionCase.signals
.filter((signal) => signal.signalType === "context-contradiction")
.map((signal) => signal.evidence as ContextContradictionEvidence),
rawCorruptionSignals: suspicionCase.signals
.filter((signal) => signal.signalType === "raw-corruption")
.map((signal) => signal.evidence as RawCorruptionEvidence),
multiPassConflicts: suspicionCase.signals
.filter((signal) => signal.signalType === "multi-pass-conflict")
.map((signal) => signal.evidence as MultiPassConflictEvidence),
sourceRisks: suspicionCase.signals
.filter((signal) => signal.signalType === "source-risk")
.map((signal) => signal.evidence as SourceRiskEvidence),
});

export interface BuildFinalReviewSuspiciousLinePayloadParams {
readonly suspicionCase: SuspicionCase;
readonly classified: readonly ClassifiedDraftWithId[];
readonly itemId: string;
readonly fingerprint: string;
}

export const buildFinalReviewSuspiciousLinePayload = ({
suspicionCase,
classified,
itemId,
fingerprint,
}: BuildFinalReviewSuspiciousLinePayloadParams): FinalReviewSuspiciousLinePayload | null => {
const assignedType = toLineType(suspicionCase.classifiedLine.type);
if (!REVIEWABLE_AGENT_TYPES.has(assignedType)) {
return null;
}

return {
itemId,
lineIndex: suspicionCase.lineIndex,
text: suspicionCase.classifiedLine.text,
assignedType,
fingerprint,
suspicionScore: suspicionCase.score,
routingBand:
suspicionCase.band === "agent-forced"
? "agent-forced"
: "agent-candidate",
critical: suspicionCase.critical,
primarySuggestedType: suspicionCase.primarySuggestedType
? toLineType(suspicionCase.primarySuggestedType)
: null,
distinctSignalFamilies: countDistinctSignalFamilies(suspicionCase),
signalCount: suspicionCase.signals.length,
reasonCodes: uniqueStrings(
suspicionCase.signals.map((signal) => signal.reasonCode)
),
signalMessages: uniqueStrings(
suspicionCase.signals.map((signal) => signal.message)
),
sourceHints: {
importSource: suspicionCase.trace.sourceHints.importSource,
lineQuality: suspicionCase.trace.sourceHints.lineQuality,
pageNumber: suspicionCase.trace.sourceHints.pageNumber,
},
evidence: buildEvidencePayload(suspicionCase),
trace: {
passVotes: suspicionCase.trace.passVotes,
repairs: suspicionCase.trace.repairs,
finalDecision: suspicionCase.trace.finalDecision,
},
contextLines: toContextLines(classified, suspicionCase.lineIndex),
};
};

export const formatFinalReviewPacketText = (
request: Pick<
FinalReviewRequestPayload,
"totalReviewed" | "requiredItemIds" | "forcedItemIds" | "suspiciousLines"

> ): string =>
> JSON.stringify(

    {
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
    },
    null,
    2

);

ملف جديد: server/controllers/final-review-controller.mjs

import { randomUUID } from "crypto";
import {
FinalReviewValidationError,
requestFinalReview,
validateFinalReviewRequestBody,
} from "../final-review.mjs";
import { sendJson, readJsonBody } from "../utils/http-helpers.mjs";

export const handleFinalReview = async (req, res) => {
let importOpId = null;

try {
const rawBody = await readJsonBody(req);
importOpId =
typeof rawBody?.importOpId === "string" ? rawBody.importOpId : null;

    const body = validateFinalReviewRequestBody(rawBody);
    const response = await requestFinalReview(body);

    const httpStatus =
      response.status === "error" &&
      typeof response.providerStatusCode === "number" &&
      response.providerStatusCode >= 400
        ? response.providerStatusCode
        : 200;

    sendJson(res, httpStatus, response);

} catch (error) {
const message = error instanceof Error ? error.message : String(error);
const statusCode =
error instanceof FinalReviewValidationError ? error.statusCode : 500;

    sendJson(res, statusCode, {
      apiVersion: "2.0",
      mode: "auto-apply",
      importOpId: importOpId ?? "unknown",
      requestId: randomUUID(),
      status: "error",
      commands: [],
      message,
      latencyMs: 0,
    });

}
};

ملف جديد: server/final-review.mjs

import { config } from "dotenv";
import axios from "axios";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { resolveAnthropicApiRuntime } from "./provider-api-runtime.mjs";

config();

export const FINAL_REVIEW_API_VERSION = "2.0";
export const FINAL_REVIEW_API_MODE = "auto-apply";

const DEFAULT_MODEL_ID =
(process.env.FINAL_REVIEW_MODEL ||
process.env.ANTHROPIC_REVIEW_MODEL ||
process.env.AGENT_REVIEW_MODEL ||
"claude-haiku-4-5-20251001")
.trim()
.slice(0, 120);

const FALLBACK_MODEL_ID =
(process.env.FINAL_REVIEW_FALLBACK_MODEL ||
process.env.ANTHROPIC_REVIEW_MODEL ||
process.env.AGENT_REVIEW_MODEL ||
DEFAULT_MODEL_ID)
.trim()
.slice(0, 120);

const REVIEW_TEMPERATURE = 0;
const DEFAULT_TIMEOUT_MS = 180_000;
const OVERLOAD_MAX_RETRIES = 3;
const OVERLOAD_BASE_DELAY_MS = 3_000;
const OVERLOAD_BACKOFF_MULTIPLIER = 2;
const BASE_OUTPUT_TOKENS = 1_200;
const TOKENS_PER_SUSPICIOUS_LINE = 1_000;
const PRACTICAL_MAX_OUTPUT = 64_000;
const MIN_ANTHROPIC_API_KEY_LENGTH = 20;
const NON_ANTHROPIC_MODEL_RE =
/^(mistral|pixtral|kimi|moonshot|gpt|o\d|gemini|deepseek|llama|qwen)/iu;

const logger = pino({ name: "final-review" });
let anthropicClientSingleton = null;
let finalReviewModelFallbackWarned = false;

const ALLOWED_LINE_TYPES = new Set([
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

const ALLOWED_ROUTING_BANDS = new Set(["agent-candidate", "agent-forced"]);

const DEFAULT_SCHEMA_HINTS = {
outputFormat: "<ELEMENT> = <VALUE>",
allowedElements: [
"BASMALA",
"SCENE-HEADER-1",
"SCENE-HEADER-2",
"SCENE-HEADER-3",
"ACTION",
"CHARACTER",
"PARENTHETICAL",
"DIALOGUE",
"TRANSITION",
],
hardRules: [
"BASMALA = بسم الله الرحمن الرحيم حرفيًا عند وجودها فقط وفي أول النص.",
"SCENE-HEADER-1 يطابق نمط: مشهد + رقم.",
"SCENE-HEADER-2 يلتقط الزمن/المكان كما ورد حرفيًا مثل ليل - داخلي.",
"SCENE-HEADER-3 هو الوصف التفصيلي للمكان كما ورد حرفيًا.",
"CHARACTER لا يصح إلا إذا كان اسمًا صريحًا متبوعًا بنقطتين : ويجب الحفاظ على النقطتين.",
"الأسماء داخل ACTION أو DIALOGUE لا تتحول إلى CHARACTER.",
"PARENTHETICAL يكون عادة بين CHARACTER و DIALOGUE ويظهر غالبًا بين قوسين كاملين.",
"DIALOGUE يتبع CHARACTER أو PARENTHETICAL التابع له.",
"TRANSITION يكون سطر انتقال مستقلًا مثل قطع.",
"ACTION هو الالتقاط الافتراضي لأي سطر لا تنطبق عليه القواعد السابقة.",
],
sequenceRules: [
"الترتيب النموذجي: BASMALA → SCENE-HEADER-1 → SCENE-HEADER-2 → SCENE-HEADER-3 → ACTION/CHARACTER/DIALOGUE/TRANSITION.",
"بعد CHARACTER يمكن أن يأتي PARENTHETICAL ثم DIALOGUE، أو DIALOGUE مباشرة.",
"استمرار الحوار يتوقف عند ظهور CHARACTER جديد أو TRANSITION أو SCENE-HEADER جديد أو ACTION واضح.",
],
};

const normalizeSceneHeaderDecisionType = (lineType) => {
if (lineType === "scene_header_1" || lineType === "scene_header_2") {
return "scene_header_top_line";
}
return lineType;
};

const isObjectRecord = (value) => typeof value === "object" && value !== null;
const isFiniteNumber = (value) =>
typeof value === "number" && Number.isFinite(value);
const isIntegerNumber = (value) => Number.isInteger(value) && value >= 0;
const isNonEmptyString = (value) =>
typeof value === "string" && value.trim().length > 0;

const normalizeIncomingText = (value, maxLength = 50_000) => {
if (typeof value !== "string") return "";
return value.trim().slice(0, maxLength);
};

const uniqueSortedStrings = (values) =>
[...new Set((values ?? []).filter((value) => isNonEmptyString(value)))].sort();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isOverloadError = (error) => {
if (!error) return false;
const status =
typeof error.status === "number"
? error.status
: typeof error.statusCode === "number"
? error.statusCode
: null;
if (status === 429 || status === 529 || status === 503) return true;
const message = String(error.message || error).toLowerCase();
return message.includes("overloaded") || message.includes("rate_limit");
};

const isOverloadAxiosError = (error) => {
const status = error?.response?.status ?? error?.status;
if (status === 429 || status === 529 || status === 503) return true;
const message = String(error?.message || "").toLowerCase();
return message.includes("overloaded") || message.includes("rate_limit");
};

const resolveFinalReviewRuntime = () => {
const requestedRaw = normalizeIncomingText(
process.env.FINAL_REVIEW_MODEL ??
process.env.ANTHROPIC_REVIEW_MODEL ??
process.env.AGENT_REVIEW_MODEL,
120
);
const apiRuntime = resolveAnthropicApiRuntime(process.env);

if (!requestedRaw) {
return {
provider: "anthropic",
requestedModel: null,
resolvedModel: DEFAULT_MODEL_ID,
fallbackApplied: false,
fallbackReason: null,
baseUrl: apiRuntime.baseUrl,
apiVersion: apiRuntime.apiVersion,
messagesEndpoint: apiRuntime.messagesEndpoint,
};
}

if (/\s/u.test(requestedRaw)) {
return {
provider: "anthropic",
requestedModel: requestedRaw,
resolvedModel: DEFAULT_MODEL_ID,
fallbackApplied: true,
fallbackReason: "invalid-model-whitespace",
baseUrl: apiRuntime.baseUrl,
apiVersion: apiRuntime.apiVersion,
messagesEndpoint: apiRuntime.messagesEndpoint,
};
}

if (NON_ANTHROPIC_MODEL_RE.test(requestedRaw)) {
return {
provider: "anthropic",
requestedModel: requestedRaw,
resolvedModel: DEFAULT_MODEL_ID,
fallbackApplied: true,
fallbackReason: "non-anthropic-model",
baseUrl: apiRuntime.baseUrl,
apiVersion: apiRuntime.apiVersion,
messagesEndpoint: apiRuntime.messagesEndpoint,
};
}

if (!/^claude-/iu.test(requestedRaw)) {
return {
provider: "anthropic",
requestedModel: requestedRaw,
resolvedModel: DEFAULT_MODEL_ID,
fallbackApplied: true,
fallbackReason: "unsupported-model-family",
baseUrl: apiRuntime.baseUrl,
apiVersion: apiRuntime.apiVersion,
messagesEndpoint: apiRuntime.messagesEndpoint,
};
}

return {
provider: "anthropic",
requestedModel: requestedRaw,
resolvedModel: requestedRaw,
fallbackApplied: false,
fallbackReason: null,
baseUrl: apiRuntime.baseUrl,
apiVersion: apiRuntime.apiVersion,
messagesEndpoint: apiRuntime.messagesEndpoint,
};
};

const logFinalReviewModelFallbackOnce = (runtime) => {
if (!runtime.fallbackApplied || finalReviewModelFallbackWarned) return;
finalReviewModelFallbackWarned = true;
logger.warn(
{
requestedModel: runtime.requestedModel,
resolvedModel: runtime.resolvedModel,
fallbackReason: runtime.fallbackReason,
},
"final-review model is not Anthropic-compatible; falling back to default model"
);
};

export class FinalReviewValidationError extends Error {
constructor(message) {
super(message);
this.name = "FinalReviewValidationError";
this.statusCode = 400;
}
}

const normalizeStringList = (value, fieldName, maxItems = 64, maxLength = 512) => {
if (!Array.isArray(value)) {
throw new FinalReviewValidationError(`Invalid ${fieldName}.`);
}
return [...new Set(value.map((entry) => normalizeIncomingText(entry, maxLength)).filter(Boolean))].slice(0, maxItems);
};

const normalizeContextLine = (line, index) => {
if (!isObjectRecord(line)) {
throw new FinalReviewValidationError(`Invalid context line at index ${index}.`);
}

const lineIndex = line.lineIndex;
const assignedType = normalizeIncomingText(line.assignedType, 64);
const text = normalizeIncomingText(line.text, 4_000);

if (!isIntegerNumber(lineIndex)) {
throw new FinalReviewValidationError(`Invalid context lineIndex at index ${index}.`);
}
if (!ALLOWED_LINE_TYPES.has(assignedType)) {
throw new FinalReviewValidationError(`Invalid context assignedType at index ${index}.`);
}
if (!text) {
throw new FinalReviewValidationError(`Empty context text at index ${index}.`);
}

return {
lineIndex,
assignedType,
text,
};
};

const normalizeSourceHints = (sourceHints, index) => {
if (!isObjectRecord(sourceHints)) {
throw new FinalReviewValidationError(`Invalid sourceHints at suspicious line ${index}.`);
}

const importSource = normalizeIncomingText(sourceHints.importSource, 32) || "unknown";
const pageNumber = sourceHints.pageNumber === null ? null : sourceHints.pageNumber;
const lineQuality = isObjectRecord(sourceHints.lineQuality)
? {
score: isFiniteNumber(sourceHints.lineQuality.score)
? sourceHints.lineQuality.score
: 0,
arabicRatio: isFiniteNumber(sourceHints.lineQuality.arabicRatio)
? sourceHints.lineQuality.arabicRatio
: 0,
weirdCharRatio: isFiniteNumber(sourceHints.lineQuality.weirdCharRatio)
? sourceHints.lineQuality.weirdCharRatio
: 0,
hasStructuralMarkers:
typeof sourceHints.lineQuality.hasStructuralMarkers === "boolean"
? sourceHints.lineQuality.hasStructuralMarkers
: false,
}
: {
score: 0,
arabicRatio: 0,
weirdCharRatio: 0,
hasStructuralMarkers: false,
};

if (pageNumber !== null && !isIntegerNumber(pageNumber)) {
throw new FinalReviewValidationError(`Invalid pageNumber at suspicious line ${index}.`);
}

return {
importSource,
pageNumber,
lineQuality,
};
};

const normalizeEvidenceSection = (value, fieldName, index) => {
if (!Array.isArray(value)) {
throw new FinalReviewValidationError(
`Invalid evidence field ${fieldName} at suspicious line ${index}.`
);
}
return value.filter((entry) => isObjectRecord(entry));
};

const normalizeTrace = (trace, index) => {
if (!isObjectRecord(trace)) {
throw new FinalReviewValidationError(`Invalid trace at suspicious line ${index}.`);
}

const passVotes = Array.isArray(trace.passVotes)
? trace.passVotes.filter((entry) => isObjectRecord(entry))
: [];
const repairs = Array.isArray(trace.repairs)
? trace.repairs.filter((entry) => isObjectRecord(entry))
: [];
const finalDecision = isObjectRecord(trace.finalDecision)
? {
assignedType: normalizeIncomingText(trace.finalDecision.assignedType, 64),
confidence: isFiniteNumber(trace.finalDecision.confidence)
? trace.finalDecision.confidence
: 0,
method: normalizeIncomingText(trace.finalDecision.method, 64),
winningStage:
trace.finalDecision.winningStage === null
? null
: normalizeIncomingText(trace.finalDecision.winningStage, 64) || null,
}
: {
assignedType: "action",
confidence: 0,
method: "weighted",
winningStage: null,
};

return {
passVotes,
repairs,
finalDecision,
};
};

const normalizeSuspiciousLine = (entry, index) => {
if (!isObjectRecord(entry)) {
throw new FinalReviewValidationError(
`Invalid suspicious line payload at index ${index}.`
);
}

const itemId = normalizeIncomingText(entry.itemId, 120);
const lineIndex = entry.lineIndex;
const text = normalizeIncomingText(entry.text, 8_000);
const assignedType = normalizeIncomingText(entry.assignedType, 64);
const fingerprint = normalizeIncomingText(entry.fingerprint, 256);
const suspicionScore = entry.suspicionScore;
const routingBand = normalizeIncomingText(entry.routingBand, 32);
const critical = typeof entry.critical === "boolean" ? entry.critical : false;
const primarySuggestedType = entry.primarySuggestedType === null
? null
: normalizeIncomingText(entry.primarySuggestedType, 64) || null;
const distinctSignalFamilies = entry.distinctSignalFamilies;
const signalCount = entry.signalCount;
const reasonCodes = Array.isArray(entry.reasonCodes)
? entry.reasonCodes.filter((value) => isNonEmptyString(value)).slice(0, 32)
: [];
const signalMessages = Array.isArray(entry.signalMessages)
? entry.signalMessages.filter((value) => isNonEmptyString(value)).slice(0, 32)
: [];
const contextLines = Array.isArray(entry.contextLines)
? entry.contextLines.map((line, ctxIndex) => normalizeContextLine(line, ctxIndex))
: [];
const sourceHints = normalizeSourceHints(entry.sourceHints, index);

if (!itemId) {
throw new FinalReviewValidationError(`Invalid itemId at suspicious line ${index}.`);
}
if (!isIntegerNumber(lineIndex)) {
throw new FinalReviewValidationError(`Invalid lineIndex at suspicious line ${index}.`);
}
if (!text) {
throw new FinalReviewValidationError(`Empty text at suspicious line ${index}.`);
}
if (!ALLOWED_LINE_TYPES.has(assignedType)) {
throw new FinalReviewValidationError(`Invalid assignedType at suspicious line ${index}.`);
}
if (!fingerprint) {
throw new FinalReviewValidationError(`Missing fingerprint at suspicious line ${index}.`);
}
if (!isFiniteNumber(suspicionScore) || suspicionScore < 0 || suspicionScore > 100) {
throw new FinalReviewValidationError(`Invalid suspicionScore at suspicious line ${index}.`);
}
if (!ALLOWED_ROUTING_BANDS.has(routingBand)) {
throw new FinalReviewValidationError(`Invalid routingBand at suspicious line ${index}.`);
}
if (
!isIntegerNumber(distinctSignalFamilies) ||
!isIntegerNumber(signalCount)
) {
throw new FinalReviewValidationError(
`Invalid signal counters at suspicious line ${index}.`
);
}
if (primarySuggestedType !== null && !ALLOWED_LINE_TYPES.has(primarySuggestedType)) {
throw new FinalReviewValidationError(
`Invalid primarySuggestedType at suspicious line ${index}.`
);
}

const evidence = isObjectRecord(entry.evidence)
? {
gateBreaks: normalizeEvidenceSection(entry.evidence.gateBreaks, "gateBreaks", index),
alternativePulls: normalizeEvidenceSection(
entry.evidence.alternativePulls,
"alternativePulls",
index
),
contextContradictions: normalizeEvidenceSection(
entry.evidence.contextContradictions,
"contextContradictions",
index
),
rawCorruptionSignals: normalizeEvidenceSection(
entry.evidence.rawCorruptionSignals,
"rawCorruptionSignals",
index
),
multiPassConflicts: normalizeEvidenceSection(
entry.evidence.multiPassConflicts,
"multiPassConflicts",
index
),
sourceRisks: normalizeEvidenceSection(entry.evidence.sourceRisks, "sourceRisks", index),
}
: {
gateBreaks: [],
alternativePulls: [],
contextContradictions: [],
rawCorruptionSignals: [],
multiPassConflicts: [],
sourceRisks: [],
};

return {
itemId,
lineIndex,
text,
assignedType,
fingerprint,
suspicionScore,
routingBand,
critical,
primarySuggestedType,
distinctSignalFamilies,
signalCount,
reasonCodes,
signalMessages,
sourceHints,
evidence,
trace: normalizeTrace(entry.trace, index),
contextLines,
};
};

const normalizeSchemaHints = (value) => {
if (!isObjectRecord(value)) return DEFAULT_SCHEMA_HINTS;

const outputFormat = normalizeIncomingText(value.outputFormat, 64);
const allowedElements = Array.isArray(value.allowedElements)
? value.allowedElements.filter((entry) => isNonEmptyString(entry)).slice(0, 16)
: DEFAULT_SCHEMA_HINTS.allowedElements;
const hardRules = Array.isArray(value.hardRules)
? value.hardRules.filter((entry) => isNonEmptyString(entry)).slice(0, 64)
: DEFAULT_SCHEMA_HINTS.hardRules;
const sequenceRules = Array.isArray(value.sequenceRules)
? value.sequenceRules.filter((entry) => isNonEmptyString(entry)).slice(0, 64)
: DEFAULT_SCHEMA_HINTS.sequenceRules;

return {
outputFormat: outputFormat || DEFAULT_SCHEMA_HINTS.outputFormat,
allowedElements:
allowedElements.length > 0 ? allowedElements : DEFAULT_SCHEMA_HINTS.allowedElements,
hardRules: hardRules.length > 0 ? hardRules : DEFAULT_SCHEMA_HINTS.hardRules,
sequenceRules:
sequenceRules.length > 0 ? sequenceRules : DEFAULT_SCHEMA_HINTS.sequenceRules,
};
};

export const validateFinalReviewRequestBody = (rawBody) => {
if (!isObjectRecord(rawBody)) {
throw new FinalReviewValidationError("Invalid final-review request body.");
}

const packetVersion = normalizeIncomingText(rawBody.packetVersion, 64);
const schemaVersion = normalizeIncomingText(rawBody.schemaVersion, 64);
const sessionId = normalizeIncomingText(rawBody.sessionId, 120);
const importOpId = normalizeIncomingText(rawBody.importOpId, 120);
const totalReviewed = rawBody.totalReviewed;
const suspiciousLines = Array.isArray(rawBody.suspiciousLines)
? rawBody.suspiciousLines
: null;
const reviewPacketText = normalizeIncomingText(rawBody.reviewPacketText, 160_000);

if (!packetVersion) {
throw new FinalReviewValidationError("Missing packetVersion in final-review request.");
}
if (!schemaVersion) {
throw new FinalReviewValidationError("Missing schemaVersion in final-review request.");
}
if (!sessionId) {
throw new FinalReviewValidationError("Missing sessionId in final-review request.");
}
if (!importOpId) {
throw new FinalReviewValidationError("Missing importOpId in final-review request.");
}
if (!isIntegerNumber(totalReviewed)) {
throw new FinalReviewValidationError("Invalid totalReviewed in final-review request.");
}
if (!Array.isArray(suspiciousLines)) {
throw new FinalReviewValidationError(
"Invalid suspiciousLines in final-review request."
);
}

const normalizedSuspiciousLines = suspiciousLines.map((entry, index) =>
normalizeSuspiciousLine(entry, index)
);
const suspiciousIdsSet = new Set(
normalizedSuspiciousLines.map((line) => line.itemId)
);

const defaultRequired = [...suspiciousIdsSet];
const defaultForced = normalizedSuspiciousLines
.filter((line) => line.routingBand === "agent-forced")
.map((line) => line.itemId);

const requiredItemIds = rawBody.requiredItemIds
? normalizeStringList(rawBody.requiredItemIds, "requiredItemIds")
: defaultRequired;
const forcedItemIds = rawBody.forcedItemIds
? normalizeStringList(rawBody.forcedItemIds, "forcedItemIds")
: uniqueSortedStrings(defaultForced);

for (const itemId of requiredItemIds) {
if (!suspiciousIdsSet.has(itemId)) {
throw new FinalReviewValidationError(
`requiredItemIds contains unknown itemId: ${itemId}.`
);
}
}

for (const itemId of forcedItemIds) {
if (!suspiciousIdsSet.has(itemId)) {
throw new FinalReviewValidationError(
`forcedItemIds contains unknown itemId: ${itemId}.`
);
}
if (!requiredItemIds.includes(itemId)) {
throw new FinalReviewValidationError(
`forcedItemIds must be subset of requiredItemIds: ${itemId}.`
);
}
}

return {
packetVersion,
schemaVersion,
sessionId,
importOpId,
totalReviewed,
reviewPacketText: reviewPacketText || undefined,
suspiciousLines: normalizedSuspiciousLines,
requiredItemIds,
forcedItemIds,
schemaHints: normalizeSchemaHints(rawBody.schemaHints),
};
};

export const validateAnthropicApiKey = (value) => {
const apiKey = normalizeIncomingText(value, 512);
if (!apiKey) {
return {
valid: false,
message: "ANTHROPIC_API_KEY غير موجود في متغيرات البيئة.",
};
}
if (/\s/.test(apiKey)) {
return {
valid: false,
message: "ANTHROPIC_API_KEY يحتوي على مسافات غير صالحة.",
};
}
if (!apiKey.startsWith("sk-ant-")) {
return {
valid: false,
message: "صيغة ANTHROPIC_API_KEY غير صحيحة (يجب أن تبدأ بـ sk-ant-).",
};
}
if (apiKey.length < MIN_ANTHROPIC_API_KEY_LENGTH) {
return {
valid: false,
message: "ANTHROPIC_API_KEY قصير بشكل غير صالح.",
};
}
return {
valid: true,
apiKey,
};
};

const getAnthropicClient = () => {
if (anthropicClientSingleton) return anthropicClientSingleton;

const keyValidation = validateAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
if (!keyValidation.valid) {
throw new Error(keyValidation.message);
}

const runtime = resolveFinalReviewRuntime();
anthropicClientSingleton = new Anthropic({
apiKey: keyValidation.apiKey,
baseURL: runtime.baseUrl,
maxRetries: 0,
timeout: DEFAULT_TIMEOUT_MS,
});
return anthropicClientSingleton;
};

const extractTextFromAnthropicBlocks = (content) => {
const chunks = [];
for (const block of content ?? []) {
if (block?.type === "text" && typeof block.text === "string") {
chunks.push(block.text);
}
}
return chunks.join("");
};

const tryCreateMessageWithSdk = async (params) => {
const client = getAnthropicClient();
return client.messages.create(params);
};

const resolveProviderErrorInfo = (error) => {
if (!(error instanceof Error)) {
return {
message: String(error),
requestId: null,
status: null,
};
}

const asRecord = error;
const nestedError = isObjectRecord(asRecord.error) ? asRecord.error : null;
const nestedResponseError = nestedError && isObjectRecord(nestedError.error)
? nestedError.error
: null;

const providerMessage =
(nestedResponseError && normalizeIncomingText(nestedResponseError.message)) ||
(nestedError && normalizeIncomingText(nestedError.message)) ||
normalizeIncomingText(error.message);
const requestId =
(nestedError && normalizeIncomingText(nestedError.request_id, 128)) ||
normalizeIncomingText(asRecord.requestID, 128) ||
null;
const status =
typeof asRecord.status === "number" && Number.isFinite(asRecord.status)
? asRecord.status
: null;

return {
message: providerMessage || "Provider error",
requestId,
status,
};
};

const FINAL_REVIEW_SYSTEM_PROMPT = `
أنت طبقة المراجعة النهائية الكبرى لنظام تصنيف عناصر السيناريو العربي.

مهمتك ليست إعادة التصنيف من الصفر، بل حسم الحالات التي صعدتها طبقة الشك فقط.
يجب أن تجمع بين ثلاثة أشياء في الوقت نفسه:

1. قواعد schema النهائية لعناصر السيناريو العربي.
2. إشارات طبقة الشك المهيكلة: evidence + trace + routing + score.
3. السياق النصي المحلي المحيط بكل سطر.

المسموح لك فقط إرجاع أوامر JSON بصيغة Command API v2:

- relabel
- split

قواعد القرار الإلزامية:

- إذا كان التصنيف الحالي صحيحًا، أرجع relabel بنفس assignedType.
- لا تُنشئ أنواعًا خارج القائمة المسموحة.
- لا تُرجع أي itemId غير موجود في requiredItemIds.
- يجب أن تُرجع أمرًا واحدًا على الأقل لكل itemId في requiredItemIds.
- أي itemId داخل forcedItemIds يجب أن يحسم بأمر صريح.
- splitAt هو UTF-16 code-unit index.
- لا تستخدم leftText أو rightText.
- أخرج JSON فقط ولا تكتب أي شرح خارجه.

قواعد schema الحرجة:

- CHARACTER لا يصح إلا إذا كان السطر اسمًا صريحًا متبوعًا بنقطتين :.
- الأسماء داخل ACTION أو DIALOGUE لا تتحول إلى CHARACTER.
- PARENTHETICAL يظهر غالبًا بين CHARACTER و DIALOGUE ويكون بين قوسين كاملين.
- DIALOGUE يتبع CHARACTER أو PARENTHETICAL التابع له.
- SCENE-HEADER-1 يطابق مشهد + رقم.
- SCENE-HEADER-2 يلتقط الزمن/المكان كما ورد حرفيًا.
- SCENE-HEADER-3 هو الوصف التفصيلي للمكان كما ورد حرفيًا.
- ACTION هو الالتقاط الافتراضي لأي سطر لا تنطبق عليه القواعد السابقة.
- إذا تعارضت إشارات الشك مع القاعدة الصارمة للـ schema، قدّم القاعدة الصارمة.

كيفية استخدام evidence:

- gateBreaks تعني أن السطر خالف بوابة نوعه الحالي.
- alternativePulls تعني أن نوعًا آخر يسحب السطر نحوه.
- contextContradictions تعني أن التسلسل أو السياق ضد النوع الحالي.
- rawCorruptionSignals تعني أن السطر قد يكون متضررًا من OCR/encoding/wrapping.
- multiPassConflicts تعني أن الممرات المختلفة لم تتفق.
- sourceRisks تعني أن مصدر الإدخال نفسه منخفض الوثوقية.

قاعدة الترجيح:

- أعط وزناً أعلى لـ gateBreaks + contextContradictions + hardRules.
- بعد ذلك راجع passVotes و finalDecision و الإصلاحات السابقة.
- إذا كانت الأدلة ضعيفة ومتوازنة، ثبّت النوع الحالي بأمر relabel بنفس النوع.

صيغة الخرج الإلزامية:
{
"commands": [
{
"op": "relabel",
"itemId": "...",
"newType": "action",
"confidence": 0.97,
"reason": "سبب قصير بالعربية"
}
]
}
`;

const buildReviewUserPrompt = (request) => {
const payload = {
packetVersion: request.packetVersion,
schemaVersion: request.schemaVersion,
totalReviewed: request.totalReviewed,
requiredItemIds: request.requiredItemIds,
forcedItemIds: request.forcedItemIds,
schemaHints: request.schemaHints,
suspiciousLines: request.suspiciousLines,
};

const packetDebugText = request.reviewPacketText
? `\n\nملخص تشخيصي للحزمة:\n${request.reviewPacketText}`
: "";

return `
راجع عناصر final-review التالية. لكل itemId:

- افهم assignedType الحالي
- افحص evidence المهيكل كاملاً
- افحص trace.passVotes و trace.repairs و trace.finalDecision
- افحص contextLines
- طبّق schemaHints وقواعد العناصر الصارمة
- احسم القرار النهائي بأمر JSON واحد على الأقل لكل itemId مطلوب

${JSON.stringify(payload, null, 2)}${packetDebugText}
`.trim();
};

const clampConfidence = (value) => {
if (!Number.isFinite(value)) return 0.5;
if (value < 0) return 0;
if (value > 1) return 1;
return value;
};

export const parseFinalReviewCommands = (rawText) => {
const source = rawText.trim();
if (!source) return [];

const parseCandidate = (candidate) => {
const parsed = JSON.parse(candidate);
const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
const normalized = [];

    for (const command of commands) {
      if (!command || typeof command !== "object") continue;

      const op = typeof command.op === "string" ? command.op.trim() : "";
      const itemId =
        typeof command.itemId === "string" ? command.itemId.trim() : "";
      const reasonRaw =
        typeof command.reason === "string"
          ? command.reason.trim()
          : "أمر بدون سبب مفصل";
      const confidenceRaw =
        typeof command.confidence === "number" ? command.confidence : 0.5;

      if (!itemId) continue;
      if (!["relabel", "split"].includes(op)) continue;

      const baseCommand = {
        op,
        itemId,
        confidence: clampConfidence(confidenceRaw),
        reason: reasonRaw,
      };

      if (op === "relabel") {
        const newType =
          typeof command.newType === "string" ? command.newType.trim() : "";
        if (!newType || !ALLOWED_LINE_TYPES.has(newType)) continue;
        normalized.push({
          ...baseCommand,
          newType: normalizeSceneHeaderDecisionType(newType),
        });
        continue;
      }

      const splitAt =
        typeof command.splitAt === "number" ? Math.trunc(command.splitAt) : -1;
      const leftType =
        typeof command.leftType === "string" ? command.leftType.trim() : "";
      const rightType =
        typeof command.rightType === "string" ? command.rightType.trim() : "";

      if (splitAt < 0) continue;
      if (!leftType || !ALLOWED_LINE_TYPES.has(leftType)) continue;
      if (!rightType || !ALLOWED_LINE_TYPES.has(rightType)) continue;

      normalized.push({
        ...baseCommand,
        splitAt,
        leftType: normalizeSceneHeaderDecisionType(leftType),
        rightType: normalizeSceneHeaderDecisionType(rightType),
      });
    }

    return normalized;

};

try {
return parseCandidate(source);
} catch {
const start = source.indexOf("{");
const end = source.lastIndexOf("}");
if (start === -1 || end === -1 || end <= start) return [];

    try {
      return parseCandidate(source.slice(start, end + 1));
    } catch {
      return [];
    }

}
};

const normalizeCommandsAgainstRequest = (request, rawCommands) => {
const allowedIds = new Set(request.suspiciousLines.map((line) => line.itemId));
const bestByItemId = new Map();

for (const command of rawCommands) {
if (!allowedIds.has(command.itemId)) continue;
const existing = bestByItemId.get(command.itemId);
if (!existing || command.confidence >= existing.confidence) {
bestByItemId.set(command.itemId, command);
}
}

return Array.from(bestByItemId.values()).sort((a, b) =>
a.itemId.localeCompare(b.itemId)
);
};

const buildReviewCoverageMeta = (request, commands) => {
const commandByItemId = new Map(commands.map((command) => [command.itemId, command]));
const requiredItemIds = uniqueSortedStrings(request.requiredItemIds);
const forcedItemIds = uniqueSortedStrings(request.forcedItemIds);

const missingItemIds = requiredItemIds.filter(
(itemId) => !commandByItemId.has(itemId)
);
const unresolvedForcedItemIds = forcedItemIds.filter(
(itemId) => !commandByItemId.has(itemId)
);

return {
requestedCount: requiredItemIds.length,
commandCount: commands.length,
missingItemIds,
forcedItemIds,
unresolvedForcedItemIds,
};
};

const createReviewResponseWithCoverage = (
request,
commands,
startedAt,
defaultAppliedMessage,
requestId,
modelId
) => {
const normalizedCommands = normalizeCommandsAgainstRequest(request, commands);
const meta = buildReviewCoverageMeta(request, normalizedCommands);
const latencyMs = Date.now() - startedAt;

if (meta.unresolvedForcedItemIds.length > 0) {
return {
status: "error",
model: modelId,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: normalizedCommands,
message:
"تعذر حسم عناصر forced المطلوبة: " +
meta.unresolvedForcedItemIds.join(", "),
latencyMs,
meta,
};
}

if (meta.missingItemIds.length > 0) {
return {
status: "partial",
model: modelId,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: normalizedCommands,
message:
"المراجعة النهائية لم تُرجع أوامر كاملة لكل requiredItemIds: " +
meta.missingItemIds.join(", "),
latencyMs,
meta,
};
}

if (normalizedCommands.length === 0) {
return {
status: "skipped",
model: modelId,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: [],
message: "المراجعة النهائية لم تُرجع أوامر قابلة للتطبيق.",
latencyMs,
meta,
};
}

return {
status: "applied",
model: modelId,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: normalizedCommands,
message: defaultAppliedMessage,
latencyMs,
meta,
};
};

const resolveFinalReviewMockMode = () => {
const value = normalizeIncomingText(process.env.FINAL_REVIEW_MOCK_MODE, 32)
.toLowerCase()
.trim();
if (value === "success" || value === "error") return value;
return null;
};

const buildMockReviewCommands = (request) => {
const forcedIds = new Set(request.forcedItemIds);

return request.requiredItemIds
.map((itemId) => {
const sourceLine = request.suspiciousLines.find((line) => line.itemId === itemId);
if (!sourceLine) return null;

      const newType = forcedIds.has(itemId) && sourceLine.primarySuggestedType
        ? sourceLine.primarySuggestedType
        : sourceLine.assignedType;

      return {
        op: "relabel",
        itemId,
        newType,
        confidence: 0.99,
        reason: "أمر محاكاة لاختبارات التكامل وE2E للمراجعة النهائية.",
      };
    })
    .filter((command) => command !== null);

};

const tryCallAnthropicOnce = async (params, reviewRuntime, anthropicApiKey) => {
try {
const message = await tryCreateMessageWithSdk(params);
return {
source: "sdk",
content: message.content,
stopReason: message.stop_reason ?? null,
};
} catch (sdkError) {
logger.warn({ err: sdkError }, "فشل SDK في final-review، تجربة REST fallback");
const response = await axios.post(reviewRuntime.messagesEndpoint, params, {
headers: {
"Content-Type": "application/json",
"x-api-key": anthropicApiKey,
"anthropic-version": reviewRuntime.apiVersion,
},
timeout: DEFAULT_TIMEOUT_MS,
});
return {
source: "rest",
content: Array.isArray(response?.data?.content) ? response.data.content : [],
stopReason:
typeof response?.data?.stop_reason === "string"
? response.data.stop_reason
: null,
};
}
};

export const buildFinalReviewMessageParams = (request, maxTokens, modelId) => ({
model: isNonEmptyString(modelId)
? modelId.trim()
: resolveFinalReviewRuntime().resolvedModel,
max_tokens: maxTokens,
temperature: REVIEW_TEMPERATURE,
system: FINAL_REVIEW_SYSTEM_PROMPT,
messages: [
{
role: "user",
content: buildReviewUserPrompt(request),
},
],
});

export const requestFinalReview = async (request) => {
const startedAt = Date.now();
const requestId = randomUUID();
const emptyMeta = buildReviewCoverageMeta(request, []);
const mockMode = resolveFinalReviewMockMode();
const reviewRuntime = resolveFinalReviewRuntime();
const reviewModel = reviewRuntime.resolvedModel;
logFinalReviewModelFallbackOnce(reviewRuntime);

if (mockMode === "error") {
return {
status: "error",
model: reviewModel,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: [],
message: "FINAL_REVIEW_MOCK_MODE=error",
latencyMs: Date.now() - startedAt,
meta: emptyMeta,
};
}

if (mockMode === "success") {
const commands = buildMockReviewCommands(request);
return createReviewResponseWithCoverage(
request,
commands,
startedAt,
`تمت محاكاة ${commands.length} أمر للمراجعة النهائية.`,
requestId,
reviewModel
);
}

const keyValidation = validateAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
if (!keyValidation.valid) {
const hasUnresolvedForced = emptyMeta.unresolvedForcedItemIds.length > 0;
return {
status: hasUnresolvedForced ? "error" : "partial",
model: reviewModel,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: [],
message: `${keyValidation.message} لا يمكن تشغيل المراجعة النهائية.`,
latencyMs: Date.now() - startedAt,
meta: emptyMeta,
};
}
const anthropicApiKey = keyValidation.apiKey;

if (!Array.isArray(request.suspiciousLines) || request.suspiciousLines.length === 0) {
return {
status: "skipped",
model: reviewModel,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: [],
message: "لا توجد حالات final-review لإرسالها.",
latencyMs: Date.now() - startedAt,
meta: emptyMeta,
};
}

const computeMaxTokens = (boostFactor = 1) =>
Math.min(
PRACTICAL*MAX_OUTPUT,
Math.max(
1600,
Math.ceil(
(BASE_OUTPUT_TOKENS +
request.suspiciousLines.length * TOKENS*PER_SUSPICIOUS_LINE) *
boostFactor
)
)
);

let maxTokens = computeMaxTokens(1);
const modelsToTry = [reviewModel];
if (FALLBACK_MODEL_ID && FALLBACK_MODEL_ID !== reviewModel) {
modelsToTry.push(FALLBACK_MODEL_ID);
}

let lastError = null;
let lastProviderStatus = null;

for (const currentModel of modelsToTry) {
const isFallback = currentModel !== reviewModel;

    for (let attempt = 1; attempt <= OVERLOAD_MAX_RETRIES; attempt += 1) {
      const params = buildFinalReviewMessageParams(
        request,
        maxTokens,
        currentModel
      );

      try {
        const result = await tryCallAnthropicOnce(
          params,
          reviewRuntime,
          anthropicApiKey
        );
        const text = extractTextFromAnthropicBlocks(result.content);
        const commands = parseFinalReviewCommands(text);

        if (
          result.stopReason === "max_tokens" &&
          commands.length === 0 &&
          attempt < OVERLOAD_MAX_RETRIES
        ) {
          const boostedBudget = computeMaxTokens(2);
          logger.warn(
            {
              model: currentModel,
              attempt,
              stopReason: result.stopReason,
              previousMaxTokens: maxTokens,
              boostedMaxTokens: boostedBudget,
            },
            "الاستجابة اقتُطعت في final-review بدون أوامر — إعادة المحاولة بميزانية أعلى"
          );
          maxTokens = boostedBudget;
          continue;
        }

        const suffix = isFallback ? " (fallback model)" : "";
        const sourceLabel = result.source === "rest" ? " (REST)" : "";

        return createReviewResponseWithCoverage(
          request,
          commands,
          startedAt,
          `تم استلام ${commands.length} أمر من final-review${sourceLabel}${suffix}.`,
          requestId,
          currentModel
        );
      } catch (error) {
        lastError = error;
        const overload = isOverloadError(error) || isOverloadAxiosError(error);
        const providerInfo = resolveProviderErrorInfo(error);
        lastProviderStatus = providerInfo.status;

        logger.warn(
          {
            model: currentModel,
            attempt,
            maxAttempts: OVERLOAD_MAX_RETRIES,
            overload,
            isFallback,
            status: providerInfo.status,
            message: providerInfo.message,
          },
          `فشلت المحاولة ${attempt}/${OVERLOAD_MAX_RETRIES} للموديل ${currentModel} في final-review`
        );

        if (!overload) break;

        if (attempt < OVERLOAD_MAX_RETRIES) {
          const delay =
            OVERLOAD_BASE_DELAY_MS *
            Math.pow(OVERLOAD_BACKOFF_MULTIPLIER, attempt - 1);
          await sleep(delay);
        }
      }
    }

}

const providerInfo = resolveProviderErrorInfo(lastError);
return {
status: "error",
model: reviewModel,
apiVersion: FINAL_REVIEW_API_VERSION,
mode: FINAL_REVIEW_API_MODE,
importOpId: request.importOpId,
requestId,
commands: [],
message: `فشل final-review: ${providerInfo.message}${
      providerInfo.requestId ? ` (request_id=${providerInfo.requestId})` : ""
    }`,
latencyMs: Date.now() - startedAt,
meta: emptyMeta,
providerStatusCode: lastProviderStatus,
};
};

export const getFinalReviewRuntime = () => resolveFinalReviewRuntime();
export const getFinalReviewModel = () => resolveFinalReviewRuntime().resolvedModel;

تعديل: src/types/index.ts

أضف هذا السطر في آخر الملف:

export \* from "./final-review";

تعديل: src/extensions/paste-classifier-config.ts

أضف هذا البلوك بعد export const AGENT_REVIEW_ENDPOINT = resolveAgentReviewEndpoint();

export const resolveFinalReviewEndpoint = (): string => {
const explicit = (
process.env.NEXT_PUBLIC_FINAL_REVIEW_BACKEND_URL as string | undefined
)?.trim();
if (explicit) return normalizeEndpoint(explicit);

const fileImportEndpoint =
(
process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
)?.trim() ||
(process.env.NODE_ENV === "development"
? "http://127.0.0.1:8787/api/file-extract"
: "");
if (!fileImportEndpoint) return "";

const normalized = normalizeEndpoint(fileImportEndpoint);
if (normalized.endsWith("/api/file-extract")) {
return `${normalized.slice(0, -"/api/file-extract".length)}/api/final-review`;
}

return `${normalized}/api/final-review`;
};

export const FINAL_REVIEW_ENDPOINT = resolveFinalReviewEndpoint();

تعديل: server/routes/index.mjs

أضف هذه الـ imports أعلى الملف:

import { handleFinalReview } from "../controllers/final-review-controller.mjs";
import {
getFinalReviewModel,
getFinalReviewRuntime,
} from "../final-review.mjs";

داخل /health أضف:

const finalReviewRuntime = getFinalReviewRuntime();

ثم داخل JSON المعاد من /health أضف الحقول التالية:

finalReviewConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
finalReviewModel: getFinalReviewModel(),
finalReviewProvider: finalReviewRuntime.provider,
finalReviewModelRequested: finalReviewRuntime.requestedModel,
finalReviewModelResolved: finalReviewRuntime.resolvedModel,
finalReviewModelFallbackApplied: finalReviewRuntime.fallbackApplied,
finalReviewModelFallbackReason: finalReviewRuntime.fallbackReason,
finalReviewApiBaseUrl: finalReviewRuntime.baseUrl,
finalReviewApiVersion: finalReviewRuntime.apiVersion,

وأضف route جديدًا:

app.post("/api/final-review", reviewLimiter, handleFinalReview);

تعديل: src/extensions/paste-classifier.ts

أولًا: أضف هذه الـ imports

import {
buildFinalReviewSuspiciousLinePayload,
formatFinalReviewPacketText,
} from "@/final-review/payload-builder";
import {
DEFAULT_FINAL_REVIEW_SCHEMA_HINTS,
FINAL_REVIEW_PACKET_VERSION,
FINAL_REVIEW_SCHEMA_VERSION,
} from "@/types/final-review";
import type { PassStage, SuspicionCase } from "@/suspicion-engine/types";

بدل استيراد endpoint القديم للمراجعة النهائية، استخدم:

FINAL_REVIEW_ENDPOINT,

وتأكد أن نوع الطلب المستورد هو:

FinalReviewRequestPayload

لا:

AgentReviewRequestPayload

ثانيًا: أضف هذا البلوك قبل toValidAgentReviewMeta

interface ReviewRoutingStats {
countPass: number;
countLocalReview: number;
countAgentCandidate: number;
countAgentForced: number;
}

const EMBEDDED_NARRATIVE_SUSPICION_FLOOR = 96;

const countDistinctSignalFamilies = (suspicionCase: SuspicionCase): number =>
new Set(suspicionCase.signals.map((signal) => signal.family)).size;

const promoteHighSeverityMismatches = (
suspicionCases: readonly SuspicionCase[]
): SuspicionCase[] =>
suspicionCases.map((suspicionCase) => {
if (
suspicionCase.band === "agent-candidate" &&
suspicionCase.signals.some(
(signal) =>
signal.signalType === "alternative-pull" &&
signal.score >= EMBEDDED_NARRATIVE_SUSPICION_FLOOR &&
signal.suggestedType !== null &&
signal.suggestedType !== suspicionCase.classifiedLine.type
)
) {
return {
...suspicionCase,
band: "agent-forced" as const,
};
}
return suspicionCase;
});

const summarizeRoutingStats = (
totalReviewed: number,
suspicionCases: readonly SuspicionCase[]
): ReviewRoutingStats => {
const stats: ReviewRoutingStats = {
countPass: Math.max(0, totalReviewed - suspicionCases.length),
countLocalReview: 0,
countAgentCandidate: 0,
countAgentForced: 0,
};

for (const suspicionCase of suspicionCases) {
if (suspicionCase.band === "local-review") {
stats.countLocalReview += 1;
continue;
}
if (suspicionCase.band === "agent-candidate") {
stats.countAgentCandidate += 1;
continue;
}
if (suspicionCase.band === "agent-forced") {
stats.countAgentForced += 1;
}
}

return stats;
};

const shouldEscalateToAgent = (suspicionCase: SuspicionCase): boolean => {
if (suspicionCase.band === "agent-forced") return true;
if (suspicionCase.band !== "agent-candidate") return false;
if (suspicionCase.critical) return true;
if (suspicionCase.score >= 85) return true;
if (countDistinctSignalFamilies(suspicionCase) >= 2) return true;

return (
suspicionCase.primarySuggestedType !== null &&
suspicionCase.primarySuggestedType !== suspicionCase.classifiedLine.type
);
};

export const selectSuspiciousLinesForAgent = (
suspicionCases: readonly SuspicionCase[],
totalReviewed: number
): SuspicionCase[] => {
const forced = suspicionCases
.filter((suspicionCase) => suspicionCase.band === "agent-forced")
.sort((a, b) => b.score - a.score);

const candidates = suspicionCases
.filter(
(suspicionCase) =>
suspicionCase.band === "agent-candidate" &&
shouldEscalateToAgent(suspicionCase)
)
.sort((a, b) => b.score - a.score);

if (forced.length === 0 && candidates.length === 0) return [];

const maxToAgent = Math.max(
1,
Math.ceil(totalReviewed \* AGENT_REVIEW_MAX_RATIO)
);
if (forced.length >= maxToAgent) {
return forced;
}

const remainingSlots = Math.max(0, maxToAgent - forced.length);
return [...forced, ...candidates.slice(0, remainingSlots)];
};

ثالثًا: بعد تخزين \_sequenceOptimization داخل classifyLines أضف تخزين حالات الشك نفسها

(
classified as ClassifiedDraftWithId[] & {
\_sequenceOptimization?: SequenceOptimizationResult;
\_suspicionCases?: readonly SuspicionCase[];
}
).\_sequenceOptimization = \_seqOptResult;

(
classified as ClassifiedDraftWithId[] & {
\_sequenceOptimization?: SequenceOptimizationResult;
\_suspicionCases?: readonly SuspicionCase[];
}
).\_suspicionCases = \_suspicionResult.cases;

رابعًا: استبدل دالة الطلب HTTP بهذه النسخة

const requestFinalReviewHttp = async (
request: FinalReviewRequestPayload
): Promise<AgentReviewResponsePayload> => {
if (shouldSkipAgentReviewInRuntime()) {
agentReviewLogger.error("request-runtime-not-supported", {
sessionId: request.sessionId,
});
throw new Error(
"Agent review backend path is mandatory and requires a browser runtime."
);
}

if (!FINAL_REVIEW_ENDPOINT) {
agentReviewLogger.error("request-missing-endpoint", {
sessionId: request.sessionId,
});
throw new Error(
"عنوان خادم المراجعة غير مضبوط — تأكد من ضبط VITE_FILE_IMPORT_BACKEND_URL في ملف .env"
);
}

let lastError: unknown = null;
const startedAt = Date.now();
const deadlineAt = startedAt + AGENT_REVIEW_DEADLINE_MS;

for (let attempt = 1; attempt <= AGENT_REVIEW_MAX_ATTEMPTS; attempt += 1) {
const remainingBeforeAttempt = deadlineAt - Date.now();
if (remainingBeforeAttempt <= 0) {
throw new Error(
`Agent review exceeded deadline (${AGENT_REVIEW_DEADLINE_MS}ms).`
);
}

    if (pendingAgentAbortController) {
      pendingAgentAbortController.abort();
    }
    const controller = new AbortController();
    pendingAgentAbortController = controller;
    const timeoutForAttempt = Math.min(
      AGENT_REVIEW_MAX_TIMEOUT_MS,
      Math.max(AGENT_REVIEW_MIN_TIMEOUT_MS, remainingBeforeAttempt - 200)
    );

    try {
      const response = await fetchWithTimeout(
        FINAL_REVIEW_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        },
        controller,
        timeoutForAttempt
      );

      if (!response.ok) {
        const body = await response.text();
        const isRetryable = isRetryableHttpStatus(response.status);
        agentReviewLogger.error("request-http-error", {
          sessionId: request.sessionId,
          status: response.status,
          body,
          attempt,
          isRetryable,
        });
        if (isRetryable && attempt < AGENT_REVIEW_MAX_ATTEMPTS) {
          const isOverload =
            response.status === 429 ||
            response.status === 529 ||
            response.status === 503;
          const delay = isOverload
            ? Math.max(AGENT_REVIEW_RETRY_DELAY_MS * attempt * 4, 3_000)
            : AGENT_REVIEW_RETRY_DELAY_MS * attempt;
          await waitBeforeRetry(delay);
          continue;
        }
        throw new Error(
          `Agent review route failed (${response.status}): ${body}`
        );
      }

      const responseText = await response.text();
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(responseText);
      } catch {
        parsedPayload = responseText;
      }
      const payload = normalizeAgentReviewPayload(parsedPayload, responseText);
      agentReviewLogger.telemetry("request-response", {
        sessionId: request.sessionId,
        status: payload.status,
        commands: payload.commands?.length ?? 0,
        model: payload.model,
        latencyMs: payload.latencyMs,
        apiVersion: payload.apiVersion,
        mode: payload.mode,
        requestedCount: payload.meta?.requestedCount ?? 0,
        commandCount: payload.meta?.commandCount ?? 0,
        unresolvedForced: payload.meta?.unresolvedForcedItemIds?.length ?? 0,
        attempt,
      });
      if (payload.status === "error") {
        const requestIdSuffix = payload.requestId
          ? ` [requestId=${payload.requestId}]`
          : "";
        throw new Error(
          `Agent review status is ${payload.status}${requestIdSuffix}: ${payload.message}`
        );
      }
      return payload;
    } catch (error) {
      lastError = error;
      const aborted = (error as DOMException)?.name === "AbortError";
      const network = error instanceof TypeError;
      const retryable = aborted || network;
      const remainingAfterAttempt = deadlineAt - Date.now();

      const isAgentStatusError =
        error instanceof Error &&
        error.message.startsWith("Agent review status is ");

      if (aborted) {
        agentReviewLogger.warn("request-aborted", {
          sessionId: request.sessionId,
          attempt,
          timeoutForAttempt,
          remainingAfterAttempt,
        });
      } else if (network) {
        agentReviewLogger.warn("request-network-error", {
          sessionId: request.sessionId,
          attempt,
          error: error.message,
          remainingAfterAttempt,
        });
      } else if (isAgentStatusError) {
        agentReviewLogger.error("request-agent-status-error", {
          sessionId: request.sessionId,
          attempt,
          error: (error as Error).message,
          remainingAfterAttempt,
        });
      } else {
        agentReviewLogger.error("request-unhandled-error", {
          sessionId: request.sessionId,
          attempt,
          error,
          remainingAfterAttempt,
        });
      }

      if (
        retryable &&
        attempt < AGENT_REVIEW_MAX_ATTEMPTS &&
        remainingAfterAttempt > AGENT_REVIEW_MIN_TIMEOUT_MS
      ) {
        await waitBeforeRetry(AGENT_REVIEW_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw error;
    } finally {
      if (pendingAgentAbortController === controller) {
        pendingAgentAbortController = null;
      }
    }

}

throw new Error(
`Agent review request failed after ${AGENT_REVIEW_MAX_ATTEMPTS} attempts and ${Date.now() - startedAt}ms: ${String(lastError)}`
);
};

خامسًا: غيّر توقيع buildAgentReviewMetaFallback فقط ليصبح:

const buildAgentReviewMetaFallback = (
requestPayload: FinalReviewRequestPayload,
commands: readonly AgentCommand[],
classified: readonly ClassifiedDraftWithId[]
): AgentReviewResponseMeta => {

سادسًا: داخل applyRemoteAgentReviewV2 استبدل بداية من أول سطر داخل الدالة وحتى إنشاء requestPayload بهذا البلوك

const applyRemoteAgentReviewV2 = async (
classified: ClassifiedDraftWithId[]
): Promise<ClassifiedDraftWithId[]> => {
if (classified.length === 0) return classified;

const storedState = classified as ClassifiedDraftWithId[] & {
\_sequenceOptimization?: SequenceOptimizationResult;
\_suspicionCases?: readonly SuspicionCase[];
};
const storedSeqOpt = storedState.\_sequenceOptimization;
const storedSuspicionCases = storedState.\_suspicionCases ?? [];

const promotedSuspicionCases = promoteHighSeverityMismatches(
storedSuspicionCases
);
const routingStats = summarizeRoutingStats(
classified.length,
promotedSuspicionCases
);
const selectedForAgent = selectSuspiciousLinesForAgent(
promotedSuspicionCases,
classified.length
);
const selectedItemIndexesPreview = toUniqueSortedIndexes(
selectedForAgent.map((suspicionCase) => suspicionCase.lineIndex)
);
const forcedItemIndexesPreview = toUniqueSortedIndexes(
selectedForAgent
.filter((suspicionCase) => suspicionCase.band === "agent-forced")
.map((suspicionCase) => suspicionCase.lineIndex)
);

const suspectSnapshots = selectedForAgent.map((suspicionCase) => ({
itemIndex: suspicionCase.lineIndex,
assignedType: suspicionCase.classifiedLine.type,
routingBand: suspicionCase.band,
suspicionScore: suspicionCase.score,
primarySuggestedType: suspicionCase.primarySuggestedType,
reason: suspicionCase.signals[0]?.message ?? "",
}));

agentReviewLogger.telemetry("packet-built", {
totalReviewed: classified.length,
totalSuspicious: promotedSuspicionCases.length,
suspicionRate:
classified.length > 0
? promotedSuspicionCases.length / classified.length
: 0,
...routingStats,
countSentToAgent: selectedForAgent.length,
sentItemIndexes: selectedItemIndexesPreview,
forcedItemIndexes: forcedItemIndexesPreview,
viterbiDisagreements: storedSeqOpt?.disagreements?.length ?? 0,
});
if (suspectSnapshots.length > 0) {
agentReviewLogger.debug("packet-suspects-snapshot", {
lines: suspectSnapshots,
});
}
if (selectedForAgent.length === 0) {
agentReviewLogger.info("packet-empty-forwarded", {
...routingStats,
countSentToAgent: 0,
});
return classified;
}

const suspiciousPayload = selectedForAgent
.map((suspicionCase) => {
const item = classified[suspicionCase.lineIndex];
if (!item || !item.\_itemId) return null;

      const assignedType = elementTypeToLineType(item.type);
      if (!REVIEWABLE_AGENT_TYPES.has(assignedType)) return null;

      return buildFinalReviewSuspiciousLinePayload({
        suspicionCase,
        classified,
        itemId: item._itemId,
        fingerprint: computeFingerprintSync(assignedType, item.text),
      });
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

if (suspiciousPayload.length === 0) {
agentReviewLogger.info("packet-empty-after-filtering-forwarded", {
totalSuspicious: promotedSuspicionCases.length,
...routingStats,
countSentToAgent: 0,
});
return classified;
}

const packetItems = suspiciousPayload.map((entry) =>
prepareItemForPacket(
entry.itemId,
entry.text,
entry.suspicionScore,
entry.routingBand === "agent-forced",
DEFAULT_PACKET_BUDGET
)
);
const packetResult = buildPacketWithBudget(
packetItems,
DEFAULT_PACKET_BUDGET
);
if (packetResult.wasTruncated) {
const includedIds = new Set(packetResult.included.map((i) => i.itemId));
agentReviewLogger.warn("packet-budget-truncated", {
originalCount: suspiciousPayload.length,
includedCount: packetResult.included.length,
overflowCount: packetResult.overflow.length,
totalEstimatedChars: packetResult.totalEstimatedChars,
});
suspiciousPayload.splice(
0,
suspiciousPayload.length,
...suspiciousPayload.filter((entry) => includedIds.has(entry.itemId))
);
}

if (suspiciousPayload.length === 0) {
agentReviewLogger.warn("packet-empty-after-budget-truncation", {
totalSuspicious: promotedSuspicionCases.length,
originalSelectedCount: selectedForAgent.length,
});
return classified;
}

const sentItemIds = toNormalizedMetaIds(
suspiciousPayload.map((entry) => entry.itemId)
);
const forcedItemIds = toNormalizedMetaIds(
suspiciousPayload
.filter((entry) => entry.routingBand === "agent-forced")
.map((entry) => entry.itemId)
);
const emitAgentReviewSummary = (payload: {
status: string;
requestId: string;
commandsReceived: number;
commandsApplied: number;
}): void => {
agentReviewLogger.telemetry("agent-review-summary", {
totalReviewed: classified.length,
totalSuspicious: promotedSuspicionCases.length,
itemsSent: suspiciousPayload.length,
commandsReceived: payload.commandsReceived,
commandsApplied: payload.commandsApplied,
status: payload.status,
requestId: payload.requestId,
});
};

const importOpId = generateItemId();

const opState = createImportOperationState(importOpId, "paste");
for (const entry of suspiciousPayload) {
opState.snapshots.set(entry.itemId, {
itemId: entry.itemId,
fingerprint: entry.fingerprint,
type: entry.assignedType,
rawText: entry.text,
} satisfies ItemSnapshot);
}

pipelineTelemetry.recordIngestionStart(importOpId, {
source: "paste",
trustLevel: "raw_text",
itemsProcessed: classified.length,
});

const requestPayload: FinalReviewRequestPayload = {
packetVersion: FINAL_REVIEW_PACKET_VERSION,
schemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
sessionId: `paste-${Date.now()}`,
importOpId,
totalReviewed: classified.length,
reviewPacketText: formatFinalReviewPacketText({
totalReviewed: classified.length,
requiredItemIds: sentItemIds,
forcedItemIds,
suspiciousLines: suspiciousPayload,
}),
suspiciousLines: suspiciousPayload,
requiredItemIds: sentItemIds,
forcedItemIds,
schemaHints: DEFAULT_FINAL_REVIEW_SCHEMA_HINTS,
};

باقي الدالة بعد requestPayload يظل كما هو، مع استدعاء:

response = await requestFinalReviewHttp(requestPayload);
