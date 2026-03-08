import { isElementType } from "@/extensions/classification-types";
import type {
  ResolutionOutcome,
  ResolutionStatus,
  SuspicionCase,
} from "@/suspicion-engine/types";

/**
 * @module adapters/from-ai-verdict
 * @description
 * محوّل استجابة AI الخام إلى نتيجة حل مكتوبة بدقة.
 *
 * يُجري التحقق اليدوي من صحة الاستجابة ويُحوّلها إلى ResolutionOutcome.
 * الاستجابات الخاطئة أو منخفضة الثقة تُؤجّل تلقائياً.
 */

const VALID_ACTIONS = new Set<string>([
  "relabel",
  "confirm",
  "repair-and-reclassify",
]);

function mapActionToStatus(actionRequired: string): ResolutionStatus {
  if (actionRequired === "relabel") return "relabel";
  if (actionRequired === "confirm") return "confirmed";
  if (actionRequired === "repair-and-reclassify")
    return "repair-and-reclassify";
  return "deferred";
}

/**
 * يُحوّل استجابة AI الخام إلى نتيجة حل.
 *
 * قواعد التحقق:
 * - suggestedType يجب أن يكون ElementType صالح
 * - confidence يجب أن يكون رقماً بين 0 و 1
 * - actionRequired يجب أن يكون إحدى القيم المقبولة
 *
 * إذا كانت الثقة > 0.8 → يُطبّق الإجراء المناسب
 * إذا كانت الثقة ≤ 0.8 → يُؤجّل
 * إذا فشل التحقق → يُؤجّل مع confidence = null
 *
 * @param raw - الاستجابة الخام من AI (Record<string, unknown>)
 * @param suspicionCase - حالة الاشتباه الأصلية
 * @returns نتيجة الحل
 */
export function parseAIVerdict(
  raw: Record<string, unknown>,
  suspicionCase: SuspicionCase
): ResolutionOutcome {
  const { lineIndex, signals } = suspicionCase;

  const evidenceUsed = signals.map((s) => s.signalId);

  // ── التحقق من suggestedType ───────────────────────────────────────────────
  const rawSuggestedType = raw["suggestedType"];
  if (
    typeof rawSuggestedType !== "string" ||
    !isElementType(rawSuggestedType)
  ) {
    return {
      lineIndex,
      status: "deferred",
      correctedType: null,
      confidence: null,
      resolverName: "remote-ai",
      evidenceUsed,
      appliedAt: null,
    };
  }

  // ── التحقق من confidence ──────────────────────────────────────────────────
  const rawConfidence = raw["confidence"];
  if (
    typeof rawConfidence !== "number" ||
    rawConfidence < 0 ||
    rawConfidence > 1 ||
    !Number.isFinite(rawConfidence)
  ) {
    return {
      lineIndex,
      status: "deferred",
      correctedType: null,
      confidence: null,
      resolverName: "remote-ai",
      evidenceUsed,
      appliedAt: null,
    };
  }

  // ── التحقق من actionRequired ──────────────────────────────────────────────
  const rawAction = raw["actionRequired"];
  if (typeof rawAction !== "string" || !VALID_ACTIONS.has(rawAction)) {
    return {
      lineIndex,
      status: "deferred",
      correctedType: null,
      confidence: null,
      resolverName: "remote-ai",
      evidenceUsed,
      appliedAt: null,
    };
  }

  // ── تطبيق قاعدة الثقة ────────────────────────────────────────────────────
  if (rawConfidence <= 0.8) {
    return {
      lineIndex,
      status: "deferred",
      correctedType: rawSuggestedType,
      confidence: rawConfidence,
      resolverName: "remote-ai",
      evidenceUsed,
      appliedAt: "post-render",
    };
  }

  const status = mapActionToStatus(rawAction);

  return {
    lineIndex,
    status,
    correctedType: rawSuggestedType,
    confidence: rawConfidence,
    resolverName: "remote-ai",
    evidenceUsed,
    appliedAt: "post-render",
  };
}
