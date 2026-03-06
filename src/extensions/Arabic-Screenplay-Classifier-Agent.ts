/**
 * @module extensions/Arabic-Screenplay-Classifier-Agent
 * @description محول Filmlane للعميل — يحول استجابات الوكيل v2 إلى أوامر قابلة للتطبيق
 *
 * الإصدار: 2.0 (client transport v2)
 *
 * المسؤوليات:
 * 1. تحليل نص استجابة الوكيل الخام وتحويله إلى AgentCommand[]
 * 2. التحقق من صحة الأوامر مقابل معايير صارمة
 * 3. تطبيع القيم (confidence clamping, reason defaults)
 *
 * ملاحظة:
 * - الباكإند يتولى تنفيذ الأوامر
 * - هذا الملف يعمل كـ parser/validator للعميل فقط
 * - لا decisions[] في هذا الإصدار — فقط commands[]
 */

import type {
  AgentCommand,
  RelabelCommand,
  SplitCommand,
} from "../types/agent-review";
import { AGENT_API_VERSION, AGENT_API_MODE } from "../types/agent-review";
import type { LineType } from "../types/screenplay";

// ─── الثوابت والإعدادات ────────────────────────────────────────────

/** معرف موديل Claude الافتراضي المستخدم في الطلبات */
export const MODEL_ID = "claude-haiku-4-5-20251001";

/**
 * واجهة النتيجة المتوافقة — للتوافقية مع الأكواد السابقة التي قد تتوقع هذا الشكل
 *
 * @property result - رسالة وصفية عن نتيجة المعالجة
 * @property outputFile - مسار الملف المُنتج (null إذا لم ينتج ملف)
 */
export interface ProcessFileResult {
  result: string;
  outputFile: string | null;
}

/**
 * مجموعة أنواع السطور المسموحة للتصحيح
 * تُستخدم في التحقق من صحة الأوامر
 */
const ALLOWED_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "scene_header_top_line",
  "transition",
  "parenthetical",
  "basmala",
]);

// ─── دوال الأداة ────────────────────────────────────────────────────

/**
 * تطبيع قيمة confidence إلى النطاق [0, 1]
 *
 * @param value - القيمة الأولية (قد تكون NaN أو خارج النطاق)
 * @returns القيمة المطبّعة بين 0 و 1
 *
 * @example
 * clampConfidence(1.5)  // → 1
 * clampConfidence(-0.5) // → 0
 * clampConfidence(NaN)  // → 0.5
 */
const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

/**
 * يتحقق مما إذا كان النص string غير فارغ بعد التقليم
 *
 * @param text - النص المراد التحقق منه
 * @returns true إذا كان غير فارغ
 */
const isNonEmptyString = (text: unknown): text is string => {
  return typeof text === "string" && text.trim().length > 0;
};

/**
 * يتحقق مما إذا كان النوع نوع سطر صحيح ومسموح
 *
 * @param type - النوع المراد التحقق منه
 * @returns true إذا كان نوعاً صحيحاً
 */
const isValidLineType = (type: unknown): type is LineType => {
  return ALLOWED_LINE_TYPES.has(type as LineType);
};

// ─── معالج الأوامر v2 ──────────────────────────────────────────────

/**
 * محلل استجابة الوكيل الخام إلى مصفوفة أوامر v2 مُحققة
 *
 * يحاول:
 * 1. تحليل JSON مباشرة
 * 2. البحث عن أول { وآخر } كـ fallback
 * 3. قبول البنية: `{ commands: [...] }` أو مصفوفة مباشرة
 * 4. التحقق من كل أمر بصرامة
 * 5. تطبيع القيم (confidence, reason defaults)
 *
 * @param rawText - نص استجابة الوكيل الخام
 * @returns مصفوفة AgentCommand[] محققة (قد تكون فارغة إذا فشل التحليل)
 *
 * @throws لا يرمي أخطاء — يعيد مصفوفة فارغة عند الفشل
 *
 * @example
 * const text = '{ "commands": [{ "op": "relabel", "itemId": "uuid-1", "newType": "dialogue", "confidence": 0.95, "reason": "الحوار واضح" }] }';
 * const commands = parseReviewCommands(text);
 * // → [{ op: "relabel", itemId: "uuid-1", newType: "dialogue", confidence: 0.95, reason: "الحوار واضح" }]
 */
export const parseReviewCommands = (rawText: string): AgentCommand[] => {
  const source = rawText.trim();
  if (!source) return [];

  /**
   * دالة داخلية لمحاولة تحليل candidate واحد
   */
  const parseCandidate = (candidate: string): AgentCommand[] => {
    const parsed = JSON.parse(candidate) as unknown;

    // قد يكون المتجزأ مصفوفة مباشرة أو كائن بـ commands property
    let commandsArray: unknown[];
    if (Array.isArray(parsed)) {
      commandsArray = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      "commands" in parsed &&
      Array.isArray((parsed as Record<string, unknown>).commands)
    ) {
      commandsArray = (parsed as Record<string, unknown>).commands as unknown[];
    } else {
      commandsArray = [];
    }

    const normalized: AgentCommand[] = [];

    for (const cmd of commandsArray) {
      if (!cmd || typeof cmd !== "object") continue;

      const record = cmd as Record<string, unknown>;
      const op = record.op as string | undefined;

      // ─── التحقق من نوع الأمر ───
      if (!op || !["relabel", "split"].includes(op)) continue;

      // ─── التحقق من itemId ───
      if (!isNonEmptyString(record.itemId)) continue;
      const itemId = (record.itemId as string).trim();

      // ─── التحقق من confidence ───
      const confidenceRaw =
        typeof record.confidence === "number" ? record.confidence : 0.5;
      const confidence = clampConfidence(confidenceRaw);

      // ─── التحقق من reason ───
      const reason = isNonEmptyString(record.reason)
        ? (record.reason as string).trim()
        : "بدون سبب";

      // ─── معالجة أوامر relabel ───
      if (op === "relabel") {
        const newType = record.newType as unknown;

        if (!isValidLineType(newType)) continue;

        const relabelCmd: RelabelCommand = {
          op: "relabel",
          itemId,
          newType,
          confidence,
          reason,
        };
        normalized.push(relabelCmd);
        continue;
      }

      // ─── معالجة أوامر split ───
      if (op === "split") {
        const splitAt =
          typeof record.splitAt === "number" ? Math.trunc(record.splitAt) : -1;
        const leftType = record.leftType as unknown;
        const rightType = record.rightType as unknown;

        // تحقق من أن splitAt غير سالب
        if (splitAt < 0) continue;

        // تحقق من أن leftType و rightType صحيحان
        if (!isValidLineType(leftType) || !isValidLineType(rightType)) continue;

        const splitCmd: SplitCommand = {
          op: "split",
          itemId,
          splitAt,
          leftType,
          rightType,
          confidence,
          reason,
        };
        normalized.push(splitCmd);
        continue;
      }
    }

    return normalized;
  };

  // ─── محاولة التحليل المباشر ───
  try {
    return parseCandidate(source);
  } catch {
    // fallback: البحث عن أول { وآخر }
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return [];
    }

    try {
      return parseCandidate(source.slice(start, end + 1));
    } catch {
      // فشل التحليل نهائياً
      return [];
    }
  }
};

// ─── Client Transport Functions ─────────────────────────────────

import type {
  AgentReviewRequestPayload,
  AgentReviewResponsePayload,
  AgentSuspiciousLinePayload,
} from "../types/agent-review";
import { logger } from "../utils/logger";

const clientLogger = logger.createScope("agent-review-client");

/** endpoint للـ agent review */
const AGENT_REVIEW_ENDPOINT =
  (process.env.NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL as string | undefined) ??
  "http://127.0.0.1:8787/api/agent/review";

/**
 * إرسال طلب مراجعة إلى الوكيل (Client Transport)
 *
 * @param payload - بيانات الطلب
 * @returns استجابة الوكيل
 */
export const requestAgentReview = async (payload: {
  importOpId: string;
  sessionId: string;
  items: Array<{
    itemId: string;
    type: LineType;
    text: string;
    fingerprint: string;
  }>;
  requiredItemIds: string[];
  forcedItemIds: string[];
  context?: { source: string; totalItems: number };
}): Promise<AgentReviewResponsePayload> => {
  clientLogger.info("sending-agent-review-request", {
    sessionId: payload.sessionId,
    importOpId: payload.importOpId,
    itemCount: payload.items.length,
  });

  // تحويل items إلى suspiciousLines
  const suspiciousLines: AgentSuspiciousLinePayload[] = payload.items.map(
    (item, index) => ({
      itemId: item.itemId,
      lineIndex: index,
      text: item.text,
      assignedType: item.type,
      fingerprint: item.fingerprint,
      totalSuspicion: payload.forcedItemIds.includes(item.itemId) ? 100 : 50,
      reasons: payload.forcedItemIds.includes(item.itemId)
        ? ["forced-item"]
        : ["suspicious"],
      contextLines: [],
    })
  );

  const request: AgentReviewRequestPayload = {
    importOpId: payload.importOpId,
    sessionId: payload.sessionId,
    totalReviewed: payload.context?.totalItems ?? payload.items.length,
    suspiciousLines,
    requiredItemIds: payload.requiredItemIds,
    forcedItemIds: payload.forcedItemIds,
  };

  try {
    const response = await fetch(AGENT_REVIEW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      clientLogger.warn("agent-review-http-error", {
        status: response.status,
        statusText: response.statusText,
        endpoint: AGENT_REVIEW_ENDPOINT,
        body: errorText,
      });
      throw new Error(`Agent review failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as AgentReviewResponsePayload;

    clientLogger.info("agent-review-response-received", {
      requestId: data.requestId,
      status: data.status,
      commandCount: data.commands?.length ?? 0,
    });

    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    clientLogger.warn("agent-review-request-failed", {
      endpoint: AGENT_REVIEW_ENDPOINT,
      error: errorMsg,
    });

    // إرجاع استجابة خطأ
    return {
      status: "error",
      message: errorMsg,
      commands: [],
      latencyMs: 0,
      importOpId: payload.importOpId,
      requestId: crypto.randomUUID(),
      apiVersion: AGENT_API_VERSION,
      mode: AGENT_API_MODE,
    };
  }
};
