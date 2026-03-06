/**
 * @module extensions/ai-doubt-layer
 * @description
 * طبقة كشف الشبهة المُعزَّزة بـ Gemini 3.1 Flash-Lite — Frontend integration.
 *
 * تستدعي Backend route عبر SSE وتستقبل أحكام streaming
 * ثم تطبّق التصحيحات على المحرر تدريجياً عبر ProgressiveUpdateSession.
 *
 * يُصدّر:
 * - {@link requestDoubtResolution} — الدالة الرئيسية لاستدعاء طبقة الشبهة
 * - {@link DoubtResolutionResult} — نتيجة عملية حل الشبهة
 */

import type { EditorView } from "@tiptap/pm/view";
import type { SuspiciousLine } from "./classification-types";
import type {
  AICorrectionCommand,
  ProgressiveUpdateSession,
} from "./ai-progressive-updater";
import { isElementType } from "./classification-types";
import type { ElementType } from "./classification-types";
import { logger } from "../utils/logger";

// ─── الأنواع ──────────────────────────────────────────────────────

/** نتيجة عملية حل الشبهة */
export interface DoubtResolutionResult {
  readonly success: boolean;
  readonly totalVerdicts: number;
  readonly appliedCorrections: number;
  readonly confirmedCount: number;
  readonly relabeledCount: number;
  readonly latencyMs: number;
  readonly error?: string;
}

/** خيارات استدعاء طبقة الشبهة */
export interface DoubtResolutionOptions {
  /** معرف الجلسة */
  readonly sessionId: string;
  /** السطور المشبوهة من PostClassificationReviewer */
  readonly suspiciousLines: readonly SuspiciousLine[];
  /** جلسة التحديث التدريجي */
  readonly updateSession: ProgressiveUpdateSession;
  /** EditorView للتطبيق */
  readonly view: EditorView;
  /** AbortSignal للإلغاء */
  readonly signal?: AbortSignal;
}

// ─── الثوابت ──────────────────────────────────────────────────────

const doubtLogger = logger.createScope("ai-doubt-layer");

/** عنوان الـ endpoint — يُقرأ من متغيرات البيئة */
const resolveDoubtEndpoint = (): string => {
  const envValue = (
    process.env.NEXT_PUBLIC_AI_DOUBT_ENDPOINT as string | undefined
  )?.trim();
  if (envValue) return envValue;

  // fallback: نستخرج origin فقط (scheme + host + port) من URL الباك اند
  const backendUrl = (
    process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
  )?.trim();
  if (backendUrl) {
    try {
      const origin = new URL(backendUrl).origin;
      return `${origin}/api/ai/doubt-resolve`;
    } catch {
      // URL غير صالح — نكمل للـ default
    }
  }

  return "http://127.0.0.1:8787/api/ai/doubt-resolve";
};

/** هل الطبقة مفعّلة */
const isDoubtLayerEnabled = (): boolean => {
  const rawValue = (
    process.env.NEXT_PUBLIC_AI_DOUBT_ENABLED as string | undefined
  )
    ?.trim()
    .toLowerCase();
  if (!rawValue) return true; // مفعّلة بالـ default
  return !["0", "false", "off", "no"].includes(rawValue);
};

// ─── SSE Parser ───────────────────────────────────────────────────

/**
 * يقرأ SSE stream ويستخرج الأحداث.
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        if (!rawEvent.trim()) continue;

        let eventType = "message";
        let data = "";

        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (data) {
          yield { event: eventType, data };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── تحويل SuspiciousLine للـ backend payload ─────────────────────

const toSuspiciousPayload = (
  lines: readonly SuspiciousLine[]
): Array<{
  lineIndex: number;
  text: string;
  assignedType: string;
  totalSuspicion: number;
  reasons: string[];
  contextLines: Array<{
    lineIndex: number;
    assignedType: string;
    text: string;
  }>;
}> =>
  lines.map((suspicious) => ({
    lineIndex: suspicious.line.lineIndex,
    text: suspicious.line.text,
    assignedType: suspicious.line.assignedType,
    totalSuspicion: suspicious.totalSuspicion,
    reasons: suspicious.findings.map((f) => f.reason),
    contextLines: suspicious.contextLines.map((ctx) => ({
      lineIndex: ctx.lineIndex,
      assignedType: ctx.assignedType,
      text: ctx.text,
    })),
  }));

// ─── الدالة الرئيسية ─────────────────────────────────────────────

/**
 * يستدعي طبقة كشف الشبهة المُعزَّزة بـ Gemini 3.1 Flash-Lite.
 *
 * يرسل السطور المشبوهة للـ backend،
 * يستقبل أحكام streaming،
 * ويطبّق التصحيحات (relabel فقط) على المحرر تدريجياً.
 */
export const requestDoubtResolution = async (
  options: DoubtResolutionOptions
): Promise<DoubtResolutionResult> => {
  const { sessionId, suspiciousLines, updateSession, view, signal } = options;

  if (!isDoubtLayerEnabled()) {
    return {
      success: true,
      totalVerdicts: 0,
      appliedCorrections: 0,
      confirmedCount: 0,
      relabeledCount: 0,
      latencyMs: 0,
    };
  }

  if (suspiciousLines.length === 0) {
    return {
      success: true,
      totalVerdicts: 0,
      appliedCorrections: 0,
      confirmedCount: 0,
      relabeledCount: 0,
      latencyMs: 0,
    };
  }

  const endpoint = resolveDoubtEndpoint();
  const startedAt = Date.now();
  let totalVerdicts = 0;
  let appliedCorrections = 0;
  let confirmedCount = 0;
  let relabeledCount = 0;

  try {
    doubtLogger.info("doubt-resolve-request", {
      sessionId,
      suspiciousCount: suspiciousLines.length,
      endpoint,
    });

    const payload = {
      sessionId,
      suspiciousLines: toSuspiciousPayload(suspiciousLines),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Doubt resolve failed (${response.status}): ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null — SSE not supported.");
    }

    const reader = response.body.getReader();

    for await (const sseEvent of parseSSEStream(reader, signal)) {
      if (view.isDestroyed || updateSession.status === "aborted") break;

      if (sseEvent.event === "verdict") {
        try {
          const verdict = JSON.parse(sseEvent.data);
          totalVerdicts += 1;

          if (verdict.verdict === "confirm") {
            confirmedCount += 1;
            // confirm = التصنيف الحالي صح — لا تغيير
          } else if (
            verdict.verdict === "relabel" &&
            typeof verdict.correctedType === "string" &&
            isElementType(verdict.correctedType)
          ) {
            relabeledCount += 1;

            const command: AICorrectionCommand = {
              lineIndex: verdict.lineIndex,
              correctedType: verdict.correctedType as ElementType,
              confidence: verdict.confidence ?? 0.8,
              reason: verdict.reason ?? "",
              source: "gemini-doubt",
            };

            if (updateSession.applyCorrection(view, command)) {
              appliedCorrections += 1;
            }
          }
        } catch {
          // تجاهل JSON غير صالح
        }
      } else if (sseEvent.event === "error") {
        try {
          const errorData = JSON.parse(sseEvent.data);
          doubtLogger.error("doubt-resolve-stream-error", {
            sessionId,
            message: errorData.message,
          });
        } catch {
          // تجاهل
        }
      } else if (sseEvent.event === "done") {
        doubtLogger.info("doubt-resolve-stream-done", {
          sessionId,
          totalVerdicts,
          appliedCorrections,
          confirmedCount,
          relabeledCount,
        });
      }
    }

    const latencyMs = Date.now() - startedAt;
    return {
      success: true,
      totalVerdicts,
      appliedCorrections,
      confirmedCount,
      relabeledCount,
      latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort =
      error instanceof DOMException && error.name === "AbortError";

    if (!isAbort) {
      doubtLogger.error("doubt-resolve-failed", {
        sessionId,
        error: message,
      });
    }

    return {
      success: false,
      totalVerdicts,
      appliedCorrections,
      confirmedCount,
      relabeledCount,
      latencyMs: Date.now() - startedAt,
      error: message,
    };
  }
};
